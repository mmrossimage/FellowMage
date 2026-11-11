package fellowmage.gateway;

import com.google.gson.JsonObject;
import mage.constants.MatchBufferTime;
import mage.constants.MatchTimeLimit;
import mage.constants.MultiplayerAttackOption;
import mage.constants.RangeOfInfluence;
import mage.constants.SkillLevel;
import mage.game.draft.DraftOptions;
import mage.game.draft.DraftPickSuggest;
import mage.game.tournament.LimitedOptions;
import mage.game.tournament.TournamentOptions;
import mage.players.PlayerType;
import mage.view.DraftPickView;
import mage.view.DraftView;
import mage.view.RoundView;
import mage.view.SimpleCardView;
import mage.view.SimpleCardsView;
import mage.view.TournamentGameView;
import mage.view.TournamentPlayerView;
import mage.view.TournamentTypeView;
import mage.view.TournamentView;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Torneios, draft e selado: monta as opções como o NewTournamentDialog do cliente oficial e
 * converte as views (TournamentView, DraftPickView...) para JSON.
 */
final class Tournaments {

    private Tournaments() {
    }

    static Map<String, Object> type(TournamentTypeView t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", t.getName());
        m.put("minPlayers", t.getMinPlayers());
        m.put("maxPlayers", t.getMaxPlayers());
        m.put("boosters", t.getNumBoosters());
        m.put("draft", t.isDraft());
        m.put("limited", t.isLimited());
        m.put("cube", t.isCubeBooster());
        m.put("elimination", t.isElimination());
        // tipos com seleção especial de pacotes (aleatório, rich man, jumpstart) usam as coleções escolhidas como sorteio
        m.put("random", t.isRandom() || t.isRichMan() || t.isReshuffled());
        m.put("jumpstart", t.isJumpstart());
        return m;
    }

    /** Opções do torneio a partir do formulário do navegador (getTournamentOptions do NewTournamentDialog). */
    static TournamentOptions options(JsonObject cmd, TournamentTypeView type, String userName) {
        String name = str(cmd, "name");
        TournamentOptions o = new TournamentOptions(name == null || name.trim().isEmpty() ? userName + "'s tournament" : name.trim(), "", false);
        o.setTournamentType(type.getName());
        o.setPassword(str(cmd, "password") == null ? "" : str(cmd, "password"));
        o.setWatchingAllowed(cmd.has("spectators") && cmd.get("spectators").getAsBoolean());
        o.setQuitRatio(100);
        o.setMinimumRating(0);
        int players = cmd.has("players") ? cmd.get("players").getAsInt() : type.getMinPlayers();
        players = Math.max(type.getMinPlayers(), Math.min(type.getMaxPlayers(), players));
        int ai = cmd.has("ai") ? Math.max(0, Math.min(players - 1, cmd.get("ai").getAsInt())) : 0;
        // o criador ocupa a primeira vaga; IAs no fim
        for (int i = 0; i < players; i++) {
            o.getPlayerTypes().add(i < players - ai ? PlayerType.HUMAN : PlayerType.COMPUTER_MAD);
        }
        if (!type.isElimination()) {
            o.setNumberRounds(cmd.has("rounds") ? Math.max(1, cmd.get("rounds").getAsInt()) : 2);
        }
        if (type.isDraft()) {
            DraftOptions d = new DraftOptions();
            String timing = str(cmd, "timing");
            d.setTiming(timing == null ? DraftOptions.TimingOption.REGULAR : DraftOptions.TimingOption.valueOf(timing));
            o.setLimitedOptions(d);
        }
        if (o.getLimitedOptions() == null) {
            o.setLimitedOptions(new LimitedOptions());
        }
        if (type.isLimited()) {
            LimitedOptions l = o.getLimitedOptions();
            l.setConstructionTime((cmd.has("constructMinutes") ? cmd.get("constructMinutes").getAsInt() : 20) * 60);
            l.setIsRandom(type.isRandom());
            l.setIsReshuffled(type.isReshuffled());
            l.setIsRichMan(type.isRichMan());
            l.setIsJumpstart(type.isJumpstart());
            if (type.isCubeBooster()) {
                l.setDraftCubeName(str(cmd, "cube"));
            } else if (cmd.has("packs")) {
                cmd.getAsJsonArray("packs").forEach(p -> l.getSetCodes().add(p.getAsString()));
            }
            o.getMatchOptions().setDeckType("Limited");
            o.getMatchOptions().setGameType("Two Player Duel");
            o.getMatchOptions().setLimited(true);
        } else {
            o.getLimitedOptions().setConstructionTime(0);
            o.getLimitedOptions().setNumberBoosters(0);
            o.getLimitedOptions().setDraftCube(null);
            o.getLimitedOptions().setDraftCubeName("");
            String deckType = str(cmd, "deckType");
            o.getMatchOptions().setDeckType(deckType);
            o.getMatchOptions().setGameType(str(cmd, "gameType"));
            o.getMatchOptions().setLimited(deckType != null && deckType.startsWith("Limited"));
        }
        o.getMatchOptions().setMatchTimeLimit(MatchTimeLimit.valueOf(str(cmd, "timeLimit") == null ? "NONE" : str(cmd, "timeLimit")));
        o.getMatchOptions().setMatchBufferTime(MatchBufferTime.NONE);
        o.getMatchOptions().setSkillLevel(SkillLevel.valueOf(str(cmd, "skill") == null ? "CASUAL" : str(cmd, "skill")));
        o.getMatchOptions().setWinsNeeded(cmd.has("wins") ? Math.max(1, cmd.get("wins").getAsInt()) : 2);
        o.getMatchOptions().setAttackOption(MultiplayerAttackOption.MULTIPLE);
        o.getMatchOptions().setRange(RangeOfInfluence.ALL);
        o.getMatchOptions().setRollbackTurnsAllowed(true);
        o.getMatchOptions().setRated(false);
        return o;
    }

    static Map<String, Object> tournament(TournamentView t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", t.getTournamentName());
        m.put("type", t.getTournamentType());
        m.put("state", t.getTournamentState());
        m.put("info", t.getRunningInfo());
        m.put("start", t.getStartTime() == null ? null : t.getStartTime().getTime());
        m.put("end", t.getEndTime() == null ? null : t.getEndTime().getTime());
        m.put("stepStart", t.getStepStartTime() == null ? null : t.getStepStartTime().getTime());
        m.put("serverTime", t.getServerTime() == null ? null : t.getServerTime().getTime());
        m.put("constructionTime", t.getConstructionTime());
        m.put("watchingAllowed", t.isWatchingAllowed());
        List<Map<String, Object>> players = new ArrayList<>();
        for (TournamentPlayerView p : t.getPlayers()) {
            Map<String, Object> pm = new LinkedHashMap<>();
            pm.put("name", p.getName());
            pm.put("state", p.getState());
            pm.put("points", p.getPoints());
            pm.put("results", p.getResults());
            pm.put("history", p.getHistory());
            players.add(pm);
        }
        m.put("players", players);
        List<List<Map<String, Object>>> rounds = new ArrayList<>();
        for (RoundView r : t.getRounds()) {
            List<Map<String, Object>> games = new ArrayList<>();
            for (TournamentGameView g : r.getGames()) {
                Map<String, Object> gm = new LinkedHashMap<>();
                gm.put("round", g.getRoundNum());
                gm.put("matchId", g.getMatchId());
                gm.put("gameId", g.getGameId());
                gm.put("tableId", g.getTableId());
                gm.put("state", g.getState());
                gm.put("result", g.getResult());
                gm.put("players", g.getPlayers());
                games.add(gm);
            }
            rounds.add(games);
        }
        m.put("rounds", rounds);
        return m;
    }

    static Map<String, Object> draft(DraftView d, DraftPickView pick, CardCatalog catalog) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (d != null) {
            m.put("sets", d.getSetNames());
            m.put("players", d.getPlayers());
            m.put("boosterNum", d.getBoosterNum());
            m.put("cardNum", d.getCardNum());
        }
        if (pick != null) {
            m.put("booster", cards(pick.getBooster(), catalog));
            m.put("picks", cards(pick.getPicks(), catalog));
            m.put("picking", pick.isPicking());
            m.put("timeout", pick.getTimeout());
            // 1.4.63: sugestões de escolha do servidor, melhor primeiro (DraftPanel.addPickSuggestIcons)
            List<Map<String, Object>> suggests = new ArrayList<>();
            if (pick.getPickSuggests() != null) {
                for (DraftPickSuggest s : pick.getPickSuggests()) {
                    Map<String, Object> sm = new LinkedHashMap<>();
                    sm.put("cardId", s.getCardId());
                    sm.put("rank", s.getRank());
                    sm.put("source", s.getSource());
                    sm.put("info", s.getInfo());
                    suggests.add(sm);
                }
            }
            m.put("suggests", suggests);
        }
        return m;
    }

    static List<Map<String, Object>> cards(SimpleCardsView cards, CardCatalog catalog) {
        List<Map<String, Object>> res = new ArrayList<>();
        if (cards == null) {
            return res;
        }
        for (SimpleCardView c : cards.values()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("set", c.getExpansionSetCode());
            m.put("num", c.getCardNumber());
            CardCatalog.Entry e = catalog.findPrinting(c.getExpansionSetCode(), c.getCardNumber());
            if (e != null) {
                m.put("name", e.name);
                m.put("type", e.typeLine);
                m.put("types", e.types);
                m.put("mv", e.mv);
                m.put("colors", e.colors);
                m.put("rarity", e.rarity);
            }
            res.add(m);
        }
        return res;
    }

    private static String str(JsonObject o, String key) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : null;
    }
}
