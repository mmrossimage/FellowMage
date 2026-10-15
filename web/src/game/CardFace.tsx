import { memo, useState } from 'react';
import type { Card } from '../types';
import { cardImageUrls, colorAccent, type ImageSize } from '../cardImage';
import { cx, manaSymbols, symbolUrl } from '../util';

type Props = {
  card: Card;
  size?: ImageSize;
  className?: string;
  /** mostrar P/T, dano e marcadores por cima da imagem */
  overlays?: boolean;
  damage?: number;
};

/** A "face" da carta: imagem do Scryfall com fallback para uma moldura desenhada. */
export const CardFace = memo(function CardFace({ card, size = 'normal', className, overlays = true, damage = 0 }: Props) {
  const urls = cardImageUrls(card, size);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const src = urls[attempt];
  const showFallback = !src || !loaded;

  return (
    <div className={cx('relative aspect-[63/88] overflow-hidden rounded-[6%/4.5%] bg-ink-800 select-none', className)}>
      {card.faceDown ? (
        <CardBack />
      ) : (
        <>
          {showFallback && <DrawnFrame card={card} />}
          {src && (
            <img
              key={src}
              src={src}
              alt={card.name}
              draggable={false}
              loading="lazy"
              className={cx('absolute inset-0 h-full w-full object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
              onLoad={() => setLoaded(true)}
              onError={() => {
                setLoaded(false);
                setAttempt((a) => a + 1);
              }}
            />
          )}
        </>
      )}

      {overlays && <CardOverlays card={card} damage={damage} />}
    </div>
  );
});

export function CardBack({ className }: { className?: string }) {
  return (
    <div className={cx('absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[#2b1a0e] via-[#4a2c12] to-[#1b0f07] p-[7%] ring-1 ring-black/60', className)}>
      <div className="h-full w-full rounded-[50%/38%] border border-amber-600/50 bg-[radial-gradient(circle_at_50%_40%,#8a5522,#3a1f0c_55%,#1e1007_75%)] shadow-[inset_0_0_10px_rgba(0,0,0,.6)]" />
    </div>
  );
}

function DrawnFrame({ card }: { card: Card }) {
  return (
    <div className={cx('absolute inset-0 flex flex-col bg-gradient-to-b p-[5%] text-[clamp(6px,0.7vw,11px)] text-black/85', colorAccent(card.colors))}>
      <div className="flex items-center justify-between gap-1 rounded-sm bg-white/70 px-1 py-[2px] font-semibold leading-tight">
        <span className="truncate">{card.name}</span>
        <ManaCost cost={card.cost} className="h-[1.1em]" />
      </div>
      <div className="my-[4%] flex-1 rounded-sm bg-black/25" />
      <div className="truncate rounded-sm bg-white/70 px-1 py-[1px] text-[0.9em] leading-tight">{card.type}</div>
      <div className="mt-[3%] h-[28%] overflow-hidden rounded-sm bg-white/60 px-1 py-[2px] text-[0.85em] leading-snug">
        {card.rules.slice(0, 3).map((r, i) => (
          <p key={i} className="truncate" dangerouslySetInnerHTML={{ __html: r.replace(/<[^>]+>/g, '') }} />
        ))}
      </div>
    </div>
  );
}

function CardOverlays({ card, damage }: { card: Card; damage: number }) {
  const isCreature = card.types.includes('CREATURE');
  const isPW = card.types.includes('PLANESWALKER');
  const counters = card.counters.filter((c) => c.count > 0);
  return (
    <>
      {card.commander && (
        <span className="absolute left-1/2 top-[1%] -translate-x-1/2 rounded-b-md bg-black/75 px-1 text-[clamp(8px,0.8vw,13px)] leading-none" title="Comandante">
          👑
        </span>
      )}
      {counters.length > 0 && (
        <div className="absolute left-[4%] top-[14%] flex flex-col gap-[2px]">
          {counters.map((c) => (
            <span key={c.name} className="rounded-full bg-black/80 px-[0.45em] text-[clamp(8px,0.75vw,12px)] font-bold text-amber-200 ring-1 ring-amber-400/60" title={c.name}>
              {c.count} {abbrevCounter(c.name)}
            </span>
          ))}
        </div>
      )}
      {isCreature && card.power != null && (
        <div
          className={cx(
            'absolute bottom-[3%] right-[4%] rounded-md bg-black/85 px-[0.4em] text-[clamp(9px,0.9vw,14px)] font-bold tabular-nums ring-1',
            damage > 0 ? 'text-blood-400 ring-blood-500/70' : 'text-white ring-white/30',
          )}
        >
          {card.power}/{damage > 0 ? Number(card.toughness) - damage : card.toughness}
        </div>
      )}
      {isPW && card.loyalty && (
        <div className="absolute bottom-[3%] right-[4%] rounded-md bg-black/85 px-[0.45em] text-[clamp(9px,0.9vw,14px)] font-bold text-sky-200 ring-1 ring-sky-300/60">
          {card.loyalty}
        </div>
      )}
    </>
  );
}

function abbrevCounter(name: string) {
  if (name === 'P1P1' || name === '+1/+1') return '+1/+1';
  if (name === 'M1M1' || name === '-1/-1') return '-1/-1';
  return name.length > 8 ? name.slice(0, 7) + '…' : name;
}

export function ManaCost({ cost, className }: { cost?: string; className?: string }) {
  const syms = manaSymbols(cost);
  if (!syms.length) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-[1px]">
      {syms.map((s, i) => (
        <img key={i} src={symbolUrl(s)} alt={`{${s}}`} className={cx('aspect-square drop-shadow', className ?? 'h-4')} />
      ))}
    </span>
  );
}
