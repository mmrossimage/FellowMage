import type { Card, Game, Player } from '../types';
import { stripHtml } from '../util';

export type CommanderDamage = { commander: Card; owner: Player; amount: number };

/** Todos os comandantes de um jogador, estejam na zona de comando ou no campo de batalha. */
export function commandersOf(player: Player): Card[] {
  const fromCommand = player.command.filter((c) => c.commander);
  const fromField = player.battlefield.filter((c) => c.commander);
  const seen = new Set<string>();
  return [...fromCommand, ...fromField].filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
}

/**
 * Dano de comandante recebido por cada jogador (21 de um mesmo comandante = derrota).
 * O XMage identifica o jogador atingido pelo nome.
 */
export function commanderDamageTaken(game: Game, victim: Player): CommanderDamage[] {
  const res: CommanderDamage[] = [];
  for (const owner of game.players) {
    for (const c of commandersOf(owner)) {
      const dmg = Object.entries(c.commander?.damage ?? {}).find(([name]) => stripHtml(name) === victim.name);
      if (dmg && dmg[1] > 0) res.push({ commander: c, owner, amount: dmg[1] });
    }
  }
  return res.sort((a, b) => b.amount - a.amount);
}

/**
 * Jogadores na ordem de turno, começando por mim.
 * O GameView lista os jogadores na ordem em que entraram na mesa, mas o PlayerList do motor
 * (mage.util.CircularList.add) insere cada um no início — logo a ordem de turno é a inversa.
 * (Efeitos que invertem a ordem de turno não são considerados aqui.)
 */
export function seatsFromMe(game: Game): Player[] {
  const order = [...game.players].reverse();
  const i = Math.max(0, order.findIndex((p) => p.me));
  return [...order.slice(i), ...order.slice(0, i)];
}
