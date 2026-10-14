import { motion } from 'framer-motion';
import { useStore } from '../store';
import { PHASE_TRACK, STEP_LABEL, cx } from '../util';

export function PhaseTracker() {
  const game = useStore((s) => s.game);
  if (!game) return null;
  const myTurn = game.players.find((p) => p.me)?.id === game.activePlayerId;
  const current = PHASE_TRACK.findIndex((p) => p.steps.includes(game.step ?? ''));

  return (
    <div className="flex items-center gap-3">
      <div className="text-right leading-tight">
        <div className="font-display text-xs uppercase tracking-[0.2em] text-white/50">Turno {game.turn}</div>
        <div className={cx('text-sm font-semibold', myTurn ? 'text-ember-300' : 'text-arcane-300')}>
          {myTurn ? 'Seu turno' : `Turno de ${game.activePlayerName}`}
        </div>
      </div>
      <div className="flex items-center gap-1 rounded-full bg-black/40 p-1 ring-1 ring-white/10">
        {PHASE_TRACK.map((p, i) => (
          <div key={p.key} className="relative px-3 py-1 text-xs">
            {i === current && (
              <motion.div
                layoutId="phase-pill"
                className={cx('absolute inset-0 rounded-full', myTurn ? 'bg-ember-500/80' : 'bg-arcane-600/80')}
                transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              />
            )}
            <span className={cx('relative font-medium', i === current ? 'text-white' : 'text-white/45')}>{p.short}</span>
          </div>
        ))}
      </div>
      {/* passo detalhado só quando a fase tem vários passos (início, combate, final) */}
      <div className="w-36 text-xs italic text-white/50">
        {current >= 0 && PHASE_TRACK[current].steps.length > 1 && game.step ? STEP_LABEL[game.step] ?? game.step : ''}
      </div>
    </div>
  );
}
