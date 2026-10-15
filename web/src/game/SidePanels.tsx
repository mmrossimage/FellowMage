import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { cx, rulesToHtml, sanitizeHtml } from '../util';
import { CardFace } from './CardFace';
import { HIGHLIGHT_CLASS, highlightFor, useObjectClick } from './interaction';

/** A pilha: o objeto do topo fica em cima, maior. */
export function StackPanel() {
  const stack = useStore((s) => s.game?.stack ?? []);
  const game = useStore((s) => s.game);
  const prompt = useStore((s) => s.prompt);
  const waiting = useStore((s) => s.waiting);
  const setHovered = useStore((s) => s.setHovered);
  const onClick = useObjectClick();
  const items = [...stack].reverse(); // XMage envia do fundo para o topo

  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.section
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          className="rounded-xl border border-white/10 bg-ink-900/80 p-3 shadow-panel backdrop-blur"
        >
          <h3 className="mb-2 flex items-center justify-between font-display text-xs uppercase tracking-[0.2em] text-white/60">
            Pilha <span className="rounded-full bg-white/10 px-2 text-white">{items.length}</span>
          </h3>
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {items.map((c, i) => {
                const hl = highlightFor(c, game, prompt, waiting);
                return (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, x: -40 }}
                    data-obj={c.id}
                    className={cx('flex gap-2 rounded-lg bg-black/30 p-1.5', i === 0 && 'ring-1 ring-ember-400/50', hl === 'target' && 'cursor-pointer')}
                    onMouseEnter={() => setHovered(c.id)}
                    onMouseLeave={() => setHovered(undefined)}
                    onClick={() => onClick(c.id)}
                  >
                    <CardFace card={c} size="small" overlays={false} className={cx('w-14 shrink-0', hl && HIGHLIGHT_CLASS[hl])} />
                    <div className="min-w-0 text-xs">
                      <div className="truncate font-semibold text-white">{c.ability ? c.sourceName ?? c.name : c.name}</div>
                      <div className="line-clamp-3 text-white/60" dangerouslySetInnerHTML={{ __html: rulesToHtml(c.rules[0] ?? c.type) }} />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

/** Histórico da partida (mensagens do servidor). */
export function LogPanel() {
  const log = useStore((s) => s.log);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [log.length]);

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-ink-900/70 shadow-panel backdrop-blur">
      <h3 className="border-b border-white/10 px-3 py-2 font-display text-xs uppercase tracking-[0.2em] text-white/60">Histórico</h3>
      <div ref={ref} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-[12px] leading-snug">
        {log.map((l) => (
          <p
            key={l.id}
            className={cx(
              l.kind === 'error' && 'text-blood-400',
              l.kind === 'system' && 'text-ember-300',
              l.kind === 'chat' && 'text-arcane-300',
              l.kind === 'game' && 'text-white/75',
            )}
          >
            {l.turnInfo && <span className="mr-1 text-white/35">{l.turnInfo}</span>}
            <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(l.html) }} />
          </p>
        ))}
      </div>
    </section>
  );
}
