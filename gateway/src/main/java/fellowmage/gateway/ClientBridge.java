package fellowmage.gateway;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import mage.cards.decks.DeckCardLists;
import mage.constants.ManaType;
import mage.constants.MatchBufferTime;
import mage.constants.MatchTimeLimit;
import mage.constants.MultiplayerAttackOption;
import mage.constants.PlayerAction;
import mage.constants.RangeOfInfluence;
import mage.constants.SkillLevel;
import mage.game.match.MatchOptions;
import mage.interfaces.MageClient;
import mage.interfaces.callback.ClientCallback;
import mage.interfaces.callback.ClientCallbackMethod;
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
import mage.game.draft.DraftOptions;
import mage.game.tournament.TournamentOptions;
import mage.view.DraftClientMessage;
import mage.view.DraftPickView;
import mage.view.MatchView;
import mage.view.TournamentTypeView;
import mage.view.TournamentView;
import mage.view.RoomUsersView;
import mage.view.TableClientMessage;
import mage.view.UsersView;
import mage.view.TableView;
import mage.view.UserRequestMessage;
import org.java_websocket.WebSocket;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
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

    static final MageVersion VERSION = new MageVersion(MageClient.class);

    private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();

    private volatile WebSocket socket;
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
    // mesa criada por este cliente: removida ao sair, senão as IAs seguem jogando no servidor
    // e ocupam o limite de IAs simultâneas (maxAiOpponents)
    private UUID ownTableId;
    private UUID gameId;
    private UUID playerId;
    // mesa em que estamos (criada por nós ou de outro jogador) e o deck usado nela,
    // reenviado sem alterações quando o servidor abre o sideboard entre os jogos
    private UUID currentTableId;
    private DeckCardLists currentDeck;
    // chats que acompanhamos: as mensagens chegam com o id do chat e são separadas por origem
    private volatile UUID roomChatId;
    private volatile UUID tableChatId;

    /** Onde pontes "estacionadas" (navegador desconectado) esperam uma reconexão. */
    public interface Registry {
        /** Devolve a ponte estacionada para a chave, já religada ao novo socket, ou null. */
        ClientBridge claimParked(String key, WebSocket newSocket);

        void park(String key, ClientBridge bridge);

        void unpark(String key, ClientBridge bridge);
    }

    // tempo que a sessão XMage espera o navegador voltar (recarregar página, queda de rede)
    private static final int PARK_SECS = 120;
    private static final int CHAT_HISTORY = 200;

    private final Registry registry;
    private String parkKey;
    private String serverLabel;
    private volatile String lastServerError;
    /** último aviso do SessionImpl (showMessage); explica falhas de conexão */
    private volatile String lastServerMessage;
    private java.util.concurrent.ScheduledFuture<?> parkExpiry;
    // estado reenviado quando o navegador reconecta
    private volatile String lastGameJson;
    private volatile String lastPromptJson;
    private volatile boolean promptAnswered = true;
    private final java.util.Deque<String> chatHistory = new java.util.concurrent.ConcurrentLinkedDeque<>();
    // pedidos do servidor aguardando o clique do jogador (id enviado ao navegador -> mensagem original)
    private final Map<String, UserRequestMessage> userRequests = new java.util.concurrent.ConcurrentHashMap<>();
    // deck aguardando montagem (sideboard / limitado); reenviado se o navegador reconectar
    private volatile DeckBuilding deckBuilding;
    // assistindo (espectador) a gameId, sem jogador próprio
    private volatile boolean watching;
    private volatile UUID replayId;
    // torneio em andamento (e o draft dele, se houver); o chat do torneio aparece como chat da mesa
    private volatile UUID tournamentId;
    private volatile UUID tournamentChatId;
    private volatile UUID draftId;
    private volatile String lastDraftJson;

    private final CardCatalog catalog;
    private final DeckService deckService;

    public ClientBridge(WebSocket socket, DeckLibrary decks, CardCatalog catalog, DeckService deckService, Registry registry) {
        this.socket = socket;
        this.decks = decks;
        this.catalog = catalog;
        this.deckService = deckService;
        this.registry = registry;
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
                connect(str(cmd, "host"), cmd.has("port") ? cmd.get("port").getAsInt() : 17171, str(cmd, "user"),
                        cmd.has("local") && cmd.get("local").getAsBoolean());
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

            // ---- lobby online: mesas, sala de espera e chat
            case "lobbyOptions":
                requireSession();
                sendLobbyOptions();
                return;
            case "listTables":
                requireSession();
                send(msg("tables").with("tables", session.getTables(roomId).stream()
                        .map(ViewMapper::table).collect(java.util.stream.Collectors.toList())));
                return;
            case "createTable":
                requireSession();
                createTable(cmd);
                return;
            case "joinTable":
                requireSession();
                joinTable(UUID.fromString(str(cmd, "tableId")), str(cmd, "deck"), str(cmd, "password"),
                        cmd.has("tournament") && cmd.get("tournament").getAsBoolean());
                return;
            case "createTournament":
                requireSession();
                createTournament(cmd);
                return;
            case "tournamentInfo":
                requireSession();
                sendTournamentInfo();
                return;
            case "draftPick": {
                // escolher a carta do booster (DraftPanel: sendCardPick; devolve as escolhas atualizadas)
                requireSession();
                UUID id = draftId;
                if (id != null) {
                    DraftPickView v = session.sendCardPick(id, UUID.fromString(str(cmd, "cardId")), new java.util.HashSet<>());
                    if (v != null) {
                        send(msg("draftPicked").with("picks", Tournaments.cards(v.getPicks(), catalog)));
                    }
                }
                return;
            }
            case "draftMark":
                requireSession();
                if (draftId != null) {
                    session.sendCardMark(draftId, UUID.fromString(str(cmd, "cardId")));
                }
                return;
            case "quitTournament":
                requireSession();
                quitTournament();
                return;
            case "tableInfo":
                requireSession();
                sendTableInfo();
                return;
            case "startMatch":
                requireSession();
                if (currentTableId != null) {
                    boolean tourney = session.getTable(roomId, currentTableId).map(TableView::isTournament).orElse(false);
                    if (!(tourney ? session.startTournament(roomId, currentTableId) : session.startMatch(roomId, currentTableId))) {
                        sendError("Não foi possível começar. " + session.getLastError());
                    }
                }
                return;
            case "leaveTable":
                requireSession();
                leaveCurrentTable();
                send(msg("tableLeft"));
                return;
            case "quit":
                // sair da partida (eliminado no multiplayer, partida encerrada ou saída pela tela);
                // não exige partida em andamento: depois do GAME_OVER o gameId já foi esquecido
                if (session != null && session.isConnected()) {
                    leaveCurrentTable();
                }
                return;
            case "swapSeats":
                // dono da mesa reordena os lugares (Move up/down da sala de espera oficial)
                requireSession();
                if (currentTableId != null && !session.swapSeats(roomId, currentTableId, cmd.get("a").getAsInt(), cmd.get("b").getAsInt())) {
                    sendError("Não foi possível trocar os lugares. " + session.getLastError());
                }
                sendTableInfo();
                return;
            case "watchTable":
                // o servidor responde com WATCHGAME, tratado em handleCallback
                requireSession();
                leaveCurrentTable();
                if (!session.watchTable(roomId, UUID.fromString(str(cmd, "tableId")))) {
                    sendError("Não foi possível assistir a esta mesa. " + session.getLastError());
                }
                return;
            case "roomUsers": {
                requireSession();
                List<Map<String, Object>> users = new java.util.ArrayList<>();
                int activeGames = 0;
                for (RoomUsersView r : session.getRoomUsers(roomId)) {
                    activeGames = r.getNumberActiveGames();
                    for (UsersView u : r.getUsersView()) {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("name", u.getUserName());
                        m.put("flag", u.getFlagName());
                        m.put("games", u.getInfoGames());
                        m.put("ping", u.getInfoPing());
                        m.put("history", u.getMatchHistory());
                        m.put("quitRatio", u.getMatchQuitRatio());
                        m.put("rating", u.getGeneralRating());
                        users.add(m);
                    }
                }
                send(msg("roomUsers").with("users", users).with("activeGames", activeGames));
                return;
            }
            case "finishedMatches": {
                requireSession();
                List<Map<String, Object>> matches = new java.util.ArrayList<>();
                for (MatchView v : session.getFinishedMatches(roomId)) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", v.getMatchId());
                    m.put("name", v.getName());
                    m.put("gameType", v.getGameType());
                    m.put("deckType", v.getDeckType());
                    m.put("players", v.getPlayers());
                    m.put("result", v.getResult());
                    m.put("start", v.getStartTime() == null ? null : v.getStartTime().getTime());
                    m.put("end", v.getEndTime() == null ? null : v.getEndTime().getTime());
                    m.put("tournament", v.isTournament());
                    m.put("replay", v.isReplayAvailable());
                    m.put("games", v.getGames());
                    matches.add(m);
                }
                send(msg("finishedMatches").with("matches", matches));
                return;
            }
            case "serverMessages":
                requireSession();
                send(msg("serverMessages").with("messages", session.getServerMessages()));
                return;
            case "replay":
                // replay de jogo gravado no servidor: REPLAY_GAME -> startReplay -> REPLAY_INIT/UPDATE/DONE
                requireSession();
                leaveCurrentTable();
                if (!session.replayGame(UUID.fromString(str(cmd, "gameId")))) {
                    sendError("Replay indisponível. " + session.getLastError());
                }
                return;
            case "replayStep": {
                requireSession();
                UUID id = replayId;
                if (id == null) {
                    return;
                }
                String dir = str(cmd, "dir");
                if ("next".equals(dir)) {
                    session.nextPlay(id);
                } else if ("prev".equals(dir)) {
                    session.previousPlay(id);
                } else if ("skip".equals(dir)) {
                    session.skipForward(id, cmd.has("moves") ? cmd.get("moves").getAsInt() : 10);
                } else if ("stop".equals(dir)) {
                    session.stopReplay(id);
                    replayId = null;
                    send(msg("replayDone"));
                }
                return;
            }
            case "submitDeck":
                requireSession();
                submitBuiltDeck(cmd, true);
                return;
            case "updateDeck":
                requireSession();
                submitBuiltDeck(cmd, false);
                return;
            case "userReply":
                requireSession();
                userReply(str(cmd, "id"), str(cmd, "action"));
                return;
            case "sendChat": {
                requireSession();
                UUID chatId = chatIdFor(str(cmd, "chat"));
                String text = str(cmd, "text");
                if (chatId == null) {
                    sendError("Este chat não está disponível agora.");
                } else if (text != null && !text.trim().isEmpty()) {
                    session.sendChatMessage(chatId, text.trim());
                }
                return;
            }

            // ---- editor de decks (não precisa de partida nem de conexão com o servidor XMage)
            case "searchCards":
                send(msg("cards").with("reqId", str(cmd, "reqId")).with("status", catalog.getStatus())
                        .with("result", catalog.search(query(cmd.getAsJsonObject("query")))));
                return;
            case "userDecks":
                send(msg("userDecks").with("decks", deckService.userDeckSummaries()));
                // decks vinculados ao Moxfield: confere em segundo plano e reenvia a lista se algo mudou
                deckService.syncStaleAsync(() -> worker.submit(this::sendDeckLists));
                return;
            case "linkMoxfield": {
                String path = deckService.linkMoxfield(str(cmd, "url"));
                sendDeckLists();
                send(msg("moxfieldLinked").with("path", path));
                return;
            }
            case "syncMoxfield":
                deckService.syncMoxfield(str(cmd, "path"), true);
                sendDeckLists();
                send(msg("userMessage").with("lines", List.of("Deck atualizado a partir do Moxfield.")));
                return;
            case "setMoxfieldSubstitute":
                deckService.setMoxfieldSubstitute(str(cmd, "path"), str(cmd, "card"),
                        cmd.has("substitute") && cmd.get("substitute").isJsonObject() ? cmd.getAsJsonObject("substitute") : null);
                sendDeckLists();
                return;
            case "unlinkMoxfield":
                deckService.unlinkMoxfield(str(cmd, "path"));
                sendDeckLists();
                return;
            case "loadDeck":
                send(msg("deck").with("deck", deckService.toEditor(str(cmd, "path"))));
                return;
            case "saveDeck": {
                String saved = deckService.save(str(cmd, "path"), cmd.getAsJsonObject("deck"));
                send(msg("deckSaved").with("path", saved));
                send(msg("decks").with("decks", decks.list()));
                return;
            }
            case "deleteDeck":
                deckService.delete(str(cmd, "path"));
                sendDeckLists();
                return;
            case "importDecklist":
                send(msg("decklist").with("result", deckService.importText(str(cmd, "text"))));
                return;
            case "printings":
                send(msg("printings").with("result", deckService.printings(str(cmd, "name"))));
                return;
        }

        requireGame();
        if (type.startsWith("send")) {
            promptAnswered = true;
        }
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
            case "action": {
                // data: id de jogador (ver mão, permissões) ou número de turnos (ROLLBACK_TURNS), como no PlayAreaPanel
                PlayerAction action = PlayerAction.valueOf(str(cmd, "action"));
                if (action == PlayerAction.PASS_PRIORITY_UNTIL_END_STEP_BEFORE_MY_NEXT_TURN) {
                    armEndStepStop();
                } else if (action.name().startsWith("PASS_PRIORITY_")) {
                    restoreEndStepStop(); // outra ação de passar desliga o F11 no servidor
                }
                session.sendPlayerAction(action, gameId, actionData(cmd));
                break;
            }
            case "concede":
                session.sendPlayerAction(PlayerAction.CONCEDE, gameId, null);
                break;
            case "logout":
                // saída voluntária: ao fechar o socket, encerra a sessão em vez de estacioná-la
                parkKey = null;
                break;
            default:
                sendError("Comando desconhecido: " + type);
        }
    }

    private void connect(String host, int port, String user, boolean local) {
        String realHost = host == null || host.isEmpty() ? "localhost" : host;
        if (local) {
            // modo contra a IA: servidor XMage nesta máquina, ligado só quando pedido
            realHost = LocalServer.HOST;
            port = LocalServer.PORT;
        }
        if ("localhost".equalsIgnoreCase(realHost)) {
            // "localhost" pode resolver para ::1, e o servidor do pacote escuta só em 127.0.0.1 (IPv4)
            realHost = "127.0.0.1";
        }
        if (user != null && !user.isEmpty()) {
            // mesmo usuário voltando dentro do prazo: retoma a sessão (e a partida) estacionada
            String key = (user + "@" + realHost + ":" + port).toLowerCase();
            ClientBridge parked = registry.claimParked(key, socket);
            if (parked != null) {
                parked.handleResume();
                disposeUnused();
                return;
            }
            parkKey = key;
        }
        if (session != null && session.isConnected()) {
            session.connectStop(false, false);
        }
        if (local && !LocalServer.isRunning()) {
            send(msg("localServer").with("state", "starting"));
            try {
                LocalServer.ensureRunning();
            } catch (java.io.IOException e) {
                sendError("Não foi possível iniciar o servidor local: " + e.getMessage());
                return;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
        userName = (user == null || user.isEmpty()) ? "Mago" + new Random().nextInt(10000) : user;

        Connection connection = new Connection();
        connection.setHost(realHost);
        connection.setPort(port);
        connection.setUsername(userName);
        connection.setProxyType(Connection.ProxyType.NONE);
        connection.setUserData(userData);

        session = new SessionImpl(this);
        lastServerMessage = null;
        if (!session.connectStart(connection)) {
            // o SessionImpl só avisa o motivo (ex.: versões diferentes) por showMessage; o cliente oficial
            // o mostra num diálogo, aqui ele vai junto do erro para aparecer na tela de conexão
            String reason = session.getLastError();
            if ((reason == null || reason.isEmpty()) && lastServerMessage != null) {
                reason = lastServerMessage
                        .replaceFirst("^Remote task error: ", "")
                        .replaceFirst("^[\\w.]+Exception: ", "")
                        .replaceAll("(?i)<br\\s*/?>", " ");
            }
            sendError("Não foi possível conectar em " + connection.getHost() + ":" + port + " — " + reason);
            session = null;
            return;
        }
        roomId = session.getMainRoomId();
        if (!local) {
            // chat geral da sala, como no lobby do cliente oficial
            roomChatId = session.getRoomChatId(roomId).orElse(null);
            if (roomChatId != null) {
                session.joinChat(roomChatId);
            }
        }
        serverLabel = connection.getHost() + ":" + port;
        send(msg("connected").with("user", userName).with("server", serverLabel)
                .with("clientVersion", VERSION.toString()).with("serverVersion", session.getVersionInfo())
                .with("stops", stopsToJson()).with("inGame", false));
    }

    private void startGame(GameFormat format, String deckPath, List<String> opponentDecks, int aiSkill) throws Exception {
        if (session == null || !session.isConnected()) {
            sendError("Conecte-se ao servidor antes de iniciar uma partida.");
            return;
        }
        leaveCurrentTable();
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
        // partidas só contra IA: não barrar por "taxa de abandono" (o servidor recusa a mesa com
        // "incompatible quit ratio" se o usuário saiu de muitas partidas antes)
        options.setQuitRatio(100);
        options.setMinimumRating(0);

        lastServerError = null;
        TableView table = session.createTable(roomId, options);
        if (table == null) {
            if (lastServerError == null) { // senão o motivo já foi enviado por showError
                sendError("O servidor recusou a criação da mesa. " + session.getLastError());
            }
            return;
        }
        UUID tableId = table.getTableId();
        ownTableId = tableId;
        currentTableId = tableId;
        currentDeck = myDeck;
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

    private static CardCatalog.Query query(JsonObject o) {
        CardCatalog.Query q = new CardCatalog.Query();
        if (o == null) {
            return q;
        }
        if (o.has("text")) q.text = o.get("text").getAsString();
        if (o.has("searchRules")) q.searchRules = o.get("searchRules").getAsBoolean();
        if (o.has("types")) q.types = DeckService.stringList(o.getAsJsonArray("types"));
        if (o.has("identity") && !o.get("identity").isJsonNull()) q.identity = DeckService.stringList(o.getAsJsonArray("identity"));
        if (o.has("colors")) q.colors = DeckService.stringList(o.getAsJsonArray("colors"));
        if (o.has("mvMin") && !o.get("mvMin").isJsonNull()) q.mvMin = o.get("mvMin").getAsInt();
        if (o.has("mvMax") && !o.get("mvMax").isJsonNull()) q.mvMax = o.get("mvMax").getAsInt();
        if (o.has("commandersOnly")) q.commandersOnly = o.get("commandersOnly").getAsBoolean();
        if (o.has("sort")) q.sort = o.get("sort").getAsString();
        if (o.has("offset")) q.offset = o.get("offset").getAsInt();
        if (o.has("limit")) q.limit = Math.min(200, o.get("limit").getAsInt());
        return q;
    }

    private static String shortName(String deckName) {
        String s = deckName.replaceAll("\\s*\\(.*?\\)", "").trim();
        return s.length() > 18 ? s.substring(0, 17) + "…" : s;
    }

    // ------------------------------------------------------------------ paradas de prioridade

    private static final String[] STOP_STEPS = {"upkeep", "draw", "main1", "beforeCombat", "endOfCombat", "main2", "endOfTurn"};

    private void setStops(JsonObject stops) {
        UserSkipPrioritySteps s = userData.getUserSkipPrioritySteps();
        synchronized (this) {
            applyStops(s.getYourTurn(), stops.getAsJsonObject("yourTurn"));
            applyStops(s.getOpponentTurn(), stops.getAsJsonObject("opponentTurn"));
            if (savedOpponentEndStop != null) {
                // F11 ativo: a escolha do usuário fica guardada para depois, a parada continua ligada
                savedOpponentEndStop = s.getOpponentTurn().isEndOfTurn();
                s.getOpponentTurn().setEndOfTurn(true);
            }
        }
        pushPreferences();
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
        Map<String, Boolean> opp = stepsToJson(s.getOpponentTurn());
        Boolean saved = savedOpponentEndStop;
        if (saved != null) {
            opp.put("endOfTurn", saved); // mostra a preferência do usuário, não a parada temporária do F11
        }
        m.put("opponentTurn", opp);
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

    /**
     * Sai da partida ou da sala de espera atual e remove a mesa criada por nós
     * (encerra o jogo das IAs restantes; online, desfaz a mesa aberta).
     */
    private void leaveCurrentTable() {
        if (session == null || !session.isConnected()) {
            return;
        }
        if (replayId != null) {
            session.stopReplay(replayId);
            replayId = null;
        }
        if (gameId != null && watching) {
            session.stopWatching(gameId);
            gameId = null;
            watching = false;
            currentTableId = null;
        } else if (gameId != null) {
            session.quitMatch(gameId);
            gameId = null;
        } else if (currentTableId != null && !currentTableId.equals(ownTableId)) {
            // ainda na sala de espera da mesa de outro jogador
            session.leaveTable(roomId, currentTableId);
        }
        // durante um torneio a mesa dele continua (sair de um jogo não desfaz o torneio dos outros)
        if (ownTableId != null && tournamentId == null) {
            session.removeTable(roomId, ownTableId);
            ownTableId = null;
        }
        if (tableChatId != null) {
            session.leaveChat(tableChatId);
            tableChatId = null;
        }
        currentTableId = null;
        currentDeck = null;
        deckBuilding = null;
    }

    private void requireSession() {
        if (session == null || !session.isConnected()) {
            throw new IllegalStateException("conecte-se ao servidor primeiro");
        }
    }

    private void sendLobbyOptions() {
        List<Map<String, Object>> gameTypes = new java.util.ArrayList<>();
        for (GameTypeView g : session.getGameTypes()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", g.getName());
            m.put("minPlayers", g.getMinPlayers());
            m.put("maxPlayers", g.getMaxPlayers());
            m.put("useRange", g.isUseRange());
            m.put("useAttackOption", g.isUseAttackOption());
            gameTypes.add(m);
        }
        List<Map<String, Object>> timeLimits = new java.util.ArrayList<>();
        for (MatchTimeLimit t : MatchTimeLimit.values()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", t.name());
            m.put("minutes", t.getPrioritySecs() / 60);
            timeLimits.add(m);
        }
        List<String> skills = new java.util.ArrayList<>();
        for (SkillLevel s : SkillLevel.values()) {
            skills.add(s.name());
        }
        List<Map<String, Object>> sets = new java.util.ArrayList<>();
        for (String[] s : catalog.getBoosterSets()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("code", s[0]);
            m.put("name", s[1]);
            sets.add(m);
        }
        List<String> timings = new java.util.ArrayList<>();
        for (DraftOptions.TimingOption t : DraftOptions.TimingOption.values()) {
            if (t != DraftOptions.TimingOption.NONE) {
                timings.add(t.name());
            }
        }
        send(msg("lobbyOptions").with("gameTypes", gameTypes).with("deckTypes", session.getDeckTypes())
                .with("timeLimits", timeLimits).with("skillLevels", skills)
                .with("tournamentTypes", session.getTournamentTypes().stream().map(Tournaments::type).collect(java.util.stream.Collectors.toList()))
                .with("tournamentGameTypes", session.getTournamentGameTypes().stream().map(GameTypeView::getName).collect(java.util.stream.Collectors.toList()))
                .with("draftCubes", session.getDraftCubes()).with("boosterSets", sets).with("draftTimings", timings));
    }

    /** Cria a mesa do torneio, senta as IAs e entra (mesma ordem do NewTournamentDialog). */
    private void createTournament(JsonObject cmd) throws Exception {
        String typeName = str(cmd, "type");
        TournamentTypeView type = session.getTournamentTypes().stream()
                .filter(t -> t.getName().equals(typeName))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("tipo de torneio desconhecido: " + typeName));
        TournamentOptions options = Tournaments.options(cmd, type, userName);
        if (type.isLimited() && !type.isCubeBooster() && !type.isJumpstart() && options.getLimitedOptions().getSetCodes().isEmpty()) {
            sendError("Escolha as coleções dos boosters.");
            return;
        }
        String deckPath = str(cmd, "deck");
        DeckCardLists deck = deckPath == null ? new DeckCardLists() : decks.load(deckPath);
        leaveCurrentTable();
        lastServerError = null;
        TableView table = session.createTournamentTable(roomId, options);
        if (table == null) {
            if (lastServerError == null) {
                sendError("O servidor recusou o torneio. " + session.getLastError());
            }
            return;
        }
        UUID tableId = table.getTableId();
        long aiSeats = options.getPlayerTypes().stream().filter(p -> p != PlayerType.HUMAN).count();
        for (int i = 1; i <= aiSeats; i++) {
            if (!session.joinTournamentTable(roomId, tableId, "IA " + i, PlayerType.COMPUTER_MAD, 6, deck, "")) {
                sendError("O servidor não aceitou a IA " + i + ". " + session.getLastError());
                session.removeTable(roomId, tableId);
                return;
            }
        }
        if (!session.joinTournamentTable(roomId, tableId, userName, PlayerType.HUMAN, 1, deck, options.getPassword())) {
            if (lastServerError == null) {
                sendError("Não foi possível entrar no torneio. " + session.getLastError());
            }
            session.removeTable(roomId, tableId);
            return;
        }
        ownTableId = tableId;
        enterTable(tableId, deck);
    }

    private void sendTournamentInfo() throws Exception {
        UUID id = tournamentId;
        if (id == null) {
            return;
        }
        TournamentView v = session.getTournament(id);
        if (v != null) {
            send(msg("tournamentInfo").with("tournament", Tournaments.tournament(v)));
        }
    }

    private void quitTournament() {
        if (draftId != null) {
            session.quitDraft(draftId);
        }
        if (tournamentId != null) {
            session.quitTournament(tournamentId);
        }
        endTournament();
        ownTableId = null; // o torneio segue para os demais; o dono não o remove ao desistir
        leaveCurrentTable();
        send(msg("tournamentLeft"));
    }

    private void endTournament() {
        if (tournamentChatId != null) {
            session.leaveChat(tournamentChatId);
        }
        tournamentId = null;
        tournamentChatId = null;
        draftId = null;
        lastDraftJson = null;
    }

    /** Cria uma mesa com todas as vagas para jogadores humanos e entra nela (como o "New Table" do cliente oficial). */
    private void createTable(JsonObject cmd) throws Exception {
        String gameTypeName = str(cmd, "gameType");
        GameTypeView gameType = session.getGameTypes().stream()
                .filter(g -> g.getName().equals(gameTypeName))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("tipo de jogo desconhecido: " + gameTypeName));
        int players = cmd.has("players") ? cmd.get("players").getAsInt() : gameType.getMinPlayers();
        players = Math.max(gameType.getMinPlayers(), Math.min(gameType.getMaxPlayers(), players));
        String deckType = str(cmd, "deckType");
        String password = str(cmd, "password") == null ? "" : str(cmd, "password");
        DeckCardLists deck = decks.load(str(cmd, "deck"));

        String name = str(cmd, "name");
        MatchOptions options = new MatchOptions(name == null || name.trim().isEmpty() ? userName + "'s table" : name.trim(), gameType.getName(), false);
        // vagas de IA ficam no fim, como escolhidas no NewTableDialog do cliente oficial
        int aiSeats = cmd.has("ai") ? Math.max(0, Math.min(players - 1, cmd.get("ai").getAsInt())) : 0;
        for (int i = 0; i < players; i++) {
            options.getPlayerTypes().add(i < players - aiSeats ? PlayerType.HUMAN : PlayerType.COMPUTER_MAD);
        }
        options.setDeckType(deckType);
        options.setMatchTimeLimit(MatchTimeLimit.valueOf(str(cmd, "timeLimit") == null ? "NONE" : str(cmd, "timeLimit")));
        options.setMatchBufferTime(MatchBufferTime.NONE);
        options.setAttackOption(MultiplayerAttackOption.MULTIPLE);
        options.setRange(RangeOfInfluence.ALL);
        options.setSkillLevel(SkillLevel.valueOf(str(cmd, "skill") == null ? "CASUAL" : str(cmd, "skill")));
        options.setWinsNeeded(cmd.has("wins") ? Math.max(1, cmd.get("wins").getAsInt()) : 1);
        options.setRollbackTurnsAllowed(true);
        options.setSpectatorsAllowed(cmd.has("spectators") && cmd.get("spectators").getAsBoolean());
        options.setRated(false);
        options.setPassword(password);
        options.setQuitRatio(100);
        options.setMinimumRating(0);
        // mesmas regras do NewTableDialog do cliente oficial
        options.setLimited(deckType != null && deckType.startsWith("Limited"));
        if (deckType != null && deckType.startsWith("Variant Magic - Freeform Unlimited Commander")) {
            options.setLimited(true);
        }

        leaveCurrentTable();
        lastServerError = null;
        TableView table = session.createTable(roomId, options);
        if (table == null) {
            if (lastServerError == null) {
                sendError("O servidor recusou a criação da mesa. " + session.getLastError());
            }
            return;
        }
        if (!session.joinTable(roomId, table.getTableId(), userName, PlayerType.HUMAN, 1, deck, password)) {
            if (lastServerError == null) {
                sendError("Não foi possível entrar na mesa com o deck '" + deck.getName() + "'. " + session.getLastError());
            }
            session.removeTable(roomId, table.getTableId());
            return;
        }
        ownTableId = table.getTableId();
        // o dono senta as IAs logo após entrar (o cliente oficial faz o mesmo ao criar a mesa)
        String aiDeckPath = str(cmd, "aiDeck");
        DeckCardLists aiDeck = aiDeckPath == null ? deck : decks.load(aiDeckPath);
        int aiSkill = cmd.has("aiSkill") ? cmd.get("aiSkill").getAsInt() : 6;
        for (int i = 1; i <= aiSeats; i++) {
            if (!session.joinTable(roomId, table.getTableId(), "IA " + i, PlayerType.COMPUTER_MAD, aiSkill, aiDeck, password)) {
                sendError("O servidor não aceitou a IA " + i + ". " + session.getLastError());
                break;
            }
        }
        enterTable(table.getTableId(), deck);
    }

    private void joinTable(UUID tableId, String deckPath, String password, boolean tournament) throws Exception {
        // torneio limitado: o deck sai do draft/selado, entra-se sem deck
        DeckCardLists deck = deckPath == null && tournament ? new DeckCardLists() : decks.load(deckPath);
        leaveCurrentTable();
        lastServerError = null;
        String pw = password == null ? "" : password;
        boolean ok = tournament
                ? session.joinTournamentTable(roomId, tableId, userName, PlayerType.HUMAN, 1, deck, pw)
                : session.joinTable(roomId, tableId, userName, PlayerType.HUMAN, 1, deck, pw);
        if (!ok) {
            if (lastServerError == null) {
                sendError("O servidor recusou a entrada na mesa. " + session.getLastError());
            }
            return;
        }
        enterTable(tableId, deck);
    }

    private void enterTable(UUID tableId, DeckCardLists deck) {
        currentTableId = tableId;
        currentDeck = deck;
        tableChatId = session.getTableChatId(tableId).orElse(null);
        if (tableChatId != null) {
            session.joinChat(tableChatId);
        }
        send(msg("tableJoined").with("tableId", tableId));
        sendTableInfo();
    }

    /** Estado da mesa para a sala de espera (o navegador pergunta a cada poucos segundos, como o cliente oficial). */
    private void sendTableInfo() {
        UUID tableId = currentTableId;
        if (tableId == null) {
            send(msg("tableLeft"));
            return;
        }
        Optional<TableView> table = session.getTable(roomId, tableId);
        if (!table.isPresent()) {
            // mesa desfeita pelo dono (ou pelo servidor)
            if (tableChatId != null) {
                session.leaveChat(tableChatId);
                tableChatId = null;
            }
            currentTableId = null;
            currentDeck = null;
            send(msg("tableLeft").with("reason", "A mesa foi encerrada."));
            return;
        }
        send(msg("tableInfo").with("table", ViewMapper.table(table.get())).with("owner", tableId.equals(ownTableId)));
    }

    private UUID chatIdFor(String kind) {
        if ("room".equals(kind)) {
            return roomChatId;
        }
        if ("table".equals(kind)) {
            return tournamentChatId != null ? tournamentChatId : tableChatId;
        }
        if ("game".equals(kind) && gameId != null) {
            return session.getGameChatId(gameId).orElse(null);
        }
        return null;
    }

    private String chatKind(UUID chatId) {
        if (chatId != null && chatId.equals(roomChatId)) {
            return "room";
        }
        if (chatId != null && (chatId.equals(tableChatId) || chatId.equals(tournamentChatId))) {
            return "table";
        }
        return "game";
    }

    /** O navegador desconectou: estaciona a sessão por um tempo ou encerra de vez. */
    public void socketClosed(WebSocket closed) {
        if (closed != socket) {
            return; // já religada a outro socket
        }
        if (parkKey != null && session != null && session.isConnected()) {
            registry.park(parkKey, this);
            parkExpiry = pinger.schedule(() -> {
                registry.unpark(parkKey, this);
                close();
            }, PARK_SECS, java.util.concurrent.TimeUnit.SECONDS);
        } else {
            close();
        }
    }

    /** Chamado pelo registro ao entregar esta ponte a um novo socket. */
    void attach(WebSocket newSocket) {
        if (parkExpiry != null) {
            parkExpiry.cancel(false);
            parkExpiry = null;
        }
        this.socket = newSocket;
    }

    private void handleResume() {
        worker.submit(() -> {
            send(msg("connected").with("user", userName).with("server", serverLabel)
                    .with("clientVersion", VERSION.toString()).with("serverVersion", session == null ? null : session.getVersionInfo())
                    .with("stops", stopsToJson()).with("resumed", true).with("inGame", gameId != null));
            send(msg("decks").with("decks", decks.list()));
            sendDeckBuilding();
            if (tournamentId != null) {
                sendRaw(GSON.toJson(msg("tournamentStarted").with("tournamentId", tournamentId).body));
                if (draftId != null) {
                    sendRaw(GSON.toJson(msg("draftStarted").with("draftId", draftId).body));
                    if (lastDraftJson != null) {
                        sendRaw(lastDraftJson);
                    }
                }
            }
            if (gameId != null) {
                // sendRaw: não passar por remember(), que limparia o estado guardado
                sendRaw(GSON.toJson(msg("gameStarted").with("gameId", gameId).with("playerId", playerId).with("watching", watching).body));
                chatHistory.forEach(this::sendRaw);
                if (lastGameJson != null) {
                    sendRaw(lastGameJson);
                }
                if (lastPromptJson != null && !promptAnswered) {
                    sendRaw(lastPromptJson);
                }
            }
        });
    }

    /** Esta ponte nova não chegou a ser usada (a conexão foi entregue a uma estacionada). */
    private void disposeUnused() {
        pinger.shutdownNow();
        worker.shutdown();
    }

    public void close() {
        pinger.shutdownNow();
        worker.submit(() -> {
            if (session != null && session.isConnected()) {
                leaveCurrentTable();
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
                watching = false;
                session.joinGame(gameId);
                // o log da partida chega como mensagens do chat do jogo
                session.getGameChatId(gameId).ifPresent(session::joinChat);
                send(msg("gameStarted").with("gameId", gameId).with("playerId", playerId));
                break;
            }
            case WATCHGAME: {
                // espectador: mesmo tabuleiro, sem jogador próprio (GamePanel.watchGame no cliente oficial)
                TableClientMessage m = (TableClientMessage) data;
                gameId = callback.getObjectId();
                playerId = null;
                watching = true;
                currentTableId = m.getCurrentTableId();
                session.watchGame(gameId);
                session.getGameChatId(gameId).ifPresent(session::joinChat);
                send(msg("gameStarted").with("gameId", gameId).with("playerId", null).with("watching", true));
                break;
            }
            case START_TOURNAMENT:
            case SHOW_TOURNAMENT: {
                // painel do torneio (TournamentPanel): entra no torneio e no chat dele; a tabela é consultada por polling
                tournamentId = callback.getObjectId();
                session.joinTournament(tournamentId);
                tournamentChatId = session.getTournamentChatId(tournamentId).orElse(null);
                if (tournamentChatId != null) {
                    session.joinChat(tournamentChatId);
                }
                send(msg("tournamentStarted").with("tournamentId", tournamentId));
                break;
            }
            case TOURNAMENT_INIT:
            case TOURNAMENT_UPDATE:
                if (data instanceof TournamentView) {
                    send(msg("tournamentInfo").with("tournament", Tournaments.tournament((TournamentView) data)));
                }
                break;
            case TOURNAMENT_OVER:
                send(msg("tournamentOver").with("message", String.valueOf(data)));
                break;
            case START_DRAFT:
                draftId = callback.getObjectId();
                session.joinDraft(draftId);
                send(msg("draftStarted").with("draftId", draftId));
                break;
            case DRAFT_INIT:
            case DRAFT_PICK:
            case DRAFT_UPDATE: {
                DraftClientMessage m = (DraftClientMessage) data;
                Map<String, Object> d = Tournaments.draft(m.getDraftView(), m.getDraftPickView(), catalog);
                String json = GSON.toJson(msg("draft").with("method", callback.getMethod().name()).with("draft", d).body);
                if (m.getDraftPickView() != null) {
                    lastDraftJson = json;
                }
                sendRaw(json);
                if (m.getDraftPickView() != null && !m.getDraftPickView().getBooster().isEmpty()) {
                    // confirma o recebimento, senão o servidor reenvia o booster (DraftPanel.loadBooster)
                    session.setBoosterLoaded(draftId);
                }
                break;
            }
            case DRAFT_OVER:
                draftId = null;
                lastDraftJson = null;
                send(msg("draftOver"));
                break;
            case REPLAY_GAME:
                replayId = callback.getObjectId();
                session.startReplay(replayId);
                send(msg("replayStarted").with("gameId", replayId));
                break;
            case REPLAY_INIT:
            case REPLAY_UPDATE:
                sendGame(callback.getMethod().name(), (GameView) data, null);
                break;
            case REPLAY_DONE:
                send(msg("replayEnd").with("message", String.valueOf(data)));
                break;
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
                // o servidor já removeu nossa sessão de jogo (GameController.endGame): esquecer a partida,
                // senão uma reconexão do navegador reabre um tabuleiro que ninguém mais atualiza
                gameId = null;
                watching = false;
                restoreEndStepStop();
                String text = data instanceof GameClientMessage ? ((GameClientMessage) data).getMessage() : String.valueOf(data);
                send(msg("gameOver").with("message", text));
                break;
            }
            case END_GAME_INFO: {
                GameEndView v = (GameEndView) data;
                // a partida segue (melhor de N) enquanto não há vencedor: o GameEndView monta então
                // "You need N more wins..." em vez de "<nome> won the match!"
                boolean matchOver = v.getMatchInfo() == null || !v.getMatchInfo().startsWith("You need ");
                send(msg("endGame").with("won", v.hasWon()).with("title", v.getGameInfo()).with("info", v.getMatchInfo())
                        .with("extra", v.getAdditionalInfo()).with("matchOver", matchOver)
                        .with("wins", v.getWins()).with("winsNeeded", v.getWinsNeeded()));
                break;
            }
            case CHATMESSAGE: {
                ChatMessage m = (ChatMessage) data;
                send(msg("chat").with("chat", chatKind(callback.getObjectId())).with("message", m.getMessage()).with("turnInfo", m.getTurnInfo())
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
                // pedidos com botões (voltar turnos, ver a mão, conceder...): a resposta volta por "userReply"
                UserRequestMessage m = (UserRequestMessage) data;
                String id = UUID.randomUUID().toString();
                userRequests.put(id, m);
                List<Map<String, Object>> buttons = new java.util.ArrayList<>();
                addButton(buttons, m.getButton1Text(), m.getButton1Action());
                addButton(buttons, m.getButton2Text(), m.getButton2Action());
                addButton(buttons, m.getButton3Text(), m.getButton3Action());
                send(msg("userRequest").with("id", id).with("title", m.getTitle()).with("message", m.getMessage())
                        .with("buttons", buttons));
                break;
            }
            case SIDEBOARD:
            case CONSTRUCT: {
                // entre os jogos (sideboard) ou no limitado (montar o deck do pool): o navegador abre o editor
                TableClientMessage m = (TableClientMessage) data;
                String mode = callback.getMethod() == ClientCallbackMethod.CONSTRUCT ? "construct"
                        : m.getFlag() ? "constructSideboard" : "sideboard";
                deckBuilding = new DeckBuilding(m.getCurrentTableId(), mode, m.getTime(), m.getDeck());
                sendDeckBuilding();
                break;
            }
            default:
                // JOINED_TABLE, torneios, draft etc.: ainda não suportados no cliente web
                send(msg("event").with("method", callback.getMethod().name()));
        }
    }

    private void sendDeckBuilding() {
        DeckBuilding b = deckBuilding;
        if (b != null) {
            send(msg("deckBuild").with("build", b.toJson(catalog)));
        }
    }

    /** Envia o deck montado: "submit" encerra a montagem; "update" só guarda (vale se o tempo acabar). */
    private void submitBuiltDeck(JsonObject cmd, boolean finalSubmit) {
        DeckBuilding b = deckBuilding;
        if (b == null) {
            return;
        }
        DeckCardLists deck = b.toDeck(cmd, catalog);
        if (!finalSubmit) {
            session.updateDeck(b.tableId, deck);
            return;
        }
        lastServerError = null;
        if (session.submitDeck(b.tableId, deck)) {
            deckBuilding = null;
            if ("sideboard".equals(b.mode)) {
                currentDeck = deck; // próximo sideboard parte do deck atual
            }
            send(msg("deckBuildDone"));
        } else if (lastServerError == null) {
            sendError("O servidor recusou o deck. " + session.getLastError());
        }
    }

    private static void addButton(List<Map<String, Object>> buttons, String text, PlayerAction action) {
        if (text != null && !text.isEmpty()) {
            Map<String, Object> b = new LinkedHashMap<>();
            b.put("text", text);
            b.put("action", action == null ? null : action.name());
            buttons.add(b);
        }
    }

    /** Resposta a um USER_REQUEST_DIALOG (mesma lógica de MageFrame.sendUserReplay no cliente oficial). */
    private void userReply(String id, String actionName) {
        UserRequestMessage m = id == null ? null : userRequests.remove(id);
        if (m == null || actionName == null) {
            return;
        }
        PlayerAction action = PlayerAction.valueOf(actionName);
        switch (action) {
            case CLIENT_CONCEDE_GAME:
                session.sendPlayerAction(PlayerAction.CONCEDE, m.getGameId(), null);
                break;
            case CLIENT_CONCEDE_MATCH:
                session.quitMatch(m.getGameId());
                break;
            case CLIENT_STOP_WATCHING:
                session.stopWatching(m.getGameId());
                break;
            case CLIENT_QUIT_TOURNAMENT:
                session.quitTournament(m.getTournamentId());
                break;
            case CLIENT_QUIT_DRAFT_TOURNAMENT:
                session.quitDraft(m.getTournamentId());
                break;
            case CLIENT_REMOVE_TABLE:
                session.removeTable(m.getRoomId(), m.getTableId());
                break;
            case CLIENT_REPLAY_ACTION:
                session.stopReplay(m.getGameId());
                break;
            case CLIENT_DOWNLOAD_SYMBOLS:
            case CLIENT_DOWNLOAD_CARD_IMAGES:
            case CLIENT_DISCONNECT_FULL:
            case CLIENT_DISCONNECT_KEEP_GAMES:
            case CLIENT_EXIT_FULL:
            case CLIENT_EXIT_KEEP_GAMES:
            case CLIENT_RECONNECT:
                // ações locais do cliente Swing, sem equivalente no navegador
                break;
            default:
                session.sendPlayerAction(action, m.getGameId(), m.getRelatedUserId());
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
            // ordem sugerida pelo servidor (ex.: tipos de criatura seus, depois dos oponentes; PickChoiceDialog)
            if (m.getChoice().isSortEnabled()) {
                c.put("sortData", m.getChoice().getSortData());
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

    // ------------------------------------------------------------------ F11: parar na etapa final antes do meu turno
    //
    // No servidor (HumanPlayer.priority), o F11 passa até a etapa final do jogador anterior a mim, desliga a
    // flag e então ainda consulta as paradas do usuário (checkPassStep): sem "etapa final" marcada nas paradas
    // do turno do oponente, passa de novo e o F11 nunca para. O cliente oficial não sofre disso porque marca
    // todas as paradas por padrão (PreferencesDialog: END_OF_TURN_OTHERS = "on"); aqui o padrão é o do
    // servidor (desmarcada). Então ligamos essa parada só enquanto o F11 estiver ativo e devolvemos a
    // preferência do usuário quando a flag do servidor (PlayerView.isPassedUntilEndStepBeforeMyTurn) cai.

    /** valor do usuário guardado enquanto a parada está ligada por nós (null = nada a restaurar) */
    private Boolean savedOpponentEndStop;
    /** já vimos o servidor com o F11 ativo (antes disso a flag ainda pode chegar falsa) */
    private boolean endStepPassSeen;

    private synchronized void armEndStepStop() {
        SkipPrioritySteps opp = userData.getUserSkipPrioritySteps().getOpponentTurn();
        endStepPassSeen = false;
        if (savedOpponentEndStop != null || opp.isEndOfTurn()) {
            return; // já ligada (por nós ou pelo usuário)
        }
        savedOpponentEndStop = false;
        opp.setEndOfTurn(true);
        pushPreferences();
    }

    private synchronized void restoreEndStepStop() {
        if (savedOpponentEndStop == null) {
            return;
        }
        userData.getUserSkipPrioritySteps().getOpponentTurn().setEndOfTurn(savedOpponentEndStop);
        savedOpponentEndStop = null;
        endStepPassSeen = false;
        pushPreferences();
    }

    private synchronized void trackEndStepPass(GameView view) {
        if (savedOpponentEndStop == null || playerId == null) {
            return;
        }
        for (mage.view.PlayerView p : view.getPlayers()) {
            if (playerId.equals(p.getPlayerId())) {
                if (p.isPassedUntilEndStepBeforeMyTurn()) {
                    endStepPassSeen = true;
                } else if (endStepPassSeen) {
                    restoreEndStepStop(); // parou na etapa final (ou o F11 foi cancelado)
                }
                return;
            }
        }
    }

    private void pushPreferences() {
        Session s = session;
        if (s != null && s.isConnected()) {
            s.updatePreferencesForServer(userData);
        }
    }

    private void sendGame(String method, GameView view, Map<String, Object> prompt) {
        Msg m = msg("game").with("method", method);
        if (view != null) {
            trackEndStepPass(view);
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
        lastServerMessage = message;
        send(msg("serverMessage").with("message", message));
    }

    @Override
    public void showError(String message) {
        // o SessionImpl avisa aqui antes de devolver null/false nas chamadas
        lastServerError = message;
        sendError(message);
    }

    // ------------------------------------------------------------------ util

    private void sendDeckLists() {
        send(msg("userDecks").with("decks", deckService.userDeckSummaries()));
        send(msg("decks").with("decks", decks.list()));
    }

    private void sendError(String message) {
        send(msg("error").with("message", message));
    }

    private void send(Msg m) {
        String json = GSON.toJson(m.body);
        remember(m.body, json);
        sendRaw(json);
    }

    private void sendRaw(String json) {
        WebSocket s = socket;
        if (s != null && s.isOpen()) {
            s.send(json);
        }
    }

    /** Guarda o necessário para restaurar a tela se o navegador reconectar. */
    private void remember(Map<String, Object> body, String json) {
        Object t = body.get("t");
        if ("gameStarted".equals(t)) {
            chatHistory.clear();
            lastGameJson = null;
            lastPromptJson = null;
        } else if ("gameOver".equals(t)) {
            chatHistory.clear();
            lastGameJson = null;
            lastPromptJson = null;
            promptAnswered = true;
        } else if ("game".equals(t)) {
            if (body.containsKey("game")) {
                lastGameJson = json;
            }
            Object prompt = body.get("prompt");
            if (prompt instanceof Map && !"inform".equals(((Map<?, ?>) prompt).get("kind"))) {
                lastPromptJson = json;
                promptAnswered = false;
            }
        } else if ("chat".equals(t) && "game".equals(body.get("chat"))) {
            chatHistory.addLast(json);
            while (chatHistory.size() > CHAT_HISTORY) {
                chatHistory.pollFirst();
            }
        }
    }

    private static Object actionData(JsonObject cmd) {
        if (!cmd.has("data") || cmd.get("data").isJsonNull()) {
            return null;
        }
        com.google.gson.JsonPrimitive p = cmd.getAsJsonPrimitive("data");
        return p.isNumber() ? (Object) p.getAsInt() : UUID.fromString(p.getAsString());
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
