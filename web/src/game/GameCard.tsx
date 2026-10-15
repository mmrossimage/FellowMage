import { motion } from 'framer-motion';
import { useRef } from 'react';
import { useStore } from '../store';
import type { Card, Permanent } from '../types';
import { cx } from '../util';
import { CardFace } from './CardFace';
import { HIGHLIGHT_CLASS, highlightFor, useObjectClick } from './interaction';

type Props = {
  card: Card | Permanent;
  className?: string;
  /** deslocamento extra (ex.: atacantes avançam em direção ao oponente) */
  lift?: number;
  style?: React.CSSProperties;
  hoverRaise?: boolean;
  /** P/T, marcadores etc. (desligar em miniaturas) */
  overlays?: boolean;
  /** permite arrastar para cima para jogar (cartas da mão) */
  dragToPlay?: boolean;
};

// distância (px) que a carta precisa subir para contar como "jogar"
const DRAG_PLAY_THRESHOLD = 110;

export function GameCard({ card, className, lift = 0, style, hoverRaise = true, overlays = true, dragToPlay = false }: Props) {
  const game = useStore((s) => s.game);
  const prompt = useStore((s) => s.prompt);
  const waiting = useStore((s) => s.waiting);
  const setHovered = useStore((s) => s.setHovered);
  const onClick = useObjectClick();
  const dragged = useRef(false);

  const perm = 'tapped' in card ? (card as Permanent) : undefined;
  const hl = highlightFor(card, game, prompt, waiting);
  const clickable = hl === 'playable' || hl === 'target' || (waiting && prompt?.kind === 'playMana');
  const canDrag = dragToPlay && hl === 'playable';

  return (
    <motion.div
      drag={canDrag}
      dragSnapToOrigin
      dragElastic={0.6}
      onDragStart={() => {
        dragged.current = true;
      }}
      onDragEnd={(_, info) => {
        if (info.offset.y < -DRAG_PLAY_THRESHOLD) onClick(card.id);
        // o "click" nativo dispara logo após soltar: ignorá-lo
        setTimeout(() => (dragged.current = false), 0);
      }}
      whileDrag={{ scale: 1.12, zIndex: 60, rotate: 0 }}
      layoutId={card.id}
      layout
      initial={{ opacity: 0, scale: 0.6, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: lift, rotate: perm?.tapped ? 90 : 0 }}
      exit={{ opacity: 0, scale: 0.5 }}
      whileHover={hoverRaise ? { y: lift - 8, scale: 1.04, zIndex: 30 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      style={style}
      data-obj={card.id}
      className={cx('relative shrink-0 rounded-[6%/4.5%]', clickable ? 'cursor-pointer' : 'cursor-default', className)}
      onMouseEnter={() => setHovered(card.id)}
      onMouseLeave={() => setHovered(undefined)}
      onClick={(e) => {
        e.stopPropagation();
        if (dragged.current) return;
        onClick(card.id);
      }}
    >
      <CardFace card={card} overlays={overlays} damage={perm?.damage ?? 0} className={cx('h-full w-full transition-shadow', hl && HIGHLIGHT_CLASS[hl])} />
      {perm?.sick && card.types.includes('CREATURE') && (
        <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-black/70 px-1.5 text-[10px] text-sky-200" title="Enjoo de invocação">
          zZ
        </span>
      )}
      {hl === 'attacking' && (
        <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-blood-500 px-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
          Ataca
        </span>
      )}
      {hl === 'blocking' && (
        <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-arcane-600 px-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
          Bloqueia
        </span>
      )}
    </motion.div>
  );
}
