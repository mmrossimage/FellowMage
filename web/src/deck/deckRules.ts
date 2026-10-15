import type { CatalogCard, EditorDeck } from '../types';

export const CATEGORIES: { key: string; label: string }[] = [
  { key: 'CREATURE', label: 'Criaturas' },
  { key: 'PLANESWALKER', label: 'Planeswalkers' },
  { key: 'BATTLE', label: 'Batalhas' },
  { key: 'INSTANT', label: 'Instantâneas' },
  { key: 'SORCERY', label: 'Feitiços' },
  { key: 'ARTIFACT', label: 'Artefatos' },
  { key: 'ENCHANTMENT', label: 'Encantamentos' },
  { key: 'LAND', label: 'Terrenos' },
  { key: 'OTHER', label: 'Outros' },
];

export function categoryOf(c: CatalogCard): string {
  if (c.types.includes('LAND')) return 'LAND';
  return CATEGORIES.find((k) => c.types.includes(k.key))?.key ?? 'OTHER';
}

export const cardKey = (c: Pick<CatalogCard, 'name'>) => c.name.toLowerCase();

const WUBRG = ['W', 'U', 'B', 'R', 'G'];

export function commanderIdentity(deck: EditorDeck): string[] {
  const set = new Set(deck.commanders.flatMap((c) => c.identity));
  return WUBRG.filter((c) => set.has(c));
}

/** Cartas que podem ter várias cópias num deck singleton (básicos e "A deck can have any number…"). */
export function allowsMultiple(c: CatalogCard): boolean {
  return !!c.basic || c.rules.some((r) => /a deck can have (any number|up to \w+) of cards named/i.test(r));
}

export type Problem = { level: 'error' | 'warn'; text: string; cards?: string[] };

export const DECK_SIZE = 100;

export function countCards(deck: EditorDeck) {
  return deck.cards.reduce((n, c) => n + (c.qty ?? 1), 0) + deck.commanders.length;
}

/** Validação das regras de Commander (CR 903). */
export function validate(deck: EditorDeck): { problems: Problem[]; offIdentity: Set<string>; duplicates: Set<string> } {
  const problems: Problem[] = [];
  const total = countCards(deck);
  if (total !== DECK_SIZE) {
    problems.push({ level: 'error', text: `O deck tem ${total} cartas; Commander exige exatamente ${DECK_SIZE} (incluindo o comandante).` });
  }
  if (deck.commanders.length === 0) problems.push({ level: 'error', text: 'Escolha um comandante (👑 nos resultados da busca).' });
  if (deck.commanders.length > 2) problems.push({ level: 'error', text: 'No máximo 2 comandantes (parceiros).' });
  for (const c of deck.commanders) {
    if (!c.canBeCommander && !c.unknown) problems.push({ level: 'error', text: `${c.name} não pode ser comandante (precisa ser uma criatura lendária).`, cards: [c.name] });
  }
  if (deck.commanders.length === 2) {
    const partner = (c: CatalogCard) => c.rules.some((r) => /partner|friends forever|choose a background|doctor's companion/i.test(r));
    if (!deck.commanders.every(partner)) problems.push({ level: 'warn', text: 'Dois comandantes só são permitidos com Parceiro (Partner) ou habilidades parecidas.' });
  }

  const identity = commanderIdentity(deck);
  const offIdentity = new Set<string>();
  if (deck.commanders.length) {
    for (const c of deck.cards) if (!c.identity.every((x) => identity.includes(x))) offIdentity.add(cardKey(c));
    if (offIdentity.size) {
      problems.push({ level: 'error', text: `${offIdentity.size} carta(s) fora da identidade de cor do comandante.`, cards: [...offIdentity] });
    }
  }

  const counts = new Map<string, number>();
  for (const c of [...deck.commanders, ...deck.cards]) counts.set(cardKey(c), (counts.get(cardKey(c)) ?? 0) + (c.qty ?? 1));
  const duplicates = new Set<string>();
  for (const c of [...deck.commanders, ...deck.cards]) if (!allowsMultiple(c) && (counts.get(cardKey(c)) ?? 0) > 1) duplicates.add(cardKey(c));
  if (duplicates.size) problems.push({ level: 'error', text: `Commander é singleton: ${duplicates.size} carta(s) repetida(s).`, cards: [...duplicates] });

  const unknown = deck.cards.filter((c) => c.unknown).map((c) => c.name);
  if (unknown.length) problems.push({ level: 'warn', text: `${unknown.length} carta(s) que o XMage não conhece serão ignoradas no jogo.`, cards: unknown });

  return { problems, offIdentity, duplicates };
}

/** Lista em texto no formato aceito por Moxfield/Archidekt/Arena (e pelo próprio importador). */
export function exportText(deck: EditorDeck): string {
  const line = (c: CatalogCard) => `${c.qty ?? 1} ${c.name}${c.set && c.num ? ` (${c.set}) ${c.num}` : ''}`;
  const parts: string[] = [];
  if (deck.commanders.length) parts.push('Commander', ...deck.commanders.map((c) => line({ ...c, qty: 1 })), '');
  parts.push('Deck', ...[...deck.cards].sort((a, b) => a.name.localeCompare(b.name)).map(line));
  return parts.join('\n');
}

export function manaCurve(deck: EditorDeck) {
  const buckets = Array.from({ length: 8 }, () => 0); // 0..6, 7+
  for (const c of deck.cards) {
    if (c.types.includes('LAND')) continue;
    buckets[Math.min(7, c.mv)] += c.qty ?? 1;
  }
  return buckets;
}

/** Quantidade de símbolos de cada cor nos custos (para ajustar a base de mana). */
export function colorPips(deck: EditorDeck) {
  const res: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const c of [...deck.commanders, ...deck.cards]) {
    for (const m of c.cost.matchAll(/\{([^}]+)\}/g)) {
      for (const col of WUBRG) if (m[1].toUpperCase().split('/').includes(col)) res[col] += c.qty ?? 1;
    }
  }
  return res;
}
