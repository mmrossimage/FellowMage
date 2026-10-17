package fellowmage.gateway;

import mage.ObjectColor;
import mage.abilities.icon.CardIconType;
import mage.players.PlayableObjectsList;
import mage.view.CardView;
import mage.view.CardsView;
import mage.view.CombatGroupView;
import mage.view.CommandObjectView;
import mage.view.CommanderView;
import mage.view.CounterView;
import mage.view.ExileView;
import mage.view.GameView;
import mage.view.LookedAtView;
import mage.view.ManaPoolView;
import mage.view.PermanentView;
import mage.view.PlayerView;
import mage.view.RevealedView;
import mage.view.StackAbilityView;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Converte as views (serializadas em Java) do XMage em mapas simples para JSON.
 * Só envia o que o cliente web realmente usa.
 */
public final class ViewMapper {

    public static Map<String, Object> game(GameView g) {
        PlayableObjectsList playable = g.getCanPlayObjects();

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("turn", g.getTurn());
        m.put("phase", g.getPhase() == null ? null : g.getPhase().name());
        m.put("step", g.getStep() == null ? null : g.getStep().name());
        m.put("activePlayerId", g.getActivePlayerId());
        m.put("activePlayerName", g.getActivePlayerName());
        m.put("priorityPlayerName", g.getPriorityPlayerName());
        m.put("special", g.getSpecial());
        m.put("players", g.getPlayers().stream().map(p -> player(p, playable)).collect(Collectors.toList()));
        m.put("hand", cards(g.getMyHand(), playable));
        m.put("stack", cards(g.getStack(), playable));
        m.put("combat", g.getCombat().stream().map(ViewMapper::combat).collect(Collectors.toList()));
        m.put("exiles", g.getExile().stream().map(e -> exile(e, playable)).collect(Collectors.toList()));
        m.put("revealed", g.getRevealed().stream().map(ViewMapper::revealed).collect(Collectors.toList()));
        m.put("lookedAt", g.getLookedAt().stream().map(ViewMapper::lookedAt).collect(Collectors.toList()));
        m.put("playable", playable == null ? new ArrayList<>() : new ArrayList<>(playable.getObjects().keySet()));
        return m;
    }

    private static Map<String, Object> player(PlayerView p, PlayableObjectsList playable) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", p.getPlayerId());
        m.put("name", p.getName());
        m.put("me", p.getControlled());
        m.put("human", p.isHuman());
        m.put("life", p.getLife());
        m.put("library", p.getLibraryCount());
        m.put("handCount", p.getHandCount());
        m.put("active", p.isActive());
        m.put("priority", p.hasPriority());
        m.put("left", p.hasLeft());
        m.put("timeLeft", p.getPriorityTimeLeftSecs());
        m.put("monarch", p.isMonarch());
        m.put("initiative", p.isInitiative());
        m.put("counters", counters(p.getCounters()));
        m.put("mana", mana(p.getManaPool()));
        m.put("graveyard", cards(p.getGraveyard(), playable));
        m.put("exile", cards(p.getExile(), playable));
        m.put("command", commands(p.getCommandObjectList(), playable));
        m.put("battlefield", p.getBattlefield().values().stream()
                .map(perm -> permanent(perm, playable))
                .collect(Collectors.toList()));
        m.put("topCard", p.getTopCard() == null ? null : card(p.getTopCard(), playable));
        return m;
    }

    public static List<Map<String, Object>> cards(CardsView cards, PlayableObjectsList playable) {
        if (cards == null) {
            return new ArrayList<>();
        }
        return cards.values().stream().map(c -> card(c, playable)).collect(Collectors.toList());
    }

    public static Map<String, Object> card(CardView c, PlayableObjectsList playable) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("name", c.getDisplayName());
        m.put("set", c.getExpansionSetCode());
        m.put("num", c.getCardNumber());
        m.put("cost", c.getManaCostStr());
        m.put("mv", c.getManaValue());
        m.put("type", c.getTypeText());
        m.put("types", c.getCardTypes().stream().map(Enum::name).collect(Collectors.toList()));
        m.put("colors", colors(c.getColor()));
        m.put("rarity", c.getRarity() == null ? null : c.getRarity().name());
        m.put("power", c.getPower());
        m.put("toughness", c.getToughness());
        m.put("loyalty", c.getLoyalty());
        m.put("defense", c.getDefense());
        m.put("rules", c.getRules());
        m.put("counters", counters(c.getCounters()));
        m.put("token", c.isToken());
        m.put("faceDown", c.isFaceDown());
        m.put("ability", c.isAbility());
        m.put("targets", c.getTargets());
        if (c instanceof StackAbilityView) {
            CardView source = ((StackAbilityView) c).getSourceCard();
            if (source != null) {
                // habilidades na pilha: usar a imagem da carta de origem
                m.put("set", source.getExpansionSetCode());
                m.put("num", source.getCardNumber());
                m.put("sourceName", source.getDisplayName());
            }
        }
        if (playable != null && playable.containsObject(c.getId())) {
            m.put("playable", true);
            m.put("playableCount", playable.getPlayableAmount(c.getId()));
        }
        if (c instanceof CommanderView || c.getCardIcons().stream().anyMatch(i -> i.getIconType() == CardIconType.COMMANDER)) {
            m.put("commander", commanderInfo(c));
        }
        if (c.isChoosable()) {
            m.put("choosable", true);
        }
        if (c.isSelected()) {
            m.put("selected", true);
        }
        return m;
    }

    private static Map<String, Object> permanent(PermanentView p, PlayableObjectsList playable) {
        Map<String, Object> m = card(p, playable);
        m.put("tapped", p.isTapped());
        m.put("damage", p.getDamage());
        m.put("sick", p.hasSummoningSickness());
        m.put("attachedTo", p.getAttachedTo());
        m.put("attachments", p.getAttachments());
        m.put("controller", p.getNameController());
        m.put("copy", p.isCopy());
        m.put("canAttack", p.isCanAttack());
        m.put("canBlock", p.isCanBlock());
        return m;
    }

    private static Map<String, Object> combat(CombatGroupView g) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("defenderId", g.getDefenderId());
        m.put("defenderName", g.getDefenderName());
        m.put("blocked", g.isBlocked());
        m.put("attackers", new ArrayList<>(g.getAttackers().keySet()));
        m.put("blockers", new ArrayList<>(g.getBlockers().keySet()));
        return m;
    }

    private static Map<String, Object> exile(ExileView e, PlayableObjectsList playable) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", e.getId());
        m.put("name", e.getName());
        m.put("cards", cards(e, playable));
        return m;
    }

    private static Map<String, Object> revealed(RevealedView r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", r.getName());
        m.put("cards", cards(r.getCards(), null));
        return m;
    }

    private static Map<String, Object> lookedAt(LookedAtView l) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", l.getName());
        m.put("count", l.getCards().size());
        return m;
    }

    private static List<Map<String, Object>> counters(Collection<CounterView> counters) {
        List<Map<String, Object>> res = new ArrayList<>();
        if (counters != null) {
            for (CounterView c : counters) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("name", c.getName());
                m.put("count", c.getCount());
                res.add(m);
            }
        }
        return res;
    }

    private static List<Map<String, Object>> commands(List<CommandObjectView> list, PlayableObjectsList playable) {
        List<Map<String, Object>> res = new ArrayList<>();
        for (CommandObjectView c : list) {
            if (c instanceof CardView) {
                // comandante na zona de comando: carta completa (pode ser conjurada clicando)
                res.add(card((CardView) c, playable));
                continue;
            }
            // emblemas, dungeons, planos...
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("name", c.getName());
            m.put("set", c.getExpansionSetCode());
            m.put("rules", c.getRules());
            m.put("emblem", true);
            res.add(m);
        }
        return res;
    }

    // o XMage não manda imposto/dano de comandante em campos próprios: ficam no texto da carta
    // (ver mage.watchers.common.CommanderInfoWatcher)
    private static final Pattern CAST_COUNT = Pattern.compile("(\\d+) times? played from the command zone");
    private static final Pattern CMD_DAMAGE = Pattern.compile("did (\\d+) combat damage to player (.+?)\\.?$");

    private static Map<String, Object> commanderInfo(CardView c) {
        int casts = 0;
        Map<String, Integer> damage = new LinkedHashMap<>();
        for (String rule : c.getRules()) {
            String text = rule.replaceAll("<[^>]+>", "").trim();
            Matcher cast = CAST_COUNT.matcher(text);
            if (cast.find()) {
                casts = Integer.parseInt(cast.group(1));
            }
            Matcher dmg = CMD_DAMAGE.matcher(text);
            if (dmg.find()) {
                damage.put(dmg.group(2).trim(), Integer.parseInt(dmg.group(1)));
            }
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("casts", casts);
        m.put("tax", casts * 2);
        m.put("damage", damage);
        return m;
    }

    private static Map<String, Integer> mana(ManaPoolView pool) {
        Map<String, Integer> m = new LinkedHashMap<>();
        if (pool != null) {
            m.put("W", pool.getWhite());
            m.put("U", pool.getBlue());
            m.put("B", pool.getBlack());
            m.put("R", pool.getRed());
            m.put("G", pool.getGreen());
            m.put("C", pool.getColorless());
        }
        return m;
    }

    private static List<String> colors(ObjectColor color) {
        List<String> res = new ArrayList<>();
        if (color != null) {
            if (color.isWhite()) res.add("W");
            if (color.isBlue()) res.add("U");
            if (color.isBlack()) res.add("B");
            if (color.isRed()) res.add("R");
            if (color.isGreen()) res.add("G");
        }
        return res;
    }

    private ViewMapper() {
    }
}
