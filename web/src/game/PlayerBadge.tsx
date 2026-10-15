import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Card, ManaPool, Player } from '../types';
import { cx, symbolUrl } from '../util';
import { CardFace } from './CardFace';
import { commanderDamageTaken, commandersOf } from './commander';
import { GameCard } from './GameCard';
import { useObjectClick } from './interaction';

type Props = { player: Player; align: 'top' | 'bottom'; compact?: boolean };

/** Retrato do jogador: vida, contadores de zonas, zona de comando, dano de comandante e mana. */
export function PlayerBadge({ player, align, compact = false }: Props) {
  const game = useStore((s) => s.game);
  const prompt = useStore((s) => s.prompt);
  const waiting = useStore((s) => s.waiting);
  const onClick = useObjectClick();
  const targetable = waiting && !!prompt?.targets?.includes(player.id);
  const delta = useLifeDelta(player.life);
  const [zone, setZone] = useState<'graveyard' | 'exile' | null>(null);
  const cmdDamage = game ? commanderDamageTaken(game, player) : [];
  const inCommandZone = player.command.filter((c) => c.commander);
  const emblems = player.command.filter((c) => c.emblem);
  const size = compact ? 'h-14 w-14' : 'h-20 w-20';

  return (
    <div className={cx('relative flex min-w-0 items-center', compact ? 'flex-wrap gap-2' : 'gap-3', player.left && 'opacity-40 grayscale')}>
      <button
        onClick={() => onClick(player.id)}
        data-obj={player.id}
        className={cx(
          'relative flex shrink-0 items-center justify-center rounded-full border-2 bg-gradient-to-br from-ink-700 to-ink-900 shadow-panel transition',
          size,
          player.active ? 'border-ember-400' : 'border-white/15',
          targetable && 'cursor-pointer shadow-target animate-pulse',
          player.priority && 'ring-4 ring-arcane-400/40',
        )}
        title={targetable ? 'Escolher este jogador como alvo' : player.name}
      >
        <span className={cx('font-display font-bold tabular-nums', compact ? 'text-2xl' : 'text-3xl', player.life <= 10 ? 'text-blood-400' : 'text-white')}>
          {player.life}
        </span>
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
        {player.initiative && <span className="absolute -left-1 -top-1 text-base" title="Iniciativa">🗝️</span>}
      </button>

      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cx('truncate font-display font-bold text-white', compact ? 'max-w-[9rem] text-sm xl:max-w-[11rem]' : 'text-base')}>{player.name}</span>
          {!player.human && <span className="rounded bg-white/10 px-1 text-[9px] uppercase tracking-wider text-white/60">IA</span>}
          {player.active && <span className="rounded bg-ember-500/20 px-1 text-[9px] uppercase tracking-wider text-ember-300">turno</span>}
          {player.left && <span className="rounded bg-blood-500/30 px-1 text-[9px] uppercase tracking-wider text-blood-400">fora</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-white/70">
          <Pill icon="📚" label="Grimório" value={player.library} />
          <Pill icon="✋" label="Mão" value={player.handCount} />
          <Pill icon="🪦" label="Cemitério" value={player.graveyard.length} onClick={() => setZone(zone === 'graveyard' ? null : 'graveyard')} />
          <Pill icon="🌀" label="Exílio" value={player.exile.length} onClick={() => setZone(zone === 'exile' ? null : 'exile')} />
        </div>
        {cmdDamage.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {cmdDamage.map((d) => (
              <span
                key={d.commander.name}
                title={`Dano de comandante recebido de ${d.commander.name} (${d.owner.name}). 21 = derrota.`}
                className={cx(
                  'rounded px-1.5 text-[10px] font-semibold ring-1',
                  d.amount >= 15 ? 'bg-blood-500/30 text-blood-400 ring-blood-500/50' : 'bg-black/40 text-white/80 ring-white/10',
                )}
              >
                ⚔ {d.commander.name.split(',')[0]} {d.amount}/21
              </span>
            ))}
          </div>
        )}
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

      {(inCommandZone.length > 0 || commandersOf(player).length > 0 || emblems.length > 0) && (
        <CommandZone player={player} cards={inCommandZone} emblems={emblems} compact={compact} />
      )}

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

/** Zona de comando: comandante(s) com o imposto atual. Clicar conjura (quando jogável). */
function CommandZone({ player, cards, emblems, compact }: { player: Player; cards: Card[]; emblems: Card[]; compact: boolean }) {
  const setHovered = useStore((s) => s.setHovered);
  const all = commandersOf(player);
  const w = compact ? 'w-10' : 'w-14';
  return (
    <div className="flex items-end gap-1.5 rounded-xl bg-black/30 p-1.5 ring-1 ring-amber-400/20" title="Zona de comando">
      {cards.map((c) => (
        <div key={c.id} className="relative">
          <GameCard card={c} className={w} hoverRaise={false} overlays={false} />
          {c.commander && c.commander.tax > 0 && (
            <span className="pointer-events-none absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-ink-950 px-1.5 text-[10px] font-bold text-ember-300 ring-1 ring-ember-400/60">
              +{c.commander.tax}
            </span>
          )}
        </div>
      ))}
      {/* comandante fora da zona de comando: placeholder mostrando onde está */}
      {all
        .filter((c) => !cards.some((x) => x.name === c.name))
        .map((c) => (
          <div
            key={c.name}
            className={cx('flex aspect-[63/88] items-center justify-center rounded-md border border-dashed border-amber-400/30 text-center text-[8px] leading-tight text-amber-200/60', w)}
            title={`${c.name} está no campo de batalha`}
            onMouseEnter={() => setHovered(c.id)}
            onMouseLeave={() => setHovered(undefined)}
          >
            em jogo
          </div>
        ))}
      {emblems.map((e) => (
        <span key={e.id} className="rounded bg-purple-500/25 px-1.5 py-0.5 text-[10px] text-purple-100" title={e.rules.join('\n')}>
          {e.name}
        </span>
      ))}
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
