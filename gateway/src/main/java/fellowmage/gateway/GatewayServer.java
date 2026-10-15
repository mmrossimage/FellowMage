package fellowmage.gateway;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.net.InetSocketAddress;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Servidor WebSocket: cada conexão do navegador ganha a sua própria ponte
 * (e portanto a sua própria sessão no servidor XMage).
 * <p>
 * Quando o navegador cai, a ponte fica "estacionada" por um tempo; se o mesmo usuário
 * reconectar, a conexão nova é entregue à ponte antiga e a partida continua.
 */
public final class GatewayServer extends WebSocketServer implements ClientBridge.Registry {

    private final DeckLibrary decks;
    private final Map<WebSocket, ClientBridge> bridges = new ConcurrentHashMap<>();
    private final Map<String, ClientBridge> parked = new ConcurrentHashMap<>();

    public GatewayServer(int port, DeckLibrary decks) {
        super(new InetSocketAddress("127.0.0.1", port));
        this.decks = decks;
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        bridges.put(conn, new ClientBridge(conn, decks, this));
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        ClientBridge bridge = bridges.remove(conn);
        if (bridge != null) {
            bridge.socketClosed(conn);
        }
    }

    @Override
    public void onMessage(WebSocket conn, String message) {
        ClientBridge bridge = bridges.get(conn);
        if (bridge != null) {
            bridge.handleCommand(message);
        }
    }

    @Override
    public void onError(WebSocket conn, Exception ex) {
        System.err.println("WebSocket error: " + ex);
    }

    @Override
    public void onStart() {
        setConnectionLostTimeout(60);
    }

    // ------------------------------------------------------------------ ClientBridge.Registry

    @Override
    public ClientBridge claimParked(String key, WebSocket newSocket) {
        ClientBridge bridge = parked.remove(key);
        if (bridge != null) {
            bridge.attach(newSocket);
            bridges.put(newSocket, bridge);
            System.out.println("Sessão retomada: " + key);
        }
        return bridge;
    }

    @Override
    public void park(String key, ClientBridge bridge) {
        ClientBridge previous = parked.put(key, bridge);
        if (previous != null && previous != bridge) {
            previous.close();
        }
        System.out.println("Sessão estacionada: " + key);
    }

    @Override
    public void unpark(String key, ClientBridge bridge) {
        parked.remove(key, bridge);
    }
}
