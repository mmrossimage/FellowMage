import { cardImageUrls } from './cardImage';
import type { Card, Game } from './types';

/**
 * Fundo da mesa: preferência só deste navegador, como as imagens de campo de batalha do cliente
 * oficial (PreferencesDialog: battlefieldImage / battlefieldImageRandom). O servidor nunca vê.
 */
export type TableBg = {
  /** preset: um dos temas abaixo; card: arte de uma carta; commander: arte do seu comandante; random: tema sorteado por partida */
  kind: 'preset' | 'card' | 'commander' | 'random';
  preset: string;
  /** carta escolhida (kind = card); set/número fixam a impressão (a busca só por nome pode trazer outra arte) */
  card?: string;
  cardSet?: string;
  cardNum?: string;
  /** escurecer a arte (0–80%) e desfocar (0–12 px), para as cartas da mesa continuarem legíveis */
  dim: number;
  blur: number;
};

export const PRESETS: { id: string; label: string; css: string }[] = [
  {
    id: 'arcano',
    label: 'Arcano',
    css: 'conic-gradient(from 200deg at 50% 50%, #0d1424, #141b2e, #0f1626, #0b1120, #0d1424)',
  },
  {
    id: 'floresta',
    label: 'Floresta',
    css: 'radial-gradient(ellipse 80% 60% at 30% 30%, #1d3a24, transparent 70%), radial-gradient(ellipse 70% 60% at 75% 75%, #23361a, transparent 70%), #0d1a10',
  },
  {
    id: 'pantano',
    label: 'Pântano',
    css: 'radial-gradient(ellipse 70% 60% at 25% 70%, #2a1d33, transparent 70%), radial-gradient(ellipse 60% 50% at 80% 25%, #1c2420, transparent 70%), #0f0c12',
  },
  {
    id: 'deserto',
    label: 'Deserto',
    css: 'radial-gradient(ellipse 90% 60% at 50% 20%, #5a3a1c, transparent 70%), radial-gradient(ellipse 80% 60% at 50% 90%, #3a2412, transparent 70%), #1e130a',
  },
  {
    id: 'oceano',
    label: 'Oceano',
    css: 'radial-gradient(ellipse 80% 60% at 30% 70%, #0f3a52, transparent 70%), radial-gradient(ellipse 70% 50% at 75% 25%, #123049, transparent 70%), #07131e',
  },
  {
    id: 'vulcao',
    label: 'Vulcão',
    css: 'radial-gradient(ellipse 70% 50% at 50% 100%, #6a1e0e, transparent 70%), radial-gradient(ellipse 60% 50% at 20% 20%, #2a1410, transparent 70%), #140806',
  },
  {
    id: 'planicie',
    label: 'Planície',
    css: 'radial-gradient(ellipse 90% 60% at 50% 30%, #4a4a3a, transparent 70%), radial-gradient(ellipse 80% 60% at 50% 90%, #2c3030, transparent 70%), #16181a',
  },
  {
    id: 'pedra',
    label: 'Pedra',
    css: 'repeating-linear-gradient(135deg, rgba(255,255,255,.02) 0 2px, transparent 2px 8px), linear-gradient(160deg, #26262b, #151518 70%)',
  },
];

export const DEFAULT_TABLE_BG: TableBg = { kind: 'preset', preset: 'arcano', dim: 35, blur: 0 };

const KEY = 'fm.tableBg';

export function loadTableBg(): TableBg {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return saved ? { ...DEFAULT_TABLE_BG, ...saved } : DEFAULT_TABLE_BG;
  } catch {
    return DEFAULT_TABLE_BG;
  }
}

export function saveTableBg(bg: TableBg) {
  try {
    localStorage.setItem(KEY, JSON.stringify(bg));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

/** Nome do seu comandante na partida (zona de comando ou campo de batalha). */
export function myCommanderName(game: Game | undefined): string | undefined {
  return myCommander(game)?.name;
}

function myCommander(game: Game | undefined): Card | undefined {
  const me = game?.players.find((p) => p.me);
  if (!me) return undefined;
  return me.command.find((c) => c.commander) ?? me.battlefield.find((c) => c.commander);
}

/**
 * O que pintar no fundo: degradê de um tema ou a arte de uma carta (recorte da ilustração no
 * Scryfall). `seed` escolhe o tema no modo aleatório (o id da partida, para não mudar no meio dela).
 */
export function resolveTableBg(bg: TableBg, game: Game | undefined, seed: string | undefined): { css: string; art?: string } {
  const preset = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  if (bg.kind === 'random') {
    const h = [...(seed ?? '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    return { css: PRESETS[h % PRESETS.length].css };
  }
  // a impressão exata (set/número) quando conhecida: a busca só por nome pode trazer outra arte
  const commander = bg.kind === 'commander' ? myCommander(game) : undefined;
  const ref = bg.kind === 'card' && bg.card ? { name: bg.card, set: bg.cardSet, num: bg.cardNum } : commander ? { name: commander.name, set: commander.set, num: commander.num } : undefined;
  if (ref) {
    return { css: preset(bg.preset).css, art: cardImageUrls(ref, 'art_crop')[0] };
  }
  return { css: preset(bg.preset).css };
}
