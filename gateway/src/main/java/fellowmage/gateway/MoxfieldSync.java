package fellowmage.gateway;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Decks vinculados a um link do Moxfield. O vínculo fica em "Meus decks/.moxfield.json"
 * (caminho do deck -> id público, data da última alteração no Moxfield, último erro).
 * <p>
 * Usa a API não documentada que o próprio site usa ({@code api2.moxfield.com/v3/decks/all/<id>});
 * só funciona com decks públicos ou não listados. As buscas acontecem apenas quando o usuário
 * abre a lista de decks (no máximo a cada {@link #MIN_CHECK_INTERVAL}) ou pede para atualizar.
 */
public final class MoxfieldSync {

    public static final Duration MIN_CHECK_INTERVAL = Duration.ofMinutes(10);

    private static final Pattern DECK_URL = Pattern.compile("^(?:(?:https?://)?(?:www\\.)?moxfield\\.com/decks/)?([A-Za-z0-9_-]{8,})(?:[/?#].*)?$");
    private static final String API = "https://api2.moxfield.com/v3/decks/all/";
    private static final String USER_AGENT = "FellowMage/1.0 (deck sync pessoal)";
    // seções do Moxfield que viram linhas na lista de texto; o resto (maybeboard, tokens, attractions…) é ignorado
    private static final String[][] BOARDS = {
            {"commanders", "Commander"},
            {"mainboard", "Deck"},
            {"sideboard", "Sideboard"},
    };

    /** Vínculo de um deck local com o Moxfield. */
    public static final class Link {
        public String publicId;
        public String remoteUpdated; // lastUpdatedAtUtc do Moxfield na última sincronização
        public long lastCheck;       // epoch ms da última consulta
        public String error;         // último erro (null se ok)
        public String lastName;      // nome e lista do Moxfield na última sincronização, para
        public String lastText;      // reaplicar substitutos sem consultar o Moxfield de novo
        /** cartas do Moxfield que o XMage não tem (ainda não implementadas) */
        public List<Missing> missing = new ArrayList<>();
        /** substituto escolhido pelo usuário, por nome da carta ausente (em minúsculas); vale nas próximas sincronizações */
        public Map<String, Card> substitutes = new LinkedHashMap<>();

        public String url() {
            return "https://moxfield.com/decks/" + publicId;
        }

        void normalize() {
            if (missing == null) {
                missing = new ArrayList<>();
            }
            if (substitutes == null) {
                substitutes = new LinkedHashMap<>();
            }
        }
    }

    /** Carta do Moxfield que ficou de fora do deck. */
    public static final class Missing {
        public String name;
        public int qty;
        public Card substitute; // null = sem substituto

        public Missing(String name, int qty, Card substitute) {
            this.name = name;
            this.qty = qty;
            this.substitute = substitute;
        }
    }

    /** Uma impressão de carta do catálogo do XMage. */
    public static final class Card {
        public String name;
        public String set;
        public String num;

        public Card(String name, String set, String num) {
            this.name = name;
            this.set = set;
            this.num = num;
        }
    }

    /** Deck baixado do Moxfield, já como lista de texto. */
    public static final class RemoteDeck {
        public final String name;
        public final String format;
        public final String updated;
        public final String text;

        RemoteDeck(String name, String format, String updated, String text) {
            this.name = name;
            this.format = format;
            this.updated = updated;
            this.text = text;
        }
    }

    private final Path file;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final Gson gson = new GsonBuilder().setPrettyPrinting().create();
    private final Map<String, Link> links = new LinkedHashMap<>();

    public MoxfieldSync(Path userRoot) {
        this.file = userRoot.resolve(".moxfield.json");
        load();
    }

    // ------------------------------------------------------------------ vínculos

    public static String parseId(String urlOrId) throws IOException {
        Matcher m = urlOrId == null ? null : DECK_URL.matcher(urlOrId.trim());
        if (m == null || !m.matches()) {
            throw new IOException("Link do Moxfield inválido. Use algo como https://moxfield.com/decks/abc123…");
        }
        return m.group(1);
    }

    public synchronized Link get(String path) {
        return links.get(path);
    }

    public synchronized Map<String, Link> all() {
        return new LinkedHashMap<>(links);
    }

    public synchronized String pathFor(String publicId) {
        for (Map.Entry<String, Link> e : links.entrySet()) {
            if (e.getValue().publicId.equals(publicId)) {
                return e.getKey();
            }
        }
        return null;
    }

    public synchronized void put(String path, Link link) {
        links.put(path, link);
        save();
    }

    public synchronized void remove(String path) {
        if (links.remove(path) != null) {
            save();
        }
    }

    private void load() {
        if (!Files.isRegularFile(file)) {
            return;
        }
        try {
            JsonObject o = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject();
            for (Map.Entry<String, JsonElement> e : o.entrySet()) {
                Link l = gson.fromJson(e.getValue(), Link.class);
                if (l != null && l.publicId != null) {
                    l.normalize();
                    links.put(e.getKey(), l);
                }
            }
        } catch (Exception e) {
            System.err.println("Não foi possível ler " + file + ": " + e.getMessage());
        }
    }

    private void save() {
        try {
            Files.writeString(file, gson.toJson(links), StandardCharsets.UTF_8);
        } catch (IOException e) {
            System.err.println("Não foi possível gravar " + file + ": " + e.getMessage());
        }
    }

    // ------------------------------------------------------------------ download

    public RemoteDeck fetch(String publicId) throws IOException {
        HttpRequest req = HttpRequest.newBuilder(URI.create(API + publicId))
                .timeout(Duration.ofSeconds(20))
                .header("User-Agent", USER_AGENT)
                .header("Accept", "application/json")
                .GET()
                .build();
        HttpResponse<String> res;
        try {
            res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Busca no Moxfield interrompida");
        }
        if (res.statusCode() == 404) {
            throw new IOException("Deck não encontrado no Moxfield (apagado ou privado?)");
        }
        if (res.statusCode() == 403 || res.statusCode() == 429) {
            throw new IOException("O Moxfield recusou a consulta (HTTP " + res.statusCode() + "); tente mais tarde");
        }
        if (res.statusCode() != 200) {
            throw new IOException("Moxfield respondeu HTTP " + res.statusCode());
        }
        JsonObject d;
        try {
            d = JsonParser.parseString(res.body()).getAsJsonObject();
        } catch (Exception e) {
            throw new IOException("Resposta inesperada do Moxfield");
        }
        return toRemoteDeck(d);
    }

    static RemoteDeck toRemoteDeck(JsonObject d) throws IOException {
        JsonObject boards = d.has("boards") && d.get("boards").isJsonObject() ? d.getAsJsonObject("boards") : null;
        if (boards == null) {
            throw new IOException("Resposta do Moxfield sem lista de cartas (o formato da API mudou?)");
        }
        StringBuilder text = new StringBuilder();
        for (String[] b : BOARDS) {
            JsonObject board = boards.has(b[0]) ? boards.getAsJsonObject(b[0]) : null;
            JsonObject cards = board != null && board.has("cards") ? board.getAsJsonObject("cards") : null;
            if (cards == null || cards.size() == 0) {
                continue;
            }
            text.append(b[1]).append('\n');
            for (Map.Entry<String, JsonElement> e : cards.entrySet()) {
                JsonObject entry = e.getValue().getAsJsonObject();
                JsonObject card = entry.getAsJsonObject("card");
                if (card == null || !card.has("name")) {
                    continue;
                }
                int qty = entry.has("quantity") ? entry.get("quantity").getAsInt() : 1;
                text.append(qty).append(' ').append(card.get("name").getAsString());
                if (card.has("set") && card.has("cn")) {
                    text.append(" (").append(card.get("set").getAsString()).append(") ").append(card.get("cn").getAsString());
                }
                text.append('\n');
            }
            text.append('\n');
        }
        if (text.length() == 0) {
            throw new IOException("O deck do Moxfield está vazio");
        }
        return new RemoteDeck(
                str(d, "name", "Deck do Moxfield"),
                str(d, "format", ""),
                str(d, "lastUpdatedAtUtc", null),
                text.toString());
    }

    private static String str(JsonObject o, String key, String def) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : def;
    }
}
