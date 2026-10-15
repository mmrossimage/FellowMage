import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useStore } from '../store';
import type { Stops } from '../types';
import { PHASE_TRACK, cx, type TrackStep } from '../util';

/**
 * Trilha do turno com todos os passos (Desvirar, Manutenção, Compra, ..., Limpeza).
 * O ponto embaixo de cada passo indica uma "parada": clicar liga/desliga a parada
 * para o contexto atual (seu turno ou turno dos oponentes).
 */
export function PhaseTracker() {
  const game = useStore((s) => s.game);
  const stops = useStore((s) => s.stops);
  const toggleStop = useStore((s) => s.toggleStop);
  const [panel, setPanel] = useState(false);
  if (!game) return null;

  const myTurn = game.players.find((p) => p.me)?.id === game.activePlayerId;
  const context: keyof Stops = myTurn ? 'yourTurn' : 'opponentTurn';
  const isCurrent = (s: TrackStep) => s.steps.includes(game.step ?? '');

  return (
    <div className="relative flex items-center gap-3">
      <div className="w-32 text-right leading-tight">
        <div className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Turno {game.turn}</div>
        <div className={cx('truncate text-sm font-semibold', myTurn ? 'text-ember-300' : 'text-arcane-300')}>
          {myTurn ? 'Seu turno' : game.activePlayerName}
        </div>
      </div>

      <div className="flex items-stretch gap-1.5 rounded-2xl bg-black/40 px-2 py-1 ring-1 ring-white/10">
        {PHASE_TRACK.map((phase) => {
          const phaseActive = phase.steps.some(isCurrent);
          return (
            <div key={phase.key} className={cx('flex flex-col items-center rounded-xl px-1 pb-0.5 transition', phaseActive && 'bg-white/5')}>
              <span className={cx('text-[9px] font-semibold uppercase tracking-[0.15em]', phaseActive ? 'text-white/80' : 'text-white/35')}>
                {phase.label}
              </span>
              <div className="flex gap-0.5">
                {phase.steps.map((s) => (
                  <StepChip
                    key={s.short + s.label}
                    step={s}
                    current={isCurrent(s)}
                    myTurn={myTurn}
                    stopOn={s.stop && stops ? stops[context][s.stop] : undefined}
                    onToggle={s.stop && stops ? () => toggleStop(context, s.stop!) : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setPanel(!panel)}
        className={cx('rounded-lg px-2 py-1 text-xs ring-1 transition', panel ? 'bg-white/15 text-white ring-white/30' : 'text-white/60 ring-white/10 hover:text-white')}
        title="Configurar paradas de prioridade"
      >
        Paradas
      </button>

      <AnimatePresence>{panel && stops && <StopsPanel stops={stops} onClose={() => setPanel(false)} />}</AnimatePresence>
    </div>
  );
}

function StepChip({
  step,
  current,
  myTurn,
  stopOn,
  onToggle,
}: {
  step: TrackStep;
  current: boolean;
  myTurn: boolean;
  stopOn?: boolean;
  onToggle?: () => void;
}) {
  const title =
    `${step.label}` +
    (onToggle ? ` — parada ${stopOn ? 'LIGADA' : 'desligada'} (${myTurn ? 'seu turno' : 'turno dos oponentes'}). Clique para alternar.` : step.note ? ` — ${step.note}` : '');
  return (
    <button
      onClick={onToggle}
      disabled={!onToggle}
      title={title}
      className={cx('relative flex flex-col items-center px-1.5 pt-0.5 text-[11px] leading-tight', onToggle ? 'cursor-pointer' : 'cursor-default')}
    >
      {current && (
        <motion.span
          layoutId="step-pill"
          className={cx('absolute inset-0 rounded-lg', myTurn ? 'bg-ember-500/85' : 'bg-arcane-600/85')}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        />
      )}
      <span className={cx('relative font-medium', current ? 'text-white' : 'text-white/55')}>{step.short}</span>
      <span
        className={cx(
          'relative mt-0.5 h-1.5 w-1.5 rounded-full transition',
          stopOn === undefined ? 'bg-transparent' : stopOn ? 'bg-ember-300 shadow-[0_0_6px_rgba(255,209,138,.9)]' : 'bg-white/15',
        )}
      />
    </button>
  );
}

function StopsPanel({ stops, onClose }: { stops: Stops; onClose: () => void }) {
  const toggleStop = useStore((s) => s.toggleStop);
  const stoppable = PHASE_TRACK.flatMap((p) => p.steps).filter((s) => s.stop);
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="absolute left-1/2 top-full z-50 mt-2 w-[520px] -translate-x-1/2 rounded-xl border border-white/10 bg-ink-900/95 p-4 shadow-panel backdrop-blur"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display text-sm text-white">Paradas de prioridade</span>
        <button onClick={onClose} className="text-white/50 hover:text-white">✕</button>
      </div>
      <p className="mb-3 text-xs text-white/55">
        Em passos sem parada o jogo passa a prioridade automaticamente, a menos que algo entre na pilha. Atacantes e bloqueadores sempre
        param quando há algo a declarar.
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-white/50">
            <th className="pb-1 text-left font-normal">Passo</th>
            <th className="pb-1 font-normal">Seu turno</th>
            <th className="pb-1 font-normal">Turno dos oponentes</th>
          </tr>
        </thead>
        <tbody>
          {stoppable.map((s) => (
            <tr key={s.stop} className="border-t border-white/5">
              <td className="py-1.5 text-white/85">{s.label}</td>
              {(['yourTurn', 'opponentTurn'] as const).map((turn) => (
                <td key={turn} className="text-center">
                  <input type="checkbox" checked={stops[turn][s.stop!]} onChange={() => toggleStop(turn, s.stop!)} className="h-4 w-4 accent-amber-400" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}
