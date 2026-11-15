import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
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

const GAP = 24; // distância entre o cursor e a carta
const MARGIN = 8; // folga até a borda da tela

/** Carta ampliada (com texto de regras do XMage) ao passar o mouse; acompanha o cursor. */
export function CardPreview() {
  const hovered = useStore((s) => s.hovered);
  const game = useStore((s) => s.game);
  const prompt = useStore((s) => s.prompt);
  const card = findCard(hovered, game, prompt);
  const show = !!card && !card.faceDown;

  const box = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  // posiciona direto no elemento (sem re-render a cada movimento): à direita do cursor, ou à esquerda
  // quando não couber, centralizada na altura do cursor e sempre dentro da tela
  const place = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const { x, y } = mouse.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = x + GAP;
    if (left + w > window.innerWidth - MARGIN) left = x - GAP - w;
    left = Math.max(MARGIN, left);
    const top = Math.min(Math.max(MARGIN, y - h / 2), Math.max(MARGIN, window.innerHeight - h - MARGIN));
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }, []);

  useEffect(() => {
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          place();
        });
      }
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    // a imagem carrega depois e muda a altura: reposiciona para não sair da tela
    const resize = new ResizeObserver(() => place());
    if (box.current) resize.observe(box.current);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
      resize.disconnect();
    };
  }, [place]);

  // carta nova (ou texto de regras que muda a altura): reposiciona antes de pintar
  useLayoutEffect(() => {
    if (show) place();
  }, [show, card?.id, place]);

  return (
    // sem capturar o mouse: a carta sob o cursor continua clicável
    <div ref={box} className="pointer-events-none fixed left-0 top-0 z-[75] w-[min(320px,24vw,48vh)]">
      <AnimatePresence>
        {show && card && (
        <motion.aside
          key={card.id}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
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
        </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
