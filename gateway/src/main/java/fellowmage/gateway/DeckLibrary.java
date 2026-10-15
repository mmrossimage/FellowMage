package fellowmage.gateway;

import mage.cards.decks.DeckCardInfo;
import mage.cards.decks.DeckCardLists;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Decks no formato .dck do XMage, em duas pastas:
 * <ul>
 *   <li>exemplos da instalação do XMage (somente leitura), com caminhos relativos como "Commander/x.dck";</li>
 *   <li>decks do usuário (leitura e escrita), com caminhos "Meus decks/x.dck".</li>
 * </ul>
 * Não precisa do banco de cartas: o servidor resolve as cartas a partir de nome + set + número.
 */
public final class DeckLibrary {

    public static final String USER_PREFIX = "Meus decks/";

    // ex.: "4 [M10:146] Lightning Bolt" ou "SB: 2 [M10:146] Lightning Bolt"
    private static final Pattern CARD_LINE = Pattern.compile("^(SB:\\s*)?(\\d+)\\s+\\[([^:\\]]+):([^\\]]+)]\\s+(.+)$");

    private final Path samplesRoot;
    private final Path userRoot;

    public DeckLibrary(Path samplesRoot, Path userRoot) {
        this.samplesRoot = samplesRoot;
        this.userRoot = userRoot;
    }

    public Path getRoot() {
        return samplesRoot;
    }

    public Path getUserRoot() {
        return userRoot;
    }

    /** Todos os decks: primeiro os do usuário ("Meus decks/…"), depois os exemplos. */
    public List<String> list() {
        List<String> res = new ArrayList<>(listIn(userRoot).stream().map(p -> USER_PREFIX + p).collect(Collectors.toList()));
        res.addAll(listIn(samplesRoot));
        return res;
    }

    public List<String> listUser() {
        return listIn(userRoot).stream().map(p -> USER_PREFIX + p).collect(Collectors.toList());
    }

    private static List<String> listIn(Path root) {
        if (root == null || !Files.isDirectory(root)) {
            return new ArrayList<>();
        }
        try (Stream<Path> files = Files.walk(root)) {
            return files
                    .filter(p -> p.toString().toLowerCase().endsWith(".dck"))
                    .map(p -> root.relativize(p).toString().replace('\\', '/'))
                    .sorted(String.CASE_INSENSITIVE_ORDER)
                    .collect(Collectors.toList());
        } catch (IOException e) {
            return new ArrayList<>();
        }
    }

    /** Caminho no disco para um caminho lógico, recusando qualquer coisa fora das pastas. */
    public Path resolve(String logicalPath) throws IOException {
        Path root = logicalPath.startsWith(USER_PREFIX) ? userRoot : samplesRoot;
        String rel = logicalPath.startsWith(USER_PREFIX) ? logicalPath.substring(USER_PREFIX.length()) : logicalPath;
        Path file = root.resolve(rel).normalize();
        if (!file.startsWith(root) || !file.toString().toLowerCase().endsWith(".dck")) {
            throw new IOException("Caminho de deck inválido: " + logicalPath);
        }
        return file;
    }

    public DeckCardLists load(String logicalPath) throws IOException {
        Path file = resolve(logicalPath);
        DeckCardLists deck = parse(Files.readAllLines(file, StandardCharsets.UTF_8));
        if (deck.getName() == null || deck.getName().isEmpty()) {
            String fileName = file.getFileName().toString();
            deck.setName(fileName.substring(0, fileName.length() - 4));
        }
        if (deck.getCards().isEmpty()) {
            throw new IOException("Deck vazio ou em formato desconhecido: " + logicalPath);
        }
        return deck;
    }

    static DeckCardLists parse(List<String> lines) {
        DeckCardLists deck = new DeckCardLists();
        for (String raw : lines) {
            String line = raw.trim();
            if (line.startsWith("NAME:")) {
                deck.setName(line.substring(5).trim());
                continue;
            }
            Matcher m = CARD_LINE.matcher(line);
            if (!m.matches()) {
                continue; // layouts, comentários etc.
            }
            DeckCardInfo info = new DeckCardInfo(m.group(5).trim(), m.group(4), m.group(3), Integer.parseInt(m.group(2)));
            if (m.group(1) != null) {
                deck.getSideboard().add(info);
            } else {
                deck.getCards().add(info);
            }
        }
        return deck;
    }

    /** Grava um deck do usuário; devolve o caminho lógico. Commander(s) vão no sideboard, como no XMage. */
    public String saveUserDeck(String logicalPath, DeckCardLists deck) throws IOException {
        if (logicalPath == null || !logicalPath.startsWith(USER_PREFIX)) {
            logicalPath = USER_PREFIX + safeFileName(deck.getName()) + ".dck";
        }
        Path file = resolve(logicalPath);
        Files.createDirectories(file.getParent());
        StringBuilder sb = new StringBuilder();
        sb.append("NAME:").append(deck.getName()).append('\n');
        for (DeckCardInfo c : deck.getCards()) {
            sb.append(c.getAmount()).append(" [").append(c.getSetCode()).append(':').append(c.getCardNumber()).append("] ").append(c.getCardName()).append('\n');
        }
        for (DeckCardInfo c : deck.getSideboard()) {
            sb.append("SB: ").append(c.getAmount()).append(" [").append(c.getSetCode()).append(':').append(c.getCardNumber()).append("] ").append(c.getCardName()).append('\n');
        }
        Files.write(file, sb.toString().getBytes(StandardCharsets.UTF_8));
        return logicalPath;
    }

    public void deleteUserDeck(String logicalPath) throws IOException {
        if (!logicalPath.startsWith(USER_PREFIX)) {
            throw new IOException("Só é possível apagar decks em " + USER_PREFIX);
        }
        Files.deleteIfExists(resolve(logicalPath));
    }

    static String safeFileName(String name) {
        String s = (name == null || name.trim().isEmpty() ? "Novo deck" : name.trim()).replaceAll("[\\\\/:*?\"<>|]", "_");
        return s.length() > 80 ? s.substring(0, 80) : s;
    }
}
