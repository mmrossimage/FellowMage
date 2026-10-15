package fellowmage.gateway;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import mage.cards.decks.DeckCardLists;
import mage.constants.ManaType;
import mage.constants.MatchTimeLimit;
import mage.constants.MultiplayerAttackOption;
import mage.constants.PlayerAction;
import mage.constants.RangeOfInfluence;
import mage.game.match.MatchOptions;
import mage.interfaces.MageClient;
import mage.interfaces.callback.ClientCallback;
import mage.players.PlayerType;
import mage.players.net.SkipPrioritySteps;
import mage.players.net.UserData;
import mage.players.net.UserSkipPrioritySteps;
import mage.remote.Connection;
import mage.remote.Session;
import mage.remote.SessionImpl;
import mage.utils.MageVersion;
import mage.view.AbilityPickerView;
import mage.view.ChatMessage;
import mage.view.GameClientMessage;
import mage.view.GameEndView;
import mage.view.GameTypeView;
import mage.view.GameView;
import mage.view.TableClientMessage;
import mage.view.TableView;
import mage.view.UserRequestMessage;
import org.java_websocket.WebSocket;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Uma conexão do navegador = um cliente XMage "headless".
 * <p>
 * Recebe comandos JSON do navegador e os traduz para chamadas de {@link Session};
 * recebe callbacks do servidor XMage e os traduz para mensagens JSON.
 */
public final class ClientBridge implements MageClient {

    private static final MageVersion VERSION = new MageVersion(MageClient.class);

    private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();

    private final WebSocket socket;
    private final DeckLibrary decks;
    // chamadas ao servidor XMage são bloqueantes: nunca rodar na thread do WebSocket
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "bridge-worker");
        t.setDaemon(true);
        return t;
    });

    // o servidor considera a conexão perdida sem pings periódicos (o cliente Swing usa 20 s, ver TablesPanel.PING_SERVER_SECS)
    private static final int PING_SECS = 20;
    private final java.util.concurrent.ScheduledExecutorService pinger = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "bridge-ping");
        t.setDaemon(true);
        return t;
    });

    // preferências enviadas ao servidor (inclui as paradas de prioridade por passo)
    private final UserData userData = UserData.getDefaultUserDataView();

    private Session session;
    private String userName;
    private UUID roomId;
    private UUID gameId;
    private UUID playerId;

    public ClientBridge(WebSocket socket, DeckLibrary decks) {
        this.socket = socket;
        this.decks = decks;
        pinger.scheduleAtFixedRate(() -> {
            Session s = session;
            if (s != null && s.isConnected()) {
                s.ping();
            }
        }, PING_SECS, PING_SECS, java.util.concurrent.TimeUnit.SECONDS);
    }

    // ------------------------------------------------------------------ navegador -> XMage

    public void handleCommand(String json) {
        worker.submit(() -> {
            JsonObject cmd;
            try {
                cmd = JsonParser.parseString(json).getAsJsonObject();
            } catch (Exception e) {
                sendError("JSON inválido: " + e.getMessage());
                return;
            }
            String type = str(cmd, "t");
            try {
                dispatch(type, cmd);
            } catch (Exception e) {
                e.printStackTrace();
                sendError("Falha em '" + type + "': " + e.getMessage());
            }
        });
    }

    private void dispatch(String type, JsonObject cmd) throws Exception {
        switch (type) {
            case "connect":
                connect(str(cmd, "host"), cmd.has("port") ? cmd.get("port").getAsInt() : 17171, str(cmd, "user"));
                return;
            case "listDecks":
                send(msg("decks").with("decks", decks.list()));
                return;
            case "startGame": {
                List<String> opponentDecks = new java.util.ArrayList<>();
                if (cmd.has("opponents")) {
                    cmd.getAsJsonArray("opponents").forEach(e -> opponentDecks.add(e.isJsonNull() ? null : e.getAsString()));
                }
                startGame(GameFormat.byId(str(cmd, "format")), str(cmd, "deck"), opponentDecks,
                        cmd.has("aiSkill") ? cmd.get("aiSkill").getAsInt() : 6);
                return;
            }
            case "setStops":
                setStops(cmd.getAsJsonObject("stops"));
                return;
        }

        requireGame();
        switch (type) {
            case "sendUUID":
                session.sendPlayerUUID(gameId, UUID.fromString(str(cmd, "id")));
                break;
            case "sendBoolean":
                session.sendPlayerBoolean(gameId, cmd.get("value").getAsBoolean());
                break;
            case "sendInteger":
                session.sendPlayerInteger(gameId, cmd.get("value").getAsInt());
                break;
            case "sendString":
                session.sendPlayerString(gameId, str(cmd, "value"));
                break;
            case "sendManaType":
                session.sendPlayerManaType(gameId, playerId, ManaType.valueOf(str(cmd, "mana")));
                break;
            case "action":
                session.sendPlayerAction(PlayerAction.valueOf(str(cmd, "action")), gameId, null);
                break;
            case "concede":
                session.sendPlayerAction(PlayerAction.CONCEDE, gameId, null);
                break;
            default:
                sendError("Comando desconhecido: " + type);
        }
    }

    private void connect(String host, int port, String user) {
        if (session != null && session.isConnected()) {
            session.connectStop(false, false);
        }
        userName = (user == null || user.isEmpty()) ? "Mago" + new Random().nextInt(10000) : user;

        Connection connection = new Connection();
        connection.setHost(host == null || host.isEmpty() ? "localhost" : host);
        connection.setPort(port);
        connection.setUsername(userName);
        connection.setProxyType(Connection.ProxyType.NONE);
        connection.setUserData(userData);

        session = new SessionImpl(this);
        if (!session.connectStart(connection)) {
            sendError("Não foi possível conectar em " + connection.getHost() + ":" + port + " — " + session.getLastError());
            session = null;
            return;
        }
        roomId = session.getMainRoomId();
        send(msg("connected").with("user", userName).with("server", connection.getHost() + ":" + port)
                .with("stops", stopsToJson()));
    }

    private void startGame(GameFormat format, String deckPath, List<String> opponentDecks, int aiSkill) throws Exception {
        if (session == null || !session.isConnected()) {
            sendError("Conecte-se ao servidor antes de iniciar uma partida.");
            return;
        }
        List<String> pool = decks.list().stream()
                .filter(d -> d.startsWith(format.getDeckFolder()))
                .collect(java.util.stream.Collectors.toList());
        if (pool.isEmpty()) {
            sendError("Nenhum deck em " + decks.getRoot().resolve(format.getDeckFolder()));
            return;
        }
        int opponents = Math.max(1, Math.min(format.getMaxPlayers() - 1, opponentDecks.isEmpty() ? format.getMaxPlayers() - 1 : opponentDecks.size()));
        Random rnd = new Random();
        DeckCardLists myDeck = decks.load(deckPath == null ? pool.get(rnd.nextInt(pool.size())) : deckPath);
        List<DeckCardLists> aiDecks = new java.util.ArrayList<>();
        for (int i = 0; i < opponents; i++) {
            String path = i < opponentDecks.size() ? opponentDecks.get(i) : null;
            aiDecks.add(decks.load(path == null ? pool.get(rnd.nextInt(pool.size())) : path));
        }
        boolean multiplayer = opponents > 1;
        String gameTypeName = multiplayer ? format.getMultiplayerGameType() : format.getDuelGameType();

        GameTypeView gameType = session.getGameTypes().stream()
                .filter(g -> g.getName().equals(gameTypeName))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Servidor sem o tipo de jogo " + gameTypeName));

        MatchOptions options = new MatchOptions("FellowMage: " + userName + " (" + format.getLabel() + ")", gameType.getName(), multiplayer);
        options.getPlayerTypes().add(PlayerType.HUMAN);
        for (int i = 0; i < opponents; i++) {
            options.getPlayerTypes().add(PlayerType.COMPUTER_MAD);
        }
        options.setDeckType(format.getDeckType());
        options.setLimited(false);
        options.setAttackOption(MultiplayerAttackOption.MULTIPLE);
        options.setRange(RangeOfInfluence.ALL);
        options.setWinsNeeded(1);
        options.setMatchTimeLimit(MatchTimeLimit.NONE);

        TableView table = session.createTable(roomId, options);
        if (table == null) {
            sendError("O servidor recusou a criação da mesa: " + session.getLastError());
            return;
        }
        UUID tableId = table.getTableId();
        if (!session.joinTable(roomId, tableId, userName, PlayerType.HUMAN, 1, myDeck, "")) {
            sendError("Não foi possível entrar na mesa com o deck '" + myDeck.getName() + "': " + session.getLastError());
            return;
        }
        List<String> aiNames = new java.util.ArrayList<>();
        for (int i = 0; i < aiDecks.size(); i++) {
            String aiName = "IA " + (i + 1) + " (" + shortName(aiDecks.get(i).getName()) + ")";
            if (!session.joinTable(roomId, tableId, aiName, PlayerType.COMPUTER_MAD, aiSkill, aiDecks.get(i), "")) {
                sendError("A IA não conseguiu entrar com o deck '" + aiDecks.get(i).getName() + "': " + session.getLastError());
                session.removeTable(roomId, tableId);
                return;
            }
            aiNames.add(aiName);
        }
        send(msg("tableReady").with("format", format.getLabel()).with("deck", myDeck.getName()).with("opponents", aiNames));
        session.startMatch(roomId, tableId);
    }

    private static String shortName(String deckName) {
        String s = deckName.replaceAll("\\s*\\(.*?\\)", "").trim();
        return s.length() > 18 ? s.substring(0, 17) + "…" : s;
    }

    // ------------------------------------------------------------------ paradas de prioridade

    private static final String[] STOP_STEPS = {"upkeep", "draw", "main1", "beforeCombat", "endOfCombat", "main2", "endOfTurn"};

    private void setStops(JsonObject stops) {
        UserSkipPrioritySteps s = userData.getUserSkipPrioritySteps();
        applyStops(s.getYourTurn(), stops.getAsJsonObject("yourTurn"));
        applyStops(s.getOpponentTurn(), stops.getAsJsonObject("opponentTurn"));
        if (session != null && session.isConnected()) {
            session.updatePreferencesForServer(userData);
        }
        send(msg("stops").with("stops", stopsToJson()));
    }

    private static void applyStops(SkipPrioritySteps target, JsonObject src) {
        if (src == null) {
            return;
        }
        for (String step : STOP_STEPS) {
            if (!src.has(step)) {
                continue;
            }
            boolean v = src.get(step).getAsBoolean();
            switch (step) {
                case "upkeep": target.setUpkeep(v); break;
                case "draw": target.setDraw(v); break;
                case "main1": target.setMain1(v); break;
                case "beforeCombat": target.setBeforeCombat(v); break;
                case "endOfCombat": target.setEndOfCombat(v); break;
                case "main2": target.setMain2(v); break;
                case "endOfTurn": target.setEndOfTurn(v); break;
                default: break;
            }
        }
    }

    private Map<String, Object> stopsToJson() {
        UserSkipPrioritySteps s = userData.getUserSkipPrioritySteps();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("yourTurn", stepsToJson(s.getYourTurn()));
        m.put("opponentTurn", stepsToJson(s.getOpponentTurn()));
        return m;
    }

    private static Map<String, Boolean> stepsToJson(SkipPrioritySteps s) {
        Map<String, Boolean> m = new LinkedHashMap<>();
        m.put("upkeep", s.isUpkeep());
        m.put("draw", s.isDraw());
        m.put("main1", s.isMain1());
        m.put("beforeCombat", s.isBeforeCombat());
        m.put("endOfCombat", s.isEndOfCombat());
        m.put("main2", s.isMain2());
        m.put("endOfTurn", s.isEndOfTurn());
        return m;
    }

    private void requireGame() {
        if (session == null || gameId == null) {
            throw new IllegalStateException("nenhuma partida em andamento");
        }
    }

    public void close() {
        pinger.shutdownNow();
        worker.submit(() -> {
            if (session != null && session.isConnected()) {
                session.connectStop(false, false);
            }
        });
        worker.shutdown();
    }

    // ------------------------------------------------------------------ XMage -> navegador

    @Override
    public void onCallback(ClientCallback callback) {
        try {
            callback.decompressData();
            handleCallback(callback);
        } catch (Throwable e) {
            e.printStackTrace();
            sendError("Erro ao processar " + callback.getMethod() + ": " + e);
        }
    }

    private void handleCallback(ClientCallback callback) {
        Object data = callback.getData();
        switch (callback.getMethod()) {
            case START_GAME: {
                TableClientMessage m = (TableClientMessage) data;
                gameId = m.getGameId();
                playerId = m.getPlayerId();
                session.joinGame(gameId);
                // o log da partida chega como mensagens do chat do jogo
                session.getGameChatId(gameId).ifPresent(session::joinChat);
                send(msg("gameStarted").with("gameId", gameId).with("playerId", playerId));
                break;
            }
            case GAME_INIT:
            case GAME_UPDATE:
                sendGame(callback.getMethod().name(), (GameView) data, null);
                break;

            case GAME_UPDATE_AND_INFORM:
            case GAME_INFORM_PERSONAL: {
                GameClientMessage m = (GameClientMessage) data;
                sendGame(callback.getMethod().name(), m.getGameView(), prompt("inform", m));
                break;
            }
            case GAME_SELECT:
                sendGameMessage("select", callback, (GameClientMessage) data);
                break;
            case GAME_TARGET:
                sendGameMessage("target", callback, (GameClientMessage) data);
                break;
            case GAME_ASK:
                sendGameMessage("ask", callback, (GameClientMessage) data);
                break;
            case GAME_CHOOSE_CHOICE:
                sendGameMessage("choice", callback, (GameClientMessage) data);
                break;
            case GAME_CHOOSE_PILE:
                sendGameMessage("pile", callback, (GameClientMessage) data);
                break;
            case GAME_PLAY_MANA:
                sendGameMessage("playMana", callback, (GameClientMessage) data);
                break;
            case GAME_PLAY_XMANA:
                sendGameMessage("playXMana", callback, (GameClientMessage) data);
                break;
            case GAME_GET_AMOUNT:
                sendGameMessage("amount", callback, (GameClientMessage) data);
                break;
            case GAME_GET_MULTI_AMOUNT:
                sendGameMessage("multiAmount", callback, (GameClientMessage) data);
                break;
            case GAME_CHOOSE_ABILITY: {
                AbilityPickerView v = (AbilityPickerView) data;
                Map<String, Object> p = new LinkedHashMap<>();
                p.put("kind", "ability");
                p.put("message", v.getMessage());
                p.put("abilities", v.getChoices());
                sendGame(callback.getMethod().name(), v.getGameView(), p);
                break;
            }
            case GAME_ERROR:
                send(msg("gameError").with("message", String.valueOf(data)));
                break;
            case GAME_OVER: {
                String text = data instanceof GameClientMessage ? ((GameClientMessage) data).getMessage() : String.valueOf(data);
                send(msg("gameOver").with("message", text));
                break;
            }
            case END_GAME_INFO: {
                GameEndView v = (GameEndView) data;
                send(msg("endGame").with("won", v.hasWon()).with("title", v.getGameInfo()).with("info", v.getMatchInfo()));
                break;
            }
            case CHATMESSAGE: {
                ChatMessage m = (ChatMessage) data;
                send(msg("chat").with("message", m.getMessage()).with("turnInfo", m.getTurnInfo())
                        .with("username", m.getUsername()).with("type", String.valueOf(m.getMessageType())));
                break;
            }
            case SHOW_USERMESSAGE:
                send(msg("userMessage").with("lines", data));
                break;
            case SERVER_MESSAGE:
                send(msg("serverMessage").with("message", String.valueOf(data)));
                break;
            case USER_REQUEST_DIALOG: {
                UserRequestMessage m = (UserRequestMessage) data;
                send(msg("userRequest").with("title", m.getTitle()).with("message", m.getMessage()));
                break;
            }
            default:
                // JOINED_TABLE, torneios, draft etc.: ainda não suportados no cliente web
                send(msg("event").with("method", callback.getMethod().name()));
        }
    }

    private void sendGameMessage(String kind, ClientCallback callback, GameClientMessage m) {
        sendGame(callback.getMethod().name(), m.getGameView(), prompt(kind, m));
    }

    private Map<String, Object> prompt(String kind, GameClientMessage m) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("kind", kind);
        p.put("message", m.getMessage());
        p.put("flag", m.isFlag());
        p.put("min", m.getMin());
        p.put("max", m.getMax());
        if (m.getTargets() != null && !m.getTargets().isEmpty()) {
            p.put("targets", m.getTargets());
        }
        if (m.getOptions() != null && !m.getOptions().isEmpty()) {
            Map<String, Object> opts = new LinkedHashMap<>();
            m.getOptions().forEach((k, v) -> {
                if (v instanceof Number || v instanceof Boolean) {
                    opts.put(k, v);
                } else if (v instanceof java.util.Collection) {
                    // ex.: possibleAttackers / possibleBlockers (UUIDs)
                    opts.put(k, ((java.util.Collection<?>) v).stream().map(String::valueOf).toArray());
                } else if (v != null) {
                    opts.put(k, String.valueOf(v));
                }
            });
            p.put("options", opts);
        }
        if (m.getCardsView1() != null && !m.getCardsView1().isEmpty()) {
            p.put("cards1", ViewMapper.cards(m.getCardsView1(), null));
        }
        if (m.getCardsView2() != null && !m.getCardsView2().isEmpty()) {
            p.put("cards2", ViewMapper.cards(m.getCardsView2(), null));
        }
        if (m.getChoice() != null) {
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("message", m.getChoice().getMessage());
            c.put("subMessage", m.getChoice().getSubMessage());
            c.put("required", m.getChoice().isRequired());
            if (m.getChoice().isKeyChoice()) {
                c.put("keyChoices", m.getChoice().getKeyChoices());
            } else {
                c.put("choices", m.getChoice().getChoices());
            }
            p.put("choice", c);
        }
        if (m.getMessages() != null && !m.getMessages().isEmpty()) {
            p.put("multiAmount", m.getMessages().stream().map(a -> {
                Map<String, Object> x = new LinkedHashMap<>();
                x.put("message", a.message);
                x.put("min", a.min);
                x.put("max", a.max);
                x.put("default", a.defaultValue);
                return x;
            }).toArray());
        }
        return p;
    }

    private void sendGame(String method, GameView view, Map<String, Object> prompt) {
        Msg m = msg("game").with("method", method);
        if (view != null) {
            m.with("game", ViewMapper.game(view));
        }
        if (prompt != null) {
            m.with("prompt", prompt);
        }
        send(m);
    }

    @Override
    public void onNewConnection() {
        // nada: reconexão automática ainda não suportada
    }

    @Override
    public MageVersion getVersion() {
        return VERSION;
    }

    @Override
    public void connected(String message) {
        // a confirmação é enviada em connect(), após obter a sala principal
    }

    @Override
    public void disconnected(boolean askToReconnect, boolean keepMySessionActive) {
        gameId = null;
        send(msg("disconnected"));
    }

    @Override
    public void showMessage(String message) {
        send(msg("serverMessage").with("message", message));
    }

    @Override
    public void showError(String message) {
        sendError(message);
    }

    // ------------------------------------------------------------------ util

    private void sendError(String message) {
        send(msg("error").with("message", message));
    }

    private void send(Msg m) {
        if (socket.isOpen()) {
            socket.send(GSON.toJson(m.body));
        }
    }

    private static String str(JsonObject o, String key) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : null;
    }

    private static Msg msg(String type) {
        return new Msg(type);
    }

    private static final class Msg {
        final Map<String, Object> body = new LinkedHashMap<>();

        Msg(String type) {
            body.put("t", type);
        }

        Msg with(String key, Object value) {
            body.put(key, value);
            return this;
        }
    }
}
