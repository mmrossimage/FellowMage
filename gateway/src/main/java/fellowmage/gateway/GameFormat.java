package fellowmage.gateway;

/**
 * Formatos oferecidos no lobby do cliente web.
 * <p>
 * Commander usa a variante "Freeform" (estrutura de Commander sem lista de banidas), para que
 * qualquer deck de exemplo do XMage seja aceito pelo servidor.
 */
public enum GameFormat {

    COMMANDER("commander", "Commander", "Commander/",
            "Freeform Commander Free For All", "Freeform Commander Two Player Duel",
            "Variant Magic - Freeform Commander", 4),
    DUEL("duel", "Duelo", "",
            "Two Player Duel", "Two Player Duel",
            "Constructed - Freeform Unlimited", 2);

    private final String id;
    private final String label;
    private final String deckFolder;
    private final String multiplayerGameType;
    private final String duelGameType;
    private final String deckType;
    private final int maxPlayers;

    GameFormat(String id, String label, String deckFolder, String multiplayerGameType, String duelGameType, String deckType, int maxPlayers) {
        this.id = id;
        this.label = label;
        this.deckFolder = deckFolder;
        this.multiplayerGameType = multiplayerGameType;
        this.duelGameType = duelGameType;
        this.deckType = deckType;
        this.maxPlayers = maxPlayers;
    }

    public static GameFormat byId(String id) {
        for (GameFormat f : values()) {
            if (f.id.equalsIgnoreCase(id)) {
                return f;
            }
        }
        return COMMANDER;
    }

    public String getLabel() {
        return label;
    }

    /** prefixo (relativo à pasta de decks) de onde sortear decks aleatórios */
    public String getDeckFolder() {
        return deckFolder;
    }

    public String getMultiplayerGameType() {
        return multiplayerGameType;
    }

    public String getDuelGameType() {
        return duelGameType;
    }

    public String getDeckType() {
        return deckType;
    }

    public int getMaxPlayers() {
        return maxPlayers;
    }
}
