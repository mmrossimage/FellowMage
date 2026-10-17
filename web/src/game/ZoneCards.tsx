import { useStore } from '../store';
import type { Card } from '../types';
import { cx } from '../util';
import { CardFace } from './CardFace';
import { canChooseCard, HIGHLIGHT_CLASS, highlightFor, useObjectClick } from './interaction';

/** Cartas de cemitério ou exílio: a permissão de interação vem do pedido atual do XMage. */
export function ZoneCards({ cards }: { cards: Card[] }) {
  const game = useStore((s) => s.game);
  const prompt = useStore((s) => s.prompt);
  const waiting = useStore((s) => s.waiting);
  const setHovered = useStore((s) => s.setHovered);
  const onClick = useObjectClick();

  if (!cards.length) return <p className="text-sm text-white/50">Vazio.</p>;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
      {cards.map((card) => {
        const actionable = canChooseCard(card, prompt, waiting);
        const highlight = highlightFor(card, game, prompt, waiting);
        return (
          <div key={card.id} onMouseEnter={() => setHovered(card.id)} onMouseLeave={() => setHovered(undefined)}>
            <button
              type="button"
              data-obj={card.id}
              disabled={!actionable}
              onClick={() => onClick(card.id)}
              aria-label={card.faceDown ? 'Carta virada para baixo' : card.name}
              className={cx('block w-full rounded-[6%/4.5%] text-left transition', actionable && 'cursor-pointer hover:-translate-y-1', !actionable && 'cursor-default')}
            >
              <CardFace card={card} size="small" className={cx(highlight && HIGHLIGHT_CLASS[highlight])} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
