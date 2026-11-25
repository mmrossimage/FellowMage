package fellowmage.gateway;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Catálogo de cartas implementadas no XMage, para o editor de decks.
 * <p>
 * Lê o banco H2 do servidor ({@code Mage.Server/db/cards.h2}) UMA vez, só com SELECT, e mantém tudo
 * em memória. Não usa {@code mage.cards.repository.CardRepository} de propósito: aquela classe
 * apaga e recria a tabela quando acha que o banco é de outro build, o que estragaria o banco do servidor.
 */
public final class CardCatalog {

    private static final String SEP = "@@@";
    private static final Pattern MANA_SYMBOL = Pattern.compile("\\{([^}]+)}");
    private static final List<String> COLOR_ORDER = Arrays.asList("W", "U", "B", "R", "G");

    /** Uma carta (por nome), com a impressão preferida e todas as impressões disponíveis. */
    public static final class Entry {
        public final String name;
        public String set;
        public String num;
        public String cost;
        public int mv;
        public String typeLine;
        public List<String> types;
        public List<String> supertypes;
        public List<String> subtypes;
        public List<String> colors;
        public List<String> identity;
        public String rarity;
        public String power;
        public String toughness;
        public String loyalty;
        public List<String> rules;
        public boolean canBeCommander;
        transient final List<String[]> printings = new ArrayList<>(); // {set, num}
        transient String searchText; // nome + tipo + regras, minúsculas

        Entry(String name) {
            this.name = name;
        }

        public boolean isBasicLand() {
            return supertypes.contains("BASIC") && types.contains("LAND");
        }
    }

    private volatile Map<String, Entry> byName = Collections.emptyMap(); // chave: nome minúsculo
    private volatile Map<String, Entry> byFrontFace = Collections.emptyMap(); // "fire" -> "Fire // Ice"
    private volatile Map<String, Entry> byPrinting = Collections.emptyMap(); // "set:num" -> entrada
    private volatile List<Entry> sorted = Collections.emptyList();
    private volatile String status = "não carregado";
    private volatile List<String[]> boosterSets = Collections.emptyList(); // {código, nome}
    /** "set:num" -> nome do verso (minúsculo) das cartas de dupla face; estático porque o ViewMapper é estático. */
    private static volatile Map<String, String> backFaces = Collections.emptyMap();

    /**
     * A carta com este set/número tem dupla face e o nome é o do verso? O XMage manda o verso de uma MDFC
     * (terreno jogado pelo verso) com o set/número da frente, e o Scryfall devolveria a imagem da frente.
     */
    public static boolean isBackFace(String set, String num, String name) {
        if (set == null || num == null || name == null) {
            return false;
        }
        String back = backFaces.get((set + ":" + num).toLowerCase(Locale.ROOT));
        return back != null && back.equals(name.toLowerCase(Locale.ROOT));
    }

    /** Coleções que têm booster no XMage (para draft e selado). */
    public List<String[]> getBoosterSets() {
        return boosterSets;
    }

    public String getStatus() {
        return status;
    }

    public boolean isReady() {
        return !sorted.isEmpty();
    }

    /** Carrega em segundo plano; a busca devolve vazio até terminar. */
    public void loadAsync(Path dbFileWithoutExtension) {
        Thread t = new Thread(() -> load(dbFileWithoutExtension), "card-catalog");
        t.setDaemon(true);
        t.start();
    }

    private void load(Path dbBase) {
        Path mv = dbBase.resolveSibling(dbBase.getFileName() + ".mv.db");
        // primeira execução: o servidor XMage cria o arquivo do banco (RepositoryUtil.bootstrapLocalDb)
        // e só depois o preenche (CardScanner.scan); esperar até haver cartas
        while (!Files.exists(mv) || !tryLoad(dbBase)) {
            status = "aguardando o servidor XMage criar o banco de cartas…";
            try {
                Thread.sleep(5000);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    /** Lê o banco; falso se ele ainda não tem cartas (ou não pôde ser lido). */
    private boolean tryLoad(Path dbBase) {
        status = "carregando…";
        long t0 = System.currentTimeMillis();
        // mesmos parâmetros do servidor (AUTO_SERVER): os dois processos podem abrir o arquivo; aqui só lemos
        String url = "jdbc:h2:file:" + dbBase.toAbsolutePath().toString().replace('\\', '/') + ";AUTO_SERVER=TRUE;IGNORECASE=TRUE";
        String sql = "SELECT c.NAME, c.SETCODE, c.CARDNUMBER, c.TYPES, c.SUBTYPES, c.SUPERTYPES, c.MANACOSTS, c.MANAVALUE, "
                + "c.RULES, c.WHITE, c.BLUE, c.BLACK, c.RED, c.GREEN, c.RARITY, c.POWER, c.TOUGHNESS, c.STARTINGLOYALTY, "
                + "e.TYPE AS SETTYPE, e.RELEASEDATE "
                + "FROM CARD c LEFT JOIN EXPANSION e ON e.CODE = c.SETCODE "
                + "WHERE c.NIGHTCARD = FALSE AND c.SPLITCARDHALF = FALSE";
        Map<String, Entry> names = new HashMap<>();
        Map<String, Long> bestScore = new HashMap<>();
        try (Connection c = DriverManager.getConnection(url, "", "");
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                String name = rs.getString("NAME");
                String key = name.toLowerCase(Locale.ROOT);
                Entry e = names.computeIfAbsent(key, k -> new Entry(name));
                String set = rs.getString("SETCODE");
                String num = rs.getString("CARDNUMBER");
                e.printings.add(new String[]{set, num});

                // impressão preferida: coleções normais mais recentes (melhor imagem no Scryfall)
                long score = printingScore(rs.getString("SETTYPE"), rs.getTimestamp("RELEASEDATE"), num);
                Long prev = bestScore.get(key);
                if (prev != null && prev >= score) {
                    continue;
                }
                bestScore.put(key, score);
                fill(e, rs, set, num);
            }
        } catch (Exception ex) {
            status = "erro ao ler o banco de cartas: " + ex.getMessage();
            System.err.println(status);
            return false;
        }
        if (names.isEmpty()) {
            return false;
        }
        // coleções com booster, mais recentes primeiro (ExpansionRepository.getWithBoostersSortedByReleaseDate)
        List<String[]> sets = new ArrayList<>();
        try (Connection c = DriverManager.getConnection(url, "", "");
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT e.CODE, e.NAME FROM EXPANSION e WHERE e.BOOSTERS = TRUE "
                     + "AND EXISTS (SELECT 1 FROM CARD c WHERE c.SETCODE = e.CODE) ORDER BY e.RELEASEDATE DESC")) {
            while (rs.next()) {
                sets.add(new String[]{rs.getString("CODE"), rs.getString("NAME")});
            }
        } catch (Exception ex) {
            System.err.println("Coleções com booster indisponíveis: " + ex.getMessage());
        }
        boosterSets = sets;

        // versos das cartas de dupla face (transformáveis e MDFC), para a imagem certa na mesa
        Map<String, String> backs = new HashMap<>();
        try (Connection c = DriverManager.getConnection(url, "", "");
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT c.SETCODE, c.CARDNUMBER, c.SECONDSIDENAME, c.DOUBLEFACEDSECONDSIDENAME FROM CARD c "
                     + "WHERE c.NIGHTCARD = FALSE AND (c.SECONDSIDENAME IS NOT NULL OR c.DOUBLEFACEDSECONDSIDENAME IS NOT NULL)")) {
            while (rs.next()) {
                String back = rs.getString("DOUBLEFACEDSECONDSIDENAME");
                if (back == null || back.isEmpty()) {
                    back = rs.getString("SECONDSIDENAME");
                }
                if (back != null && !back.isEmpty()) {
                    backs.put((rs.getString("SETCODE") + ":" + rs.getString("CARDNUMBER")).toLowerCase(Locale.ROOT), back.toLowerCase(Locale.ROOT));
                }
            }
        } catch (Exception ex) {
            System.err.println("Versos de dupla face indisponíveis: " + ex.getMessage());
        }
        backFaces = backs;

        Map<String, Entry> front = new HashMap<>();
        Map<String, Entry> printing = new HashMap<>();
        for (Entry e : names.values()) {
            e.printings.sort((a, b) -> (a[0] + a[1]).compareTo(b[0] + b[1]));
            for (String[] p : e.printings) {
                printing.put((p[0] + ":" + p[1]).toLowerCase(Locale.ROOT), e);
            }
            if (e.name.contains(" // ")) {
                front.putIfAbsent(e.name.substring(0, e.name.indexOf(" // ")).toLowerCase(Locale.ROOT), e);
            }
        }
        List<Entry> list = new ArrayList<>(names.values());
        list.sort((a, b) -> a.name.compareToIgnoreCase(b.name));
        byName = names;
        byFrontFace = front;
        byPrinting = printing;
        sorted = list;
        status = "pronto";
        System.out.println("Catálogo de cartas: " + list.size() + " cartas em " + (System.currentTimeMillis() - t0) + " ms");
        return true;
    }

    private static long printingScore(String setType, java.sql.Timestamp release, String num) {
        int typeRank;
        if (setType == null) {
            typeRank = 0;
        } else {
            switch (setType) {
                case "EXPANSION":
                case "CORE":
                case "SUPPLEMENTAL":
                case "SUPPLEMENTAL_STAMPED":
                    typeRank = 2; // coleções normais (incl. decks de Commander): vale a mais recente
                    break;
                default:
                    typeRank = 1; // promos, joke, etc.
            }
        }
        // números com letra/estrela costumam ser variantes
        int plain = num != null && num.matches("\\d+") ? 1 : 0;
        long date = release == null ? 0 : release.getTime() / 86_400_000L;
        return ((long) typeRank << 40) | ((long) plain << 39) | date;
    }

    private static void fill(Entry e, ResultSet rs, String set, String num) throws java.sql.SQLException {
        e.set = set;
        e.num = num;
        e.types = split(rs.getString("TYPES")).stream().distinct().collect(Collectors.toList());
        e.subtypes = split(rs.getString("SUBTYPES")).stream().distinct().collect(Collectors.toList());
        e.supertypes = split(rs.getString("SUPERTYPES")).stream().distinct().collect(Collectors.toList());
        List<String> costParts = split(rs.getString("MANACOSTS"));
        // cartas divididas: "{1}{R}" + "{*}" (separador) + "{1}{U}"
        e.cost = String.join("", costParts).replace("{*}", " // ");
        e.mv = rs.getInt("MANAVALUE");
        e.rules = split(rs.getString("RULES")).stream()
                .map(r -> r.replace("{this}", e.name.contains(" // ") ? "this" : e.name))
                .collect(Collectors.toList());
        e.colors = new ArrayList<>();
        if (rs.getBoolean("WHITE")) e.colors.add("W");
        if (rs.getBoolean("BLUE")) e.colors.add("U");
        if (rs.getBoolean("BLACK")) e.colors.add("B");
        if (rs.getBoolean("RED")) e.colors.add("R");
        if (rs.getBoolean("GREEN")) e.colors.add("G");
        e.identity = colorIdentity(e.colors, e.cost, e.rules);
        e.rarity = rs.getString("RARITY");
        e.power = rs.getString("POWER");
        e.toughness = rs.getString("TOUGHNESS");
        e.loyalty = rs.getString("STARTINGLOYALTY");
        e.typeLine = typeLine(e);
        boolean legendary = e.supertypes.contains("LEGENDARY");
        e.canBeCommander = (legendary && e.types.contains("CREATURE"))
                || e.rules.stream().anyMatch(r -> r.toLowerCase(Locale.ROOT).contains("can be your commander"));
        e.searchText = (e.name + "\n" + e.typeLine + "\n" + String.join("\n", e.rules)).toLowerCase(Locale.ROOT);
    }

    /** Identidade de cor (CR 903.4): cores da carta + símbolos de mana no custo e no texto. */
    static List<String> colorIdentity(List<String> colors, String cost, List<String> rules) {
        Set<String> id = new LinkedHashSet<>(colors);
        StringBuilder all = new StringBuilder(cost == null ? "" : cost);
        rules.forEach(r -> all.append(' ').append(r));
        Matcher m = MANA_SYMBOL.matcher(all);
        while (m.find()) {
            String sym = m.group(1).toUpperCase(Locale.ROOT);
            for (String c : COLOR_ORDER) {
                // {R}, {2/R}, {R/P}, {G/U}... ({T}, {Q}, {X} etc. não contam)
                if (sym.equals(c) || sym.matches(".*(^|/)" + c + "($|/).*")) {
                    id.add(c);
                }
            }
        }
        return COLOR_ORDER.stream().filter(id::contains).collect(Collectors.toList());
    }

    private static String typeLine(Entry e) {
        String left = (e.supertypes.stream().map(CardCatalog::cap).collect(Collectors.joining(" ")) + " "
                + e.types.stream().map(CardCatalog::cap).collect(Collectors.joining(" "))).trim();
        return e.subtypes.isEmpty() ? left : left + " — " + String.join(" ", e.subtypes);
    }

    private static String cap(String s) {
        s = s.toLowerCase(Locale.ROOT).replace('_', ' ');
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private static List<String> split(String s) {
        if (s == null || s.isEmpty()) {
            return new ArrayList<>();
        }
        return Arrays.stream(s.split(SEP)).map(String::trim).filter(x -> !x.isEmpty()).collect(Collectors.toList());
    }

    // ------------------------------------------------------------------ consultas

    public Entry find(String name) {
        if (name == null) {
            return null;
        }
        String key = name.trim().toLowerCase(Locale.ROOT);
        Entry e = byName.get(key);
        if (e == null) {
            e = byFrontFace.get(key);
        }
        if (e == null && key.contains("/") && !key.contains(" // ")) {
            key = key.replaceAll("\\s*/+\\s*", " // ");
            e = byName.get(key);
        }
        if (e == null && key.contains(" // ")) {
            // só as cartas divididas (Fire // Ice) ficam no banco com o nome completo; MDFC, transformáveis,
            // aventuras etc. ficam com o nome da face da frente (CardRepository.findCards faz o mesmo)
            e = byName.get(key.substring(0, key.indexOf(" // ")).trim());
        }
        return e;
    }

    public Entry findPrinting(String set, String num) {
        return set == null || num == null ? null : byPrinting.get((set + ":" + num).toLowerCase(Locale.ROOT));
    }

    /** As impressões disponíveis no XMage para uma carta ({set, número}). */
    public List<String[]> printings(String name) {
        Entry e = find(name);
        return e == null ? new ArrayList<>() : e.printings;
    }

    public static final class Query {
        public String text = "";
        public boolean searchRules = false;
        public List<String> types = new ArrayList<>(); // CREATURE, INSTANT...
        public List<String> identity; // null = qualquer; senão: a identidade da carta deve estar contida
        public List<String> colors = new ArrayList<>(); // a carta deve ter TODAS estas cores
        public Integer mvMin;
        public Integer mvMax;
        public boolean commandersOnly = false;
        public String sort = "name"; // name | mv
        public int offset = 0;
        public int limit = 60;
    }

    public Map<String, Object> search(Query q) {
        List<String> words = Arrays.stream(q.text.toLowerCase(Locale.ROOT).trim().split("\\s+"))
                .filter(w -> !w.isEmpty()).collect(Collectors.toList());
        List<Entry> hits = new ArrayList<>();
        for (Entry e : sorted) {
            if (q.commandersOnly && !e.canBeCommander) continue;
            if (!q.types.isEmpty() && q.types.stream().noneMatch(e.types::contains)) continue;
            if (q.identity != null && !q.identity.containsAll(e.identity)) continue;
            if (!q.colors.isEmpty() && !e.colors.containsAll(q.colors)) continue;
            if (q.mvMin != null && e.mv < q.mvMin) continue;
            if (q.mvMax != null && e.mv > q.mvMax) continue;
            if (!words.isEmpty()) {
                String hay = q.searchRules ? e.searchText : e.name.toLowerCase(Locale.ROOT);
                if (!words.stream().allMatch(hay::contains)) continue;
            }
            hits.add(e);
        }
        if ("mv".equals(q.sort)) {
            hits.sort((a, b) -> a.mv != b.mv ? Integer.compare(a.mv, b.mv) : a.name.compareToIgnoreCase(b.name));
        }
        if (!words.isEmpty() && !q.searchRules) {
            // nomes que começam com o texto primeiro
            String first = words.get(0);
            hits.sort((a, b) -> Boolean.compare(!a.name.toLowerCase(Locale.ROOT).startsWith(first), !b.name.toLowerCase(Locale.ROOT).startsWith(first)));
        }
        int from = Math.min(q.offset, hits.size());
        int to = Math.min(from + q.limit, hits.size());
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("total", hits.size());
        res.put("offset", from);
        res.put("cards", hits.subList(from, to).stream().map(CardCatalog::toJson).collect(Collectors.toList()));
        return res;
    }

    public static Map<String, Object> toJson(Entry e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", e.name);
        m.put("set", e.set);
        m.put("num", e.num);
        m.put("cost", e.cost);
        m.put("mv", e.mv);
        m.put("type", e.typeLine);
        m.put("types", e.types);
        m.put("supertypes", e.supertypes);
        m.put("colors", e.colors);
        m.put("identity", e.identity);
        m.put("rarity", e.rarity);
        if (e.types.contains("CREATURE")) {
            m.put("power", e.power);
            m.put("toughness", e.toughness);
        }
        if (e.loyalty != null && !e.loyalty.isEmpty()) {
            m.put("loyalty", e.loyalty);
        }
        m.put("rules", e.rules);
        m.put("canBeCommander", e.canBeCommander);
        m.put("basic", e.isBasicLand());
        m.put("printings", e.printings.size());
        return m;
    }
}
