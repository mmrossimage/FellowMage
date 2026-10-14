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
 */
public final class GatewayServer extends WebSocketServer {

    private final DeckLibrary decks;
    private final Map<WebSocket, ClientBridge> bridges = new ConcurrentHashMap<>();

    public GatewayServer(int port, DeckLibrary decks) {
        super(new InetSocketAddress("127.0.0.1", port));
        this.decks = decks;
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        bridges.put(conn, new ClientBridge(conn, decks));
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        ClientBridge bridge = bridges.remove(conn);
        if (bridge != null) {
            bridge.close();
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
}
