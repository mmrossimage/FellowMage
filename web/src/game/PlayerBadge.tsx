import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Card, ManaPool, Player } from '../types';
import { cx, symbolUrl } from '../util';
import { CardFace } from './CardFace';
import { useObjectClick } from './interaction';

/** Retrato do jogador: vida, grimório, cemitério, exílio e reserva de mana. */
export function PlayerBadge({ player, align }: { player: Player; align: 'top' | 'bottom' }) {
  const prompt = useStore((s) => s.prompt);
  const waiting = useStore((s) => s.waiting);
  const onClick = useObjectClick();
  const targetable = waiting && !!prompt?.targets?.includes(player.id);
  const delta = useLifeDelta(player.life);
  const [zone, setZone] = useState<'graveyard' | 'exile' | null>(null);

  return (
    <div className={cx('flex items-center gap-3', align === 'top' ? 'flex-row' : 'flex-row')}>
      <button
        onClick={() => onClick(player.id)}
        className={cx(
          'relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 bg-gradient-to-br from-ink-700 to-ink-900 shadow-panel transition',
          player.active ? 'border-ember-400' : 'border-white/15',
          targetable && 'cursor-pointer shadow-target animate-pulse',
          player.priority && 'ring-4 ring-arcane-400/40',
        )}
        title={targetable ? 'Escolher este jogador como alvo' : player.name}
      >
        <span className={cx('font-display text-3xl font-bold tabular-nums', player.life <= 5 ? 'text-blood-400' : 'text-white')}>{player.life}</span>
        <AnimatePresence>
          {delta && (
            <motion.span
              key={delta.key}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: -28 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9 }}
              className={cx('absolute -top-1 text-lg font-bold', delta.value < 0 ? 'text-blood-400' : 'text-emerald-300')}
            >
              {delta.value > 0 ? `+${delta.value}` : delta.value}
            </motion.span>
          )}
        </AnimatePresence>
        {player.monarch && <span className="absolute -right-1 -top-1 text-lg" title="Monarca">👑</span>}
      </button>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-display text-base font-bold text-white">{player.name}</span>
          {!player.human && <span className="rounded bg-white/10 px-1.5 text-[10px] uppercase tracking-wider text-white/60">IA</span>}
          {player.active && <span className="rounded bg-ember-500/20 px-1.5 text-[10px] uppercase tracking-wider text-ember-300">turno</span>}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-white/70">
          <Pill icon="📚" label="Grimório" value={player.library} />
          <Pill icon="✋" label="Mão" value={player.handCount} />
          <Pill icon="🪦" label="Cemitério" value={player.graveyard.length} onClick={() => setZone(zone === 'graveyard' ? null : 'graveyard')} />
          <Pill icon="🌀" label="Exílio" value={player.exile.length} onClick={() => setZone(zone === 'exile' ? null : 'exile')} />
        </div>
        <ManaPoolView pool={player.mana} playerId={player.id} />
        {player.counters.filter((c) => c.count > 0).length > 0 && (
          <div className="mt-1 flex gap-1">
            {player.counters.map((c) => (
              <span key={c.name} className="rounded bg-purple-500/20 px-1.5 text-[11px] text-purple-200">
                {c.count} {c.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {zone && (
          <ZonePopover
            title={zone === 'graveyard' ? `Cemitério de ${player.name}` : `Exílio de ${player.name}`}
            cards={zone === 'graveyard' ? player.graveyard : player.exile}
            onClose={() => setZone(null)}
            align={align}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Pill({ icon, label, value, onClick }: { icon: string; label: string; value: number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      title={label}
      className={cx('flex items-center gap-1 rounded-md bg-black/40 px-1.5 py-0.5 ring-1 ring-white/10', onClick && 'hover:bg-white/10')}
    >
      <span>{icon}</span>
      <span className="font-semibold tabular-nums text-white">{value}</span>
    </button>
  );
}

const MANA_ORDER: (keyof ManaPool)[] = ['W', 'U', 'B', 'R', 'G', 'C'];
const MANA_TYPE: Record<keyof ManaPool, string> = { W: 'WHITE', U: 'BLUE', B: 'BLACK', R: 'RED', G: 'GREEN', C: 'COLORLESS' };

function ManaPoolView({ pool, playerId }: { pool: ManaPool; playerId: string }) {
  const prompt = useStore((s) => s.prompt);
  const waiting = useStore((s) => s.waiting);
  const send = useStore((s) => s.send);
  const entries = MANA_ORDER.filter((k) => (pool?.[k] ?? 0) > 0);
  if (!entries.length) return null;
  const canPay = waiting && (prompt?.kind === 'playMana' || prompt?.kind === 'playXMana');
  return (
    <div className="mt-1 flex gap-1">
      {entries.map((k) => (
        <button
          key={k}
          disabled={!canPay}
          onClick={() => send({ t: 'sendManaType', mana: MANA_TYPE[k], playerId })}
          className={cx('flex items-center gap-0.5 rounded-full bg-black/50 px-1 py-0.5', canPay && 'shadow-playable')}
          title={canPay ? 'Pagar com esta mana' : 'Reserva de mana'}
        >
          <img src={symbolUrl(k)} className="h-4 w-4" alt={k} />
          <span className="text-xs font-bold text-white">{pool[k]}</span>
        </button>
      ))}
    </div>
  );
}

function ZonePopover({ title, cards, onClose, align }: { title: string; cards: Card[]; onClose: () => void; align: 'top' | 'bottom' }) {
  const setHovered = useStore((s) => s.setHovered);
  return (
    <motion.div
      initial={{ opacity: 0, y: align === 'top' ? -10 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={cx(
        'absolute left-0 z-40 max-h-[50vh] w-[min(560px,80vw)] overflow-auto rounded-xl border border-white/10 bg-ink-900/95 p-3 shadow-panel backdrop-blur',
        align === 'top' ? 'top-full mt-2' : 'bottom-full mb-2',
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-sm text-white">{title}</span>
        <button onClick={onClose} className="text-white/60 hover:text-white">✕</button>
      </div>
      {cards.length === 0 ? (
        <p className="text-sm text-white/50">Vazio.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-2">
          {cards.map((c) => (
            <div key={c.id} onMouseEnter={() => setHovered(c.id)} onMouseLeave={() => setHovered(undefined)}>
              <CardFace card={c} size="small" />
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function useLifeDelta(life: number) {
  const prev = useRef(life);
  const [delta, setDelta] = useState<{ value: number; key: number } | null>(null);
  useEffect(() => {
    if (life !== prev.current) {
      setDelta({ value: life - prev.current, key: Date.now() });
      prev.current = life;
      const t = setTimeout(() => setDelta(null), 1200);
      return () => clearTimeout(t);
    }
  }, [life]);
  return delta;
}
