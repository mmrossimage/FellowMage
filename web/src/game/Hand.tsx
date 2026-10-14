import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store';
import { CardBack } from './CardFace';
import { GameCard } from './GameCard';

/** Mão do jogador em leque, que sobe ao passar o mouse. */
export function Hand() {
  const hand = useStore((s) => s.game?.hand ?? []);
  const n = hand.length;
  const spread = Math.min(5, 36 / Math.max(n, 1)); // graus entre cartas
  const overlap = n > 9 ? -0.55 : n > 6 ? -0.42 : -0.3; // fração da largura

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[-1rem] flex h-[calc(var(--hand-w)*1.1)] items-end justify-center">
      <AnimatePresence mode="popLayout">
        {hand.map((card, i) => {
          const mid = (n - 1) / 2;
          const rot = (i - mid) * spread;
          const drop = Math.abs(i - mid) ** 1.6 * 3;
          return (
            <div
              key={card.id}
              className="pointer-events-auto origin-bottom"
              style={{
                marginLeft: i === 0 ? 0 : `calc(var(--hand-w) * ${overlap})`,
                transform: `translateY(${drop + 34}%) rotate(${rot}deg)`,
                zIndex: i,
              }}
            >
              <GameCard card={card} className="w-[var(--hand-w)] hover:!z-50" />
            </div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** Mão do oponente: só o verso das cartas. */
export function OpponentHand({ count }: { count: number }) {
  const shown = Math.min(count, 12);
  return (
    <div className="flex justify-center">
      {Array.from({ length: shown }).map((_, i) => (
        <motion.div
          key={i}
          layout
          className="relative aspect-[63/88] w-[calc(var(--card-w)*0.55)] rounded-[6%/4.5%] shadow-lg"
          style={{ marginLeft: i === 0 ? 0 : 'calc(var(--card-w) * -0.32)', transform: `rotate(${(i - (shown - 1) / 2) * -3}deg)` }}
        >
          <CardBack />
        </motion.div>
      ))}
    </div>
  );
}
