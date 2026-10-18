import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { CardBack } from './CardFace';
import { GameCard } from './GameCard';

/**
 * Mão do jogador em leque, sempre dentro da largura disponível. A carta sob o mouse sobe e vem para a
 * frente, afastando as vizinhas; a roda do mouse percorre a mão (útil quando ela fica grande).
 */
export function Hand() {
  const hand = useStore((s) => s.game?.hand ?? []);
  const setHovered = useStore((s) => s.setHovered);
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 800, card: 150 });
  const [focus, setFocus] = useState<number | null>(null);
  const n = hand.length;
  const focused = focus !== null && focus < n ? focus : null;

  // roda do mouse: o listener precisa ser não passivo para impedir a rolagem da página
  const wheelState = useRef({ n, focused, hand });
  wheelState.current = { n, focused, hand };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { n, focused, hand } = wheelState.current;
      if (!n) return;
      e.preventDefault();
      const dir = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) > 0 ? 1 : -1;
      const next = Math.max(0, Math.min(n - 1, (focused ?? Math.floor((n - 1) / 2)) + dir));
      setFocus(next);
      setHovered(hand[next].id); // mostra a prévia da carta em foco
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setHovered]);

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

  const spread = Math.min(5, 36 / Math.max(n, 1)); // graus entre cartas
  // passo horizontal entre cartas: até 78% da largura da carta, menos quando a mão não cabe
  // (1.3 × carta: as cartas das pontas giram e ocupam mais que a própria largura)
  const step = n > 1 ? Math.max(0, Math.min(box.card * 0.78, (box.width - box.card * 1.3) / (n - 1))) : 0;
  // com a mão apertada, as vizinhas da carta em foco se afastam para ela aparecer inteira
  const push = Math.max(0, box.card * 0.7 - step);

  return (
    <div
      ref={ref}
      onMouseLeave={() => setFocus(null)}
      className="pointer-events-none absolute inset-x-0 bottom-[-1rem] flex h-[calc(var(--hand-w)*1.1)] items-end justify-center"
    >
      <AnimatePresence mode="popLayout">
        {hand.map((card, i) => {
          const mid = (n - 1) / 2;
          const isFocus = i === focused;
          const rot = isFocus ? 0 : (i - mid) * spread;
          // curva do leque limitada à de uma mão de 7 cartas: senão as das pontas somem abaixo da tela
          const edge = Math.abs(i - mid) / Math.max(mid, 1);
          const drop = isFocus ? -6 : edge ** 1.6 * Math.min(18, 3 * mid ** 1.6);
          const shift = focused === null || isFocus ? 0 : i < focused ? -push : push;
          return (
            <div
              key={card.id}
              className="pointer-events-auto origin-bottom transition-transform duration-150 ease-out"
              onMouseEnter={() => setFocus(i)}
              style={{
                marginLeft: i === 0 ? 0 : step - box.card,
                transform: `translateX(${shift}px) translateY(${drop + 34}%) rotate(${rot}deg) scale(${isFocus ? 1.08 : 1})`,
                // o zIndex do invólucro (girado, logo um contexto de empilhamento) é o que decide quem fica na frente
                zIndex: isFocus ? 100 : i,
              }}
            >
              <GameCard card={card} dragToPlay hoverRaise={false} className="w-[var(--hand-w)]" />
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
