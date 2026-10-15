import { AnimatePresence, motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { CardBack } from './CardFace';
import { GameCard } from './GameCard';

/** Mão do jogador em leque; a sobreposição se ajusta à largura disponível. */
export function Hand() {
  const hand = useStore((s) => s.game?.hand ?? []);
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 800, card: 150 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // o contêiner tem altura = 1.1 × largura da carta (ver classe abaixo)
      setBox({ width: el.clientWidth, card: el.clientHeight / 1.1 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = hand.length;
  const spread = Math.min(5, 36 / Math.max(n, 1)); // graus entre cartas
  // passo horizontal entre cartas: no máximo 78% da largura da carta, no mínimo 18%
  const step = n > 1 ? Math.max(box.card * 0.18, Math.min(box.card * 0.78, (box.width - box.card) / (n - 1))) : 0;

  return (
    <div ref={ref} className="pointer-events-none absolute inset-x-0 bottom-[-1rem] flex h-[calc(var(--hand-w)*1.1)] items-end justify-center">
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
                marginLeft: i === 0 ? 0 : step - box.card,
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
