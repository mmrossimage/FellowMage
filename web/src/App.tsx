import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { UserRequestDialog } from './components/UserRequestDialog';
import { DeckBuildScreen } from './deck/DeckBuildScreen';
import { GameBoard } from './game/GameBoard';
import { WaitingRoom } from './lobby/WaitingRoom';
import { ConnectScreen } from './screens/ConnectScreen';
import { Shell } from './screens/Shell';
import { useStore } from './store';
import { cx } from './util';

export default function App() {
  const status = useStore((s) => s.status);
  const inTable = useStore((s) => !!s.table);
  const hasDeckBuild = useStore((s) => !!s.deckBuild);
  return (
    <div className="h-full w-full">
      {status === 'playing' ? (
        <GameBoard />
      ) : status === 'online' && inTable ? (
        <WaitingRoom />
      ) : status === 'online' || status === 'starting' ? (
        <Shell />
      ) : (
        <ConnectScreen />
      )}
      {hasDeckBuild && <DeckBuildScreen />}
      <UserRequestDialog />
      <Toast />
    </div>
  );
}

function Toast() {
  const toast = useStore((s) => s.toast);
  const dismiss = useStore((s) => s.dismissToast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, 6000);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          onClick={dismiss}
          className={cx(
            'fixed left-1/2 top-4 z-[70] max-w-xl -translate-x-1/2 cursor-pointer whitespace-pre-line rounded-xl px-5 py-3 text-sm shadow-panel backdrop-blur',
            toast.tone === 'error' ? 'bg-blood-500/90 text-white' : 'bg-ink-800/95 text-white ring-1 ring-white/10',
          )}
        >
          {toast.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
