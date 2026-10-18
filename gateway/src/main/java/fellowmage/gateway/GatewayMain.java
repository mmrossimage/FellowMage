package fellowmage.gateway;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;

/**
 * Ponto de entrada do gateway FellowMage.
 * <p>
 * Opções (todas opcionais):
 * <pre>
 *   --port=8090            porta do WebSocket
 *   --samples=DIR          decks de exemplo do XMage (somente leitura)
 *   --decks=DIR            decks do usuário
 *   --cards-db=ARQ         banco H2 de cartas do servidor, sem ".mv.db"
 *   --web=DIR              serve o cliente web compilado (pacote distribuído; sem Node)
 *   --http-port=5173       porta HTTP do cliente web (com --web)
 *   --local-server=ARQ     script PowerShell que inicia o servidor XMage local (modo contra a IA)
 * </pre>
 * Por compatibilidade, os dois primeiros argumentos posicionais ainda são porta e pasta de exemplos.
 */
public final class GatewayMain {

    public static void main(String[] args) throws Exception {
        Map<String, String> opt = new HashMap<>();
        int positional = 0;
        for (String a : args) {
            if (a.startsWith("--") && a.contains("=")) {
                opt.put(a.substring(2, a.indexOf('=')), a.substring(a.indexOf('=') + 1));
            } else if (positional == 0) {
                opt.putIfAbsent("port", a);
                positional++;
            } else if (positional == 1) {
                opt.putIfAbsent("samples", a);
                positional++;
            }
        }

        int port = Integer.parseInt(opt.getOrDefault("port", "8090"));
        Path samples = Paths.get(opt.getOrDefault("samples", "../Xmage/xmage/mage-client/sample-decks"));
        Path userDecks = Paths.get(opt.getOrDefault("decks", "../decks"));
        Path cardsDb = Paths.get(opt.getOrDefault("cards-db", "../mage-src/Mage.Server/db/cards.h2"));

        if (opt.containsKey("local-server")) {
            LocalServer.configure(Paths.get(opt.get("local-server")).toAbsolutePath().normalize());
        }

        Files.createDirectories(userDecks);
        DeckLibrary decks = new DeckLibrary(samples.toAbsolutePath().normalize(), userDecks.toAbsolutePath().normalize());
        CardCatalog catalog = new CardCatalog();
        catalog.loadAsync(cardsDb.toAbsolutePath().normalize());
        DeckService deckService = new DeckService(decks, catalog);

        GatewayServer server = new GatewayServer(port, decks, catalog, deckService);
        server.setReuseAddr(true);
        server.start();
        System.out.println("FellowMage gateway: ws://localhost:" + port + "  (XMage " + ClientBridge.VERSION + ")"
                + "  (exemplos: " + decks.getRoot() + "; meus decks: " + decks.getUserRoot() + "; " + decks.list().size() + " arquivos)");

        if (opt.containsKey("web")) {
            int httpPort = Integer.parseInt(opt.getOrDefault("http-port", "5173"));
            new StaticWebServer(Paths.get(opt.get("web")), httpPort).start();
            System.out.println("Cliente web: http://localhost:" + httpPort);
        }

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
