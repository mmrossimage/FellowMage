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
    private static final String GAME_TYPE = "Two Player Duel";
    private static final String DECK_TYPE = "Constructed - Freeform Unlimited";

    private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();

    private final WebSocket socket;
    private final DeckLibrary decks;
    // chamadas ao servidor XMage são bloqueantes: nunca rodar na thread do WebSocket
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "bridge-worker");
        t.setDaemon(true);
        return t;
    });

    private Session session;
    private String userName;
    private UUID roomId;
    private UUID gameId;
    private UUID playerId;

    public ClientBridge(WebSocket socket, DeckLibrary decks) {
        this.socket = socket;
        this.decks = decks;
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
            case "startAiGame":
                startAiGame(str(cmd, "deck"), str(cmd, "aiDeck"));
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

        session = new SessionImpl(this);
        if (!session.connectStart(connection)) {
            sendError("Não foi possível conectar em " + connection.getHost() + ":" + port + " — " + session.getLastError());
            session = null;
            return;
        }
        roomId = session.getMainRoomId();
        send(msg("connected").with("user", userName).with("server", connection.getHost() + ":" + port));
    }

    private void startAiGame(String deckPath, String aiDeckPath) throws Exception {
        if (session == null || !session.isConnected()) {
            sendError("Conecte-se ao servidor antes de iniciar uma partida.");
            return;
        }
        List<String> all = decks.list();
        if (all.isEmpty()) {
            sendError("Nenhum deck encontrado em " + decks.getRoot());
            return;
        }
        Random rnd = new Random();
        DeckCardLists myDeck = decks.load(deckPath == null ? all.get(rnd.nextInt(all.size())) : deckPath);
        DeckCardLists aiDeck = decks.load(aiDeckPath == null ? all.get(rnd.nextInt(all.size())) : aiDeckPath);

        GameTypeView gameType = session.getGameTypes().stream()
                .filter(g -> g.getName().equals(GAME_TYPE))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Servidor sem o tipo de jogo " + GAME_TYPE));

        MatchOptions options = new MatchOptions("FellowMage: " + userName + " vs IA", gameType.getName(), false);
        options.getPlayerTypes().add(PlayerType.HUMAN);
        options.getPlayerTypes().add(PlayerType.COMPUTER_MAD);
        options.setDeckType(DECK_TYPE);
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
        if (!session.joinTable(roomId, tableId, "IA", PlayerType.COMPUTER_MAD, 6, aiDeck, "")) {
            sendError("A IA não conseguiu entrar com o deck '" + aiDeck.getName() + "': " + session.getLastError());
            return;
        }
        send(msg("tableReady").with("deck", myDeck.getName()).with("aiDeck", aiDeck.getName()));
        session.startMatch(roomId, tableId);
    }

    private void requireGame() {
        if (session == null || gameId == null) {
            throw new IllegalStateException("nenhuma partida em andamento");
        }
    }

    public void close() {
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
