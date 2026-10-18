package fellowmage.gateway;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import mage.cards.decks.DeckCardInfo;
import mage.cards.decks.DeckCardLists;
import mage.view.DeckView;
import mage.view.SimpleCardView;
import mage.view.SimpleCardsView;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Montagem de deck pedida pelo servidor: sideboard entre os jogos (SIDEBOARD), sideboard de torneio
 * limitado (SIDEBOARD com flag) e construção do deck a partir do pool (CONSTRUCT).
 * Equivale ao DeckEditorPanel nos modos SIDEBOARDING / LIMITED_BUILDING do cliente oficial.
 */
final class DeckBuilding {

    static final String[] BASICS = {"Plains", "Island", "Swamp", "Mountain", "Forest"};

    final UUID tableId;
    final String mode;
    final int timeSecs;
    private final String deckName;
    // todas as cartas recebidas (deck + sideboard/pool), pelo id que o navegador devolve
    private final Map<UUID, SimpleCardView> cards = new LinkedHashMap<>();
    private final Set<UUID> initialMain = new HashSet<>();

    DeckBuilding(UUID tableId, String mode, int timeSecs, DeckView deck) {
        this.tableId = tableId;
        this.mode = mode;
        this.timeSecs = timeSecs;
        this.deckName = deck.getName();
        deck.getCards().values().forEach(c -> {
            cards.put(c.getId(), c);
            initialMain.add(c.getId());
        });
        deck.getSideboard().values().forEach(c -> cards.put(c.getId(), c));
    }

    /** No limitado o jogador acrescenta terrenos básicos à vontade (como o "Add land" do editor oficial). */
    boolean basicsAllowed() {
        return !"sideboard".equals(mode);
    }

    Map<String, Object> toJson(CardCatalog catalog) {
        List<Map<String, Object>> main = new ArrayList<>();
        List<Map<String, Object>> side = new ArrayList<>();
        for (SimpleCardView c : cards.values()) {
            (initialMain.contains(c.getId()) ? main : side).add(card(c, catalog));
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("tableId", tableId);
        m.put("mode", mode);
        m.put("time", timeSecs);
        m.put("name", deckName);
        m.put("main", main);
        m.put("side", side);
        m.put("basics", basicsAllowed());
        return m;
    }

    private static Map<String, Object> card(SimpleCardView c, CardCatalog catalog) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("set", c.getExpansionSetCode());
        m.put("num", c.getCardNumber());
        CardCatalog.Entry e = catalog.findPrinting(c.getExpansionSetCode(), c.getCardNumber());
        if (e != null) {
            m.put("name", e.name);
            m.put("type", e.typeLine);
            m.put("types", e.types);
            m.put("cost", e.cost);
            m.put("mv", e.mv);
            m.put("colors", e.colors);
        }
        return m;
    }

    /** Deck escolhido no navegador: ids no deck principal, o resto no sideboard, mais os básicos pedidos. */
    DeckCardLists toDeck(JsonObject cmd, CardCatalog catalog) {
        Set<UUID> main = new HashSet<>();
        JsonArray ids = cmd.getAsJsonArray("main");
        if (ids != null) {
            ids.forEach(e -> main.add(UUID.fromString(e.getAsString())));
        }
        Map<String, DeckCardInfo> mainCards = new LinkedHashMap<>();
        Map<String, DeckCardInfo> sideCards = new LinkedHashMap<>();
        for (SimpleCardView c : cards.values()) {
            String name = nameOf(c, catalog);
            add(main.contains(c.getId()) ? mainCards : sideCards, name, c.getCardNumber(), c.getExpansionSetCode(), 1);
        }
        JsonObject basics = cmd.has("basics") && cmd.get("basics").isJsonObject() ? cmd.getAsJsonObject("basics") : null;
        if (basics != null && basicsAllowed()) {
            for (String land : BASICS) {
                int n = basics.has(land) ? basics.get(land).getAsInt() : 0;
                CardCatalog.Entry e = catalog.find(land);
                if (n > 0 && e != null) {
                    add(mainCards, e.name, e.num, e.set, n);
                }
            }
        }
        DeckCardLists deck = new DeckCardLists();
        deck.setName(deckName);
        deck.getCards().addAll(mainCards.values());
        deck.getSideboard().addAll(sideCards.values());
        return deck;
    }

    private static String nameOf(SimpleCardView c, CardCatalog catalog) {
        CardCatalog.Entry e = catalog.findPrinting(c.getExpansionSetCode(), c.getCardNumber());
        return e == null ? "" : e.name;
    }

    private static void add(Map<String, DeckCardInfo> into, String name, String num, String set, int qty) {
        String key = set + ":" + num;
        DeckCardInfo prev = into.get(key);
        into.put(key, new DeckCardInfo(name, num, set, (prev == null ? 0 : prev.getAmount()) + qty));
    }
}
