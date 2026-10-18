import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { CardArt } from '../components/CardArt';
import { useStore } from '../store';

/** Mãos de outros jogadores liberadas por permissão (ou vistas como espectador). */
export function VisibleHands() {
  const hands = useStore((s) => s.game?.visibleHands);
  const [open, setOpen] = useState(false);
  const entries = Object.entries(hands ?? {});
  if (!entries.length) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg px-3 py-1.5 text-xs text-arcane-300 ring-1 ring-arcane-400/40 hover:bg-arcane-400/10"
        title="Mãos que você tem permissão para ver"
      >
        ✋ Mãos ({entries.length})
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[62] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-[min(900px,94vw)] overflow-y-auto rounded-2xl border border-white/10 bg-ink-900/95 p-5 shadow-panel">
              {entries.map(([name, cards]) => (
                <div key={name} className="mb-4 last:mb-0">
                  <div className="mb-2 font-display text-lg font-bold text-white">
                    Mão de {name} <span className="text-sm font-normal text-white/50">({cards.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cards.map((c) => (
                      <CardArt key={c.id} card={{ name: '', set: c.set, num: c.num }} className="w-32" />
                    ))}
                    {!cards.length && <span className="text-sm text-white/40">Sem cartas.</span>}
                  </div>
                </div>
              ))}
              <div className="mt-2 text-right">
                <button onClick={() => setOpen(false)} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">
                  Fechar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
