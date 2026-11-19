package fellowmage.gateway;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mage.cards.decks.DeckCardInfo;
import mage.cards.decks.DeckCardLists;

import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Operações do editor de decks: resumo para a tela inicial, conversão deck <-> JSON do editor
 * e importação de listas em texto (Moxfield, Archidekt, Arena/MTGO, .dck).
 */
public final class DeckService {

    private static final List<String> COLOR_ORDER = List.of("W", "U", "B", "R", "G");

    private final DeckLibrary library;
    private final CardCatalog catalog;
    private final MoxfieldSync moxfield;
    // um deck do Moxfield é sincronizado por vez, mesmo com vários navegadores abertos
    private final Object syncLock = new Object();
    private final ExecutorService syncWorker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "moxfield-sync");
        t.setDaemon(true);
        return t;
    });

    public DeckService(DeckLibrary library, CardCatalog catalog) {
        this.library = library;
        this.catalog = catalog;
        this.moxfield = new MoxfieldSync(library.getUserRoot());
    }

    // ------------------------------------------------------------------ resumo (tela inicial / lista de decks)

    public List<Map<String, Object>> userDeckSummaries() {
        List<Map<String, Object>> res = new ArrayList<>();
        for (String path : library.listUser()) {
            try {
                res.add(summary(path, library.load(path)));
            } catch (IOException e) {
                Map<String, Object> broken = new LinkedHashMap<>();
                broken.put("path", path);
                broken.put("name", path.substring(DeckLibrary.USER_PREFIX.length()));
                broken.put("error", e.getMessage());
                putMoxfield(broken, path);
                res.add(broken);
            }
        }
        return res;
    }

    private Map<String, Object> summary(String path, DeckCardLists deck) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("path", path);
        m.put("name", deck.getName());
        int count = deck.getCards().stream().mapToInt(DeckCardInfo::getAmount).sum()
                + deck.getSideboard().stream().mapToInt(DeckCardInfo::getAmount).sum();
        m.put("count", count);
        List<Map<String, Object>> commanders = new ArrayList<>();
        Set<String> identity = new LinkedHashSet<>();
        for (DeckCardInfo c : deck.getSideboard()) {
            Map<String, Object> cm = new LinkedHashMap<>();
            cm.put("name", c.getCardName());
            cm.put("set", c.getSetCode());
            cm.put("num", c.getCardNumber());
            commanders.add(cm);
            CardCatalog.Entry e = entryFor(c);
            if (e != null) {
                identity.addAll(e.identity);
            }
        }
        m.put("commanders", commanders);
        m.put("identity", COLOR_ORDER.stream().filter(identity::contains).toArray());
        putMoxfield(m, path);
        return m;
    }

    private void putMoxfield(Map<String, Object> m, String path) {
        MoxfieldSync.Link link = moxfield.get(path);
        if (link == null) {
            return;
        }
        Map<String, Object> mx = new LinkedHashMap<>();
        mx.put("url", link.url());
        mx.put("updated", link.remoteUpdated);
        mx.put("lastCheck", link.lastCheck);
        mx.put("error", link.error);
        mx.put("missing", link.missing);
        m.put("moxfield", mx);
    }

    // ------------------------------------------------------------------ deck <-> JSON do editor

    public Map<String, Object> toEditor(String path) throws IOException {
        DeckCardLists deck = library.load(path);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("path", path);
        m.put("readOnly", !path.startsWith(DeckLibrary.USER_PREFIX));
        MoxfieldSync.Link link = moxfield.get(path);
        if (link != null) {
            m.put("moxfieldUrl", link.url());
        }
        m.put("name", deck.getName());
        m.put("commanders", entries(deck.getSideboard()));
        m.put("cards", entries(deck.getCards()));
        return m;
    }

    private List<Map<String, Object>> entries(List<DeckCardInfo> list) {
        // agrupa linhas repetidas da mesma impressão
        Map<String, Map<String, Object>> byKey = new LinkedHashMap<>();
        for (DeckCardInfo c : list) {
            String key = (c.getSetCode() + ":" + c.getCardNumber() + ":" + c.getCardName()).toLowerCase(Locale.ROOT);
            Map<String, Object> existing = byKey.get(key);
            if (existing != null) {
                existing.put("qty", (Integer) existing.get("qty") + c.getAmount());
                continue;
            }
            byKey.put(key, cardJson(entryFor(c), c.getCardName(), c.getSetCode(), c.getCardNumber(), c.getAmount()));
        }
        return new ArrayList<>(byKey.values());
    }

    private CardCatalog.Entry entryFor(DeckCardInfo c) {
        CardCatalog.Entry e = catalog.findPrinting(c.getSetCode(), c.getCardNumber());
        if (e == null || !e.name.equalsIgnoreCase(c.getCardName())) {
            CardCatalog.Entry byName = catalog.find(c.getCardName());
            if (byName != null) {
                e = byName;
            }
        }
        return e;
    }

    /** JSON de uma carta no deck: dados do catálogo + a impressão escolhida + quantidade. */
    private static Map<String, Object> cardJson(CardCatalog.Entry e, String name, String set, String num, int qty) {
        Map<String, Object> m = e != null ? CardCatalog.toJson(e) : new LinkedHashMap<>();
        if (e == null) {
            m.put("name", name);
            m.put("unknown", true); // carta que o XMage não conhece
            m.put("types", new ArrayList<>());
            m.put("identity", new ArrayList<>());
            m.put("colors", new ArrayList<>());
            m.put("rules", new ArrayList<>());
            m.put("mv", 0);
            m.put("cost", "");
            m.put("type", "");
        }
        if (set != null && num != null) {
            m.put("set", set);
            m.put("num", num);
        }
        m.put("qty", qty);
        return m;
    }

    public String save(String path, JsonObject json) throws IOException {
        DeckCardLists deck = new DeckCardLists();
        deck.setName(json.has("name") ? json.get("name").getAsString() : "Novo deck");
        for (JsonElement el : json.getAsJsonArray("cards")) {
            deck.getCards().add(deckCard(el.getAsJsonObject()));
        }
        if (json.has("commanders")) {
            for (JsonElement el : json.getAsJsonArray("commanders")) {
                deck.getSideboard().add(deckCard(el.getAsJsonObject()));
            }
        }
        return library.saveUserDeck(path, deck);
    }

    private DeckCardInfo deckCard(JsonObject o) {
        String name = o.get("name").getAsString();
        String set = o.has("set") && !o.get("set").isJsonNull() ? o.get("set").getAsString() : null;
        String num = o.has("num") && !o.get("num").isJsonNull() ? o.get("num").getAsString() : null;
        int qty = o.has("qty") ? o.get("qty").getAsInt() : 1;
        if (set == null || num == null) {
            CardCatalog.Entry e = catalog.find(name);
            if (e != null) {
                set = e.set;
                num = e.num;
            }
        }
        return new DeckCardInfo(name, num == null ? "0" : num, set == null ? "???" : set, qty);
    }

    public void delete(String path) throws IOException {
        library.deleteUserDeck(path);
        moxfield.remove(path);
    }

    // ------------------------------------------------------------------ decks vinculados ao Moxfield

    /** Vincula um link do Moxfield: baixa o deck, grava em "Meus decks" e devolve o caminho. */
    public String linkMoxfield(String url) throws IOException {
        String id = MoxfieldSync.parseId(url);
        synchronized (syncLock) {
            String existing = moxfield.pathFor(id);
            if (existing != null) {
                syncMoxfield(existing, true);
                return existing;
            }
            MoxfieldSync.RemoteDeck remote = moxfield.fetch(id);
            String path = DeckLibrary.USER_PREFIX + uniqueFileName(remote.name);
            MoxfieldSync.Link link = new MoxfieldSync.Link();
            link.publicId = id;
            writeRemote(path, remote, link);
            return path;
        }
    }

    /**
     * Consulta de novo um deck vinculado e regrava o arquivo se ele mudou no Moxfield.
     * Sem {@code force}, respeita o intervalo mínimo entre consultas e não lança erro de rede
     * (o erro fica no vínculo). Devolve true se o deck ou o estado do vínculo mudou.
     */
    public boolean syncMoxfield(String path, boolean force) throws IOException {
        synchronized (syncLock) {
            MoxfieldSync.Link link = moxfield.get(path);
            if (link == null) {
                throw new IOException("Este deck não está vinculado ao Moxfield");
            }
            long now = System.currentTimeMillis();
            if (!force && now - link.lastCheck < MoxfieldSync.MIN_CHECK_INTERVAL.toMillis()) {
                return false;
            }
            link.lastCheck = now;
            try {
                MoxfieldSync.RemoteDeck remote = moxfield.fetch(link.publicId);
                if (!force && remote.updated != null && remote.updated.equals(link.remoteUpdated)
                        && link.lastText != null && Files.isRegularFile(library.resolve(path))) {
                    boolean hadError = link.error != null;
                    link.error = null;
                    moxfield.put(path, link);
                    return hadError;
                }
                writeRemote(path, remote, link);
                return true;
            } catch (IOException e) {
                boolean changed = !e.getMessage().equals(link.error);
                link.error = e.getMessage();
                moxfield.put(path, link);
                if (force) {
                    throw e;
                }
                return changed;
            }
        }
    }

    /** Em segundo plano: confere os decks vinculados que não são consultados há algum tempo. */
    public void syncStaleAsync(Runnable onChange) {
        Map<String, MoxfieldSync.Link> links = moxfield.all();
        long now = System.currentTimeMillis();
        boolean anyStale = links.values().stream()
                .anyMatch(l -> now - l.lastCheck >= MoxfieldSync.MIN_CHECK_INTERVAL.toMillis());
        if (!anyStale) {
            return;
        }
        syncWorker.submit(() -> {
            boolean changed = false;
            for (String path : links.keySet()) {
                try {
                    changed |= syncMoxfield(path, false);
                } catch (Exception e) {
                    System.err.println("Moxfield: " + path + ": " + e.getMessage());
                }
            }
            if (changed) {
                try {
                    onChange.run();
                } catch (Exception e) {
                    // o navegador que pediu a lista já se desconectou
                }
            }
        });
    }

    public void unlinkMoxfield(String path) {
        moxfield.remove(path);
    }

    /**
     * Escolhe (ou remove, com {@code substitute == null}) o substituto de uma carta do Moxfield que o
     * XMage não tem. O substituto fica guardado no vínculo e é reaplicado em toda sincronização.
     */
    public void setMoxfieldSubstitute(String path, String missingName, JsonObject substitute) throws IOException {
        synchronized (syncLock) {
            MoxfieldSync.Link link = moxfield.get(path);
            if (link == null) {
                throw new IOException("Este deck não está vinculado ao Moxfield");
            }
            String key = missingName.toLowerCase(Locale.ROOT);
            if (substitute == null) {
                link.substitutes.remove(key);
            } else {
                String name = substitute.get("name").getAsString();
                String set = substitute.has("set") && !substitute.get("set").isJsonNull() ? substitute.get("set").getAsString() : null;
                String num = substitute.has("num") && !substitute.get("num").isJsonNull() ? substitute.get("num").getAsString() : null;
                CardCatalog.Entry e = set != null && num != null ? catalog.findPrinting(set, num) : null;
                if (e == null || !e.name.equalsIgnoreCase(name)) {
                    e = catalog.find(name);
                }
                if (e == null) {
                    throw new IOException("O XMage não conhece a carta '" + name + "'");
                }
                boolean samePrinting = set != null && num != null && e.name.equalsIgnoreCase(name);
                link.substitutes.put(key, new MoxfieldSync.Card(e.name, samePrinting ? set : e.set, samePrinting ? num : e.num));
            }
            if (link.lastText == null) {
                // vínculo gravado antes de guardar a lista: busca de novo no Moxfield
                writeRemote(path, moxfield.fetch(link.publicId), link);
            } else {
                rebuild(path, link);
            }
        }
    }

    private void writeRemote(String path, MoxfieldSync.RemoteDeck remote, MoxfieldSync.Link link) throws IOException {
        link.lastName = remote.name;
        link.lastText = remote.text;
        link.remoteUpdated = remote.updated;
        link.lastCheck = System.currentTimeMillis();
        link.error = null;
        rebuild(path, link);
    }

    /** Monta o deck a partir da última lista do Moxfield, com os substitutos escolhidos, e grava deck e vínculo. */
    @SuppressWarnings("unchecked")
    private void rebuild(String path, MoxfieldSync.Link link) throws IOException {
        Map<String, Object> parsed = importText(link.lastText);
        DeckCardLists deck = new DeckCardLists();
        deck.setName(link.lastName);
        addAll(deck.getCards(), parsed.get("cards"));
        // no XMage o(s) comandante(s) e o sideboard ficam no mesmo lugar
        addAll(deck.getSideboard(), parsed.get("commanders"));
        addAll(deck.getSideboard(), parsed.get("sideboard"));

        List<MoxfieldSync.Missing> missing = new ArrayList<>();
        for (String line : (List<String>) parsed.get("unresolved")) {
            Matcher m = TEXT_LINE.matcher(line);
            String name = m.matches() ? m.group(2).trim() : line;
            int qty = m.matches() && m.group(1) != null ? Integer.parseInt(m.group(1)) : 1;
            MoxfieldSync.Card sub = link.substitutes.get(name.toLowerCase(Locale.ROOT));
            if (sub != null) {
                deck.getCards().add(new DeckCardInfo(sub.name, sub.num, sub.set, qty));
            }
            missing.add(new MoxfieldSync.Missing(name, qty, sub));
        }
        if (deck.getCards().isEmpty()) {
            throw new IOException("Nenhuma carta do deck foi reconhecida pelo XMage");
        }
        library.saveUserDeck(path, deck);
        link.missing = missing;
        moxfield.put(path, link);
    }

    @SuppressWarnings("unchecked")
    private static void addAll(List<DeckCardInfo> target, Object cards) {
        for (Map<String, Object> c : (List<Map<String, Object>>) cards) {
            target.add(new DeckCardInfo((String) c.get("name"), (String) c.get("num"), (String) c.get("set"), (Integer) c.get("qty")));
        }
    }

    private String uniqueFileName(String name) throws IOException {
        String base = DeckLibrary.safeFileName(name);
        String candidate = base + ".dck";
        for (int i = 2; Files.exists(library.resolve(DeckLibrary.USER_PREFIX + candidate)); i++) {
            candidate = base + " (" + i + ").dck";
        }
        return candidate;
    }

    public Map<String, Object> printings(String name) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", name);
        List<Map<String, String>> list = new ArrayList<>();
        for (String[] p : catalog.printings(name)) {
            Map<String, String> pm = new LinkedHashMap<>();
            pm.put("set", p[0]);
            pm.put("num", p[1]);
            list.add(pm);
        }
        m.put("printings", list);
        return m;
    }

    // ------------------------------------------------------------------ importação de texto

    private static final Pattern DCK_LINE = Pattern.compile("^(SB:\\s*)?(\\d+)\\s+\\[([^:\\]]+):([^\\]]+)]\\s+(.+)$");
    // "1 Sol Ring", "1x Sol Ring (CMR) 472 *F*", "1x Sol Ring (cmr) 472 [Commander{top}]"
    private static final Pattern TEXT_LINE = Pattern.compile(
            "^(?:(\\d+)\\s*[xX]?\\s+)?(.+?)(?:\\s+\\(([A-Za-z0-9_]+)\\)(?:\\s+([A-Za-z0-9★*-]+))?)?((?:\\s+\\*[A-Za-z]+\\*)*)(?:\\s+\\[([^\\]]*)])?(?:\\s+\\^[^^]*\\^)?\\s*$");
    private static final Pattern SECTION = Pattern.compile(
            "^(?://\\s*)?(commanders?|comandantes?|companion|deck|main(?:board)?|sideboard|maybeboard|considering|tokens?)\\s*:?\\s*(?:\\(\\d+\\))?$",
            Pattern.CASE_INSENSITIVE);

    public Map<String, Object> importText(String text) {
        List<Map<String, Object>> commanders = new ArrayList<>();
        List<Map<String, Object>> cards = new ArrayList<>();
        List<Map<String, Object>> sideboard = new ArrayList<>();
        List<String> unresolved = new ArrayList<>();
        String section = "main";

        for (String raw : text.split("\\r?\\n")) {
            String line = raw.trim();
            if (line.isEmpty() || line.startsWith("#") || (line.startsWith("//") && !SECTION.matcher(line).matches())) {
                continue;
            }
            if (line.startsWith("NAME:") || line.startsWith("LAYOUT")) {
                continue;
            }
            Matcher sec = SECTION.matcher(line);
            if (sec.matches()) {
                String s = sec.group(1).toLowerCase(Locale.ROOT);
                section = s.startsWith("command") || s.startsWith("comand") ? "commander"
                        : s.startsWith("side") ? "side"
                        : s.startsWith("maybe") || s.startsWith("consider") || s.startsWith("token") || s.startsWith("companion") ? "skip"
                        : "main";
                continue;
            }
            if ("skip".equals(section)) {
                continue;
            }

            String name;
            String set = null;
            String num = null;
            int qty = 1;
            String target = section;
            Matcher dck = DCK_LINE.matcher(line);
            Matcher txt;
            if (dck.matches()) {
                qty = Integer.parseInt(dck.group(2));
                set = dck.group(3);
                num = dck.group(4);
                name = dck.group(5).trim();
                if (dck.group(1) != null) {
                    target = "side";
                }
            } else if ((txt = TEXT_LINE.matcher(line)).matches()) {
                if (txt.group(1) != null) {
                    qty = Integer.parseInt(txt.group(1));
                }
                name = txt.group(2).trim();
                set = txt.group(3);
                num = txt.group(4);
                String category = txt.group(6);
                if (category != null && category.toLowerCase(Locale.ROOT).contains("commander")) {
                    target = "commander";
                } else if (category != null && category.toLowerCase(Locale.ROOT).matches(".*(maybeboard|sideboard).*")) {
                    continue;
                }
            } else {
                unresolved.add(line);
                continue;
            }

            CardCatalog.Entry e = null;
            if (set != null && num != null) {
                CardCatalog.Entry p = catalog.findPrinting(set, num);
                // a impressão vale se for a mesma carta pelo nome (inclui "Frente // Verso" de MDFC e só a frente de divididas)
                if (p != null && p == catalog.find(name)) {
                    e = p;
                } else {
                    set = null;
                    num = null;
                }
            }
            if (e == null) {
                e = catalog.find(name);
            }
            if (e == null) {
                unresolved.add(line);
                continue;
            }
            Map<String, Object> card = cardJson(e, e.name, set != null ? set.toUpperCase(Locale.ROOT) : e.set, num != null ? num : e.num, qty);
            switch (target) {
                case "commander":
                    commanders.add(card);
                    break;
                case "side":
                    sideboard.add(card);
                    break;
                default:
                    cards.add(card);
            }
        }

        // MTGO/Arena: o comandante costuma vir no "sideboard"
        if (commanders.isEmpty() && !sideboard.isEmpty() && sideboard.size() <= 2
                && sideboard.stream().allMatch(c -> Boolean.TRUE.equals(c.get("canBeCommander")))) {
            commanders.addAll(sideboard);
            sideboard.clear();
        }

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("commanders", commanders);
        res.put("cards", cards);
        res.put("sideboard", sideboard);
        res.put("unresolved", unresolved);
        return res;
    }

    static List<String> stringList(JsonArray arr) {
        List<String> res = new ArrayList<>();
        if (arr != null) {
            arr.forEach(e -> res.add(e.getAsString()));
        }
        return res;
    }
}
