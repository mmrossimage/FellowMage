import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useStore } from '../store';
import { ActionBar } from './ActionBar';
import { Battlefield } from './Battlefield';
import { CardPreview } from './CardPreview';
import { PromptDialogs } from './Dialogs';
import { Hand, OpponentHand } from './Hand';
import { PhaseTracker } from './PhaseTracker';
import { PlayerBadge } from './PlayerBadge';
import { LogPanel, StackPanel } from './SidePanels';

export function GameBoard() {
  const game = useStore((s) => s.game);
  const send = useStore((s) => s.send);
  const result = useStore((s) => s.result);

  if (!game) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse font-display text-xl text-white/70">Embaralhando os grimórios…</div>
      </div>
    );
  }

  const me = game.players.find((p) => p.me) ?? game.players[0];
  const opponent = game.players.find((p) => p.id !== me.id);

  return (
    <LayoutGroup>
      <div className="table-bg relative grid h-full grid-cols-[1fr_minmax(240px,19vw)] grid-rows-[auto_minmax(0,1fr)] overflow-clip">
        {/* topo */}
        <header className="col-span-2 flex items-center justify-between gap-4 border-b border-white/5 bg-black/30 px-5 py-2 backdrop-blur">
          <span className="font-display text-lg font-bold tracking-wider text-ember-300">FellowMage</span>
          <PhaseTracker />
          <button
            onClick={() => confirm('Conceder a partida?') && send({ t: 'concede' })}
            className="rounded-lg px-3 py-1.5 text-xs text-white/60 ring-1 ring-white/10 hover:bg-blood-500/20 hover:text-blood-400"
          >
            Conceder
          </button>
        </header>

        {/* mesa */}
        <main className="relative grid min-h-0 grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] overflow-clip">
          {opponent && (
            <div className="relative flex items-start justify-between px-6 pt-3">
              <PlayerBadge player={opponent} align="top" />
              <div className="absolute left-1/2 top-0 -translate-x-1/2">
                <OpponentHand count={opponent.handCount} />
              </div>
              <div />
            </div>
          )}
          <section className="min-h-0">{opponent && <Battlefield player={opponent} mirrored />}</section>
          <section className="relative min-h-0">
            <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-gradient-to-r from-transparent via-ember-300/40 to-transparent" />
            <Battlefield player={me} mirrored={false} />
          </section>
          <div className="relative grid min-h-[calc(var(--hand-w)*0.8)] grid-cols-[minmax(220px,auto)_1fr_auto] items-end gap-4 px-6 pb-4">
            <div className="relative z-30">
              <PlayerBadge player={me} align="bottom" />
            </div>
            <div className="relative h-full min-w-0">
              <Hand />
            </div>
            <div className="relative z-30">
              <ActionBar />
            </div>
          </div>
        </main>

        {/* lateral */}
        <aside className="flex min-h-0 flex-col gap-3 border-l border-white/5 bg-black/20 p-3">
          <StackPanel />
          <LogPanel />
        </aside>

        <CardPreview />
        <PromptDialogs />
        <AnimatePresence>{result && <ResultOverlay />}</AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

function ResultOverlay() {
  const result = useStore((s) => s.result)!;
  const leaveGame = useStore((s) => s.leaveGame);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur">
      <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="text-center">
        <div className={`font-display text-6xl font-bold ${result.won ? 'text-ember-300' : 'text-blood-400'}`}>{result.won ? 'Vitória' : 'Derrota'}</div>
        <p className="mt-3 text-white/70">{result.title}</p>
        <p className="text-white/50">{result.info}</p>
        <button onClick={leaveGame} className="mt-8 rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 px-8 py-3 font-display font-bold uppercase tracking-wider text-ink-950">
          Voltar ao lobby
        </button>
      </motion.div>
    </motion.div>
  );
}
