package fellowmage.gateway;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Ponto de entrada do gateway FellowMage.
 * <p>
 * Uso: GatewayMain [portaWebSocket] [pastaDeDecks]
 */
public final class GatewayMain {

    public static void main(String[] args) throws Exception {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8090;
        Path decksDir = args.length > 1
                ? Paths.get(args[1])
                : Paths.get("..", "Xmage", "xmage", "mage-client", "sample-decks");

        DeckLibrary decks = new DeckLibrary(decksDir.toAbsolutePath().normalize());
        GatewayServer server = new GatewayServer(port, decks);
        server.setReuseAddr(true);
        server.start();
        System.out.println("FellowMage gateway: ws://localhost:" + port + "  (decks: " + decks.getRoot() + ", " + decks.list().size() + " arquivos)");

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                server.stop(1000);
            } catch (InterruptedException ignore) {
                Thread.currentThread().interrupt();
            }
        }));
    }

    private GatewayMain() {
    }
}
