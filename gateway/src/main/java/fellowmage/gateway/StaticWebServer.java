package fellowmage.gateway;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * Serve o cliente web já compilado (web/dist) no pacote distribuído, para não precisar de Node.
 * Só arquivos estáticos; rotas desconhecidas devolvem index.html (aplicação de página única).
 */
public final class StaticWebServer {

    private static final Map<String, String> TYPES = Map.ofEntries(
            Map.entry("html", "text/html; charset=utf-8"),
            Map.entry("js", "text/javascript; charset=utf-8"),
            Map.entry("css", "text/css; charset=utf-8"),
            Map.entry("json", "application/json"),
            Map.entry("svg", "image/svg+xml"),
            Map.entry("png", "image/png"),
            Map.entry("jpg", "image/jpeg"),
            Map.entry("webp", "image/webp"),
            Map.entry("ico", "image/x-icon"),
            Map.entry("woff2", "font/woff2"),
            Map.entry("txt", "text/plain; charset=utf-8"));

    private final Path root;
    private final HttpServer server;

    public StaticWebServer(Path root, int port) throws IOException {
        this.root = root.toAbsolutePath().normalize();
        this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/", this::handle);
        server.setExecutor(Executors.newFixedThreadPool(4));
    }

    public void start() {
        server.start();
    }

    private void handle(HttpExchange ex) throws IOException {
        try {
            String path = URLDecoder.decode(ex.getRequestURI().getPath(), StandardCharsets.UTF_8);
            Path file = root.resolve(path.replaceFirst("^/+", "")).normalize();
            if (!file.startsWith(root) || !Files.isRegularFile(file)) {
                file = root.resolve("index.html");
            }
            String name = file.getFileName().toString();
            String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
            byte[] body = Files.readAllBytes(file);
            ex.getResponseHeaders().set("Content-Type", TYPES.getOrDefault(ext, "application/octet-stream"));
            // arquivos com hash no nome (assets/) podem ficar em cache; index.html não
            ex.getResponseHeaders().set("Cache-Control", path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream out = ex.getResponseBody()) {
                out.write(body);
            }
        } catch (IOException e) {
            ex.sendResponseHeaders(500, -1);
        } finally {
            ex.close();
        }
    }
}
