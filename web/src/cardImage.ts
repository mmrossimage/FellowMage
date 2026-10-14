import type { Card } from './types';

// Imagens das cartas via Scryfall (https://scryfall.com/docs/api/images).
// 1ª tentativa: set + número de coleção (a arte exata do deck);
// 2ª tentativa: busca pelo nome (para códigos de set que diferem entre XMage e Scryfall).

export type ImageSize = 'small' | 'normal' | 'large' | 'art_crop';

export function cardImageUrls(card: Pick<Card, 'name' | 'set' | 'num' | 'faceDown' | 'sourceName'>, size: ImageSize = 'normal'): string[] {
  if (card.faceDown) return [];
  const urls: string[] = [];
  if (card.set && card.num) {
    urls.push(`https://api.scryfall.com/cards/${encodeURIComponent(card.set.toLowerCase())}/${encodeURIComponent(card.num)}?format=image&version=${size}`);
  }
  const name = (card.sourceName ?? card.name)?.split(' // ')[0];
  if (name) {
    urls.push(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=${size}`);
  }
  return urls;
}

/** Cor dominante para molduras/placeholders. */
export function colorAccent(colors: string[]): string {
  if (colors.length > 1) return 'from-amber-300/80 to-yellow-700/80';
  switch (colors[0]) {
    case 'W': return 'from-amber-50/90 to-stone-300/90';
    case 'U': return 'from-sky-400/90 to-blue-800/90';
    case 'B': return 'from-zinc-600/90 to-zinc-950/90';
    case 'R': return 'from-red-500/90 to-red-900/90';
    case 'G': return 'from-emerald-500/90 to-green-900/90';
    default: return 'from-slate-400/90 to-slate-700/90';
  }
}
