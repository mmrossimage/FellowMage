package fellowmage.gateway;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Ponto de entrada do gateway FellowMage.
 * <p>
 * Uso: GatewayMain [portaWebSocket] [pastaDeDecksDeExemplo] [pastaDosDecksDoUsuario] [bancoDeCartas]
 */
public final class GatewayMain {

    public static void main(String[] args) throws Exception {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8090;
        Path samples = args.length > 1 ? Paths.get(args[1]) : Paths.get("..", "Xmage", "xmage", "mage-client", "sample-decks");
        Path userDecks = args.length > 2 ? Paths.get(args[2]) : Paths.get("..", "decks");
        // banco H2 criado pelo servidor XMage (sem a extensão .mv.db)
        Path cardsDb = args.length > 3 ? Paths.get(args[3]) : Paths.get("..", "mage-src", "Mage.Server", "db", "cards.h2");

        Files.createDirectories(userDecks);
        DeckLibrary decks = new DeckLibrary(samples.toAbsolutePath().normalize(), userDecks.toAbsolutePath().normalize());
        CardCatalog catalog = new CardCatalog();
        catalog.loadAsync(cardsDb.toAbsolutePath().normalize());
        DeckService deckService = new DeckService(decks, catalog);

        GatewayServer server = new GatewayServer(port, decks, catalog, deckService);
        server.setReuseAddr(true);
        server.start();
        System.out.println("FellowMage gateway: ws://localhost:" + port
                + "  (exemplos: " + decks.getRoot() + "; meus decks: " + decks.getUserRoot() + "; " + decks.list().size() + " arquivos)");

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
