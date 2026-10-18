import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store';
import type { Card, Game, Prompt } from '../types';
import { rulesToHtml } from '../util';
import { CardFace } from './CardFace';

export function findCard(id: string | undefined, game: Game | undefined, prompt: Prompt | undefined): Card | undefined {
  if (!id || !game) return undefined;
  const pools: Card[][] = [game.hand, game.stack, prompt?.cards1 ?? [], prompt?.cards2 ?? []];
  for (const p of game.players) pools.push(p.battlefield, p.graveyard, p.exile, p.command);
  for (const e of game.exiles) pools.push(e.cards);
  for (const r of game.revealed) pools.push(r.cards);
  for (const pool of pools) {
    const c = pool.find((x) => x.id === id);
    if (c) return c;
  }
  return undefined;
}

/** Carta ampliada (com texto de regras do XMage) ao passar o mouse. */
export function CardPreview() {
  const hovered = useStore((s) => s.hovered);
  const game = useStore((s) => s.game);
  const prompt = useStore((s) => s.prompt);
  const card = findCard(hovered, game, prompt);

  return (
    <AnimatePresence>
      {card && !card.faceDown && (
        // no centro da tela, por cima de tudo, sem capturar o mouse (a carta sob o cursor continua clicável)
        <motion.div
          key={card.id}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="pointer-events-none fixed inset-0 z-[75] flex items-center justify-center"
        >
        <aside className="w-[min(320px,24vw,48vh)]">
          <CardFace card={card} size="large" overlays={false} className="shadow-[0_20px_60px_rgba(0,0,0,.8)]" />
          {card.commander && (
            <div className="mt-2 rounded-xl bg-ink-900/95 p-3 text-xs text-amber-100 ring-1 ring-amber-400/30">
              👑 Comandante · conjurado {card.commander.casts}× da zona de comando · imposto atual <b>+{card.commander.tax}</b>
            </div>
          )}
          {(card.ability || card.counters.length > 0 || card.rules.some((r) => /<|\{/.test(r))) && (
            <div className="mt-2 rounded-xl bg-ink-900/95 p-3 text-xs leading-relaxed text-white/85 ring-1 ring-white/10">
              {card.rules.map((r, i) => (
                <p key={i} className="mb-1" dangerouslySetInnerHTML={{ __html: rulesToHtml(r, card.sourceName ?? card.name) }} />
              ))}
            </div>
          )}
        </aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
