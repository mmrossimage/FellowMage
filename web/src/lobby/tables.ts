import type { LobbyTable } from '../types';

/** Estados de mesa do XMage (TableState) em português. */
export const TABLE_STATE: Record<string, string> = {
  WAITING: 'Aguardando jogadores',
  READY_TO_START: 'Pronta para começar',
  STARTING: 'Começando',
  DRAFTING: 'Draft',
  CONSTRUCTING: 'Montando decks',
  DUELING: 'Em jogo',
  SIDEBOARDING: 'Sideboard',
  FINISHED: 'Encerrada',
};

export const SKILL_LABEL: Record<string, string> = {
  BEGINNER: 'Iniciante',
  CASUAL: 'Casual',
  SERIOUS: 'Sério',
  Beginner: 'Iniciante',
  Casual: 'Casual',
  Serious: 'Sério',
};

export const filledSeats = (t: LobbyTable) => t.seats.filter((s) => s.name).length;

/** Dá para entrar: mesa ou torneio aguardando, com vaga livre para humano. */
export const canJoin = (t: LobbyTable) =>
  t.state === 'WAITING' && t.seats.some((s) => !s.name && (s.type === null || s.type === 'HUMAN'));

export function ago(ms: number | null) {
  if (!ms) return '';
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
}

/** Pasta de decks mais provável para um tipo de deck do XMage (ex.: "Variant Magic - Commander"). */
export function preferredFolder(deckType: string | undefined) {
  if (!deckType) return '';
  if (/commander|brawl|oathbreaker/i.test(deckType)) return 'Commander/';
  return '';
}

/** Seus decks primeiro, depois os exemplos da pasta do formato, depois o resto. */
export function sortDecks(decks: string[], deckType?: string) {
  const folder = preferredFolder(deckType);
  const rank = (d: string) => (d.startsWith('Meus decks/') ? 0 : folder && d.startsWith(folder) ? 1 : 2);
  return [...decks].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
