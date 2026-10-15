package fellowmage.gateway;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import mage.cards.decks.DeckCardInfo;
import mage.cards.decks.DeckCardLists;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
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

    public DeckService(DeckLibrary library, CardCatalog catalog) {
        this.library = library;
        this.catalog = catalog;
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
        return m;
    }

    // ------------------------------------------------------------------ deck <-> JSON do editor

    public Map<String, Object> toEditor(String path) throws IOException {
        DeckCardLists deck = library.load(path);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("path", path);
        m.put("readOnly", !path.startsWith(DeckLibrary.USER_PREFIX));
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
                if (p != null && (p.name.equalsIgnoreCase(name) || p.name.toLowerCase(Locale.ROOT).startsWith(name.toLowerCase(Locale.ROOT) + " //"))) {
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
