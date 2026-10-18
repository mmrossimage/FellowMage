import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
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
  const mode = useStore((s) => s.mode);
  const sendChat = useStore((s) => s.sendChat);
  const [tab, setTab] = useState<'all' | 'chat'>('all');
  const [text, setText] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const chatCount = log.filter((l) => l.kind === 'chat').length;
  // aviso de mensagem nova enquanto a aba "Chat" está fechada
  const [seenChat, setSeenChat] = useState(0);
  useEffect(() => {
    if (tab === 'chat') setSeenChat(chatCount);
  }, [tab, chatCount]);
  const shown = tab === 'chat' ? log.filter((l) => l.kind === 'chat') : log;
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [shown.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    sendChat('game', t);
    setText('');
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-ink-900/70 shadow-panel backdrop-blur">
      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
        {(
          [
            ['all', 'Histórico'],
            ['chat', 'Chat'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cx(
              'relative rounded-md px-2 py-1 font-display text-xs uppercase tracking-[0.2em] transition',
              tab === id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80',
            )}
          >
            {label}
            {id === 'chat' && tab !== 'chat' && chatCount > seenChat && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-arcane-400" title="Mensagem nova" />
            )}
          </button>
        ))}
      </div>
      <div ref={ref} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-[12px] leading-snug">
        {tab === 'chat' && shown.length === 0 && <p className="text-white/35">Nenhuma mensagem dos jogadores ainda.</p>}
        {shown.map((l) => (
          <p
            key={l.id}
            className={cx(
              l.kind === 'error' && 'text-blood-400',
              l.kind === 'system' && 'text-ember-300',
              l.kind === 'chat' && 'text-arcane-300',
              l.kind === 'game' && 'text-white/75',
            )}
          >
            {l.turnInfo && tab === 'all' && <span className="mr-1 text-white/35">{l.turnInfo}</span>}
            {l.user && <b className="mr-1">{l.user}:</b>}
            <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(l.html) }} />
          </p>
        ))}
      </div>
      {mode === 'online' && (
        <form onSubmit={submit} className="flex gap-1.5 border-t border-white/10 p-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Mensagem para a mesa…"
            className="input py-1.5 text-xs"
            maxLength={500}
          />
          <button className="shrink-0 rounded-lg bg-white/10 px-2.5 text-xs text-white ring-1 ring-white/15 hover:bg-white/20">Enviar</button>
        </form>
      )}
    </section>
  );
}
