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
 * Lê decks no formato .dck do XMage sem precisar do banco de cartas local:
 * o servidor resolve as cartas a partir de nome + set + número.
 */
public final class DeckLibrary {

    // ex.: "4 [M10:146] Lightning Bolt" ou "SB: 2 [M10:146] Lightning Bolt"
    private static final Pattern CARD_LINE = Pattern.compile("^(SB:\\s*)?(\\d+)\\s+\\[([^:\\]]+):([^\\]]+)]\\s+(.+)$");

    private final Path root;

    public DeckLibrary(Path root) {
        this.root = root;
    }

    public Path getRoot() {
        return root;
    }

    /** Caminhos relativos (com "/") de todos os .dck disponíveis. */
    public List<String> list() {
        if (!Files.isDirectory(root)) {
            return new ArrayList<>();
        }
        try (Stream<Path> files = Files.walk(root)) {
            return files
                    .filter(p -> p.toString().toLowerCase().endsWith(".dck"))
                    .map(p -> root.relativize(p).toString().replace('\\', '/'))
                    .sorted()
                    .collect(Collectors.toList());
        } catch (IOException e) {
            return new ArrayList<>();
        }
    }

    public DeckCardLists load(String relativePath) throws IOException {
        Path file = root.resolve(relativePath).normalize();
        if (!file.startsWith(root)) {
            throw new IOException("Caminho de deck inválido: " + relativePath);
        }

        DeckCardLists deck = new DeckCardLists();
        String fileName = file.getFileName().toString();
        deck.setName(fileName.substring(0, fileName.length() - 4));

        for (String raw : Files.readAllLines(file, StandardCharsets.UTF_8)) {
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

        if (deck.getCards().isEmpty()) {
            throw new IOException("Deck vazio ou em formato desconhecido: " + relativePath);
        }
        return deck;
    }
}
