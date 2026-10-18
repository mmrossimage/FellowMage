import { AnimatePresence, motion } from 'framer-motion';
import { promptHtml } from '../i18n';
import { useStore } from '../store';
import { cx } from '../util';

/**
 * Pedidos do servidor com botões (USER_REQUEST_DIALOG): outro jogador quer voltar turnos ou ver
 * sua mão, confirmação de conceder etc. Equivale ao UserRequestDialog do cliente oficial.
 */
export function UserRequestDialog() {
  const req = useStore((s) => s.userRequests[0]);
  const reply = useStore((s) => s.userReply);
  return (
    <AnimatePresence>
      {req && (
        <motion.div
          key={req.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.92, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            className="w-[min(460px,92vw)] rounded-2xl border border-ember-400/40 bg-ink-900/95 p-6 shadow-panel"
          >
            <div className="font-display text-xl font-bold text-ember-300">{req.title}</div>
            <div className="mt-3 text-sm text-white/80" dangerouslySetInnerHTML={{ __html: promptHtml(req.message) }} />
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {req.buttons.map((b, i) => (
                <button
                  key={b.text}
                  onClick={() => reply(req.id, b.action)}
                  className={cx(
                    'rounded-xl px-5 py-2.5 text-sm font-semibold transition active:scale-[0.98]',
                    i === 0 ? 'bg-gradient-to-b from-ember-400 to-ember-500 text-ink-950 hover:brightness-110' : 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20',
                  )}
                >
                  {b.text}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
