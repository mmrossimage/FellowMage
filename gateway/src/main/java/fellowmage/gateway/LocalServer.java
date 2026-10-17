package fellowmage.gateway;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Servidor XMage local (partidas contra a IA), iniciado sob demanda.
 * <p>
 * O gateway não precisa dele para jogar online: só o liga quando o navegador escolhe o modo local.
 * Quem sabe como iniciar o servidor é o script passado em {@code --local-server} (um para o ambiente
 * de desenvolvimento, outro para o pacote), executado pelo PowerShell.
 */
public final class LocalServer {

    public static final String HOST = "127.0.0.1";
    public static final int PORT = 17171;

    // na primeira vez o servidor cria o banco de cartas, o que pode levar vários minutos
    private static final int START_TIMEOUT_SECS = 900;

    private static volatile Path script;
    // um início em andamento: outras abas esperam o mesmo processo em vez de lançar outro
    private static boolean starting;

    private LocalServer() {
    }

    public static void configure(Path launcher) {
        script = launcher;
    }

    public static boolean isRunning() {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(HOST, PORT), 1000);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * Inicia o servidor, se ainda não estiver no ar, e espera a porta responder.
     * Bloqueia a thread chamadora; várias abas pedindo ao mesmo tempo disparam um só início.
     */
    public static void ensureRunning() throws IOException, InterruptedException {
        if (isRunning()) {
            return;
        }
        Path launcher = script;
        if (launcher == null || !Files.exists(launcher)) {
            throw new IOException("o gateway não sabe iniciar o servidor local (opção --local-server ausente ou script não encontrado: " + launcher + ")");
        }
        synchronized (LocalServer.class) {
            if (!starting && !isRunning()) {
                new ProcessBuilder("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", launcher.toString())
                        .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                        .redirectError(ProcessBuilder.Redirect.DISCARD)
                        .start();
                starting = true;
            }
        }
        try {
            long deadline = System.currentTimeMillis() + START_TIMEOUT_SECS * 1000L;
            while (!isRunning()) {
                if (System.currentTimeMillis() > deadline) {
                    throw new IOException("o servidor local não respondeu em " + (START_TIMEOUT_SECS / 60) + " minutos");
                }
                Thread.sleep(2000);
            }
        } finally {
            synchronized (LocalServer.class) {
                starting = false;
            }
        }
    }
}
