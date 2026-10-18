import { useEffect, useRef, useState } from 'react';
import type { ChatLine } from '../store';
import { cx, sanitizeHtml } from '../util';

/** Chat do lobby (sala geral ou mesa): mensagens do servidor XMage e campo para escrever. */
export function ChatBox({
  title,
  lines,
  onSend,
  placeholder = 'Escreva uma mensagem…',
  className,
  prefill,
}: {
  title?: string;
  lines: ChatLine[];
  onSend: (text: string) => void;
  placeholder?: string;
  className?: string;
  /** texto a colocar no campo (ex.: "\w nome " para cochichar); key muda a cada pedido */
  prefill?: { text: string; key: number };
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!prefill) return;
    setText(prefill.text);
    input.current?.focus();
  }, [prefill]);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  return (
    <section className={cx('flex min-h-0 flex-col rounded-xl border border-white/10 bg-ink-900/70 shadow-panel', className)}>
      {title && <h3 className="border-b border-white/10 px-3 py-2 font-display text-xs uppercase tracking-[0.2em] text-white/60">{title}</h3>}
      <div ref={ref} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-[13px] leading-snug">
        {lines.length === 0 && <p className="text-white/35">Nenhuma mensagem ainda.</p>}
        {lines.map((l) => (
          <p key={l.id} className={cx(l.type.startsWith('WHISPER') ? 'italic text-arcane-300' : l.type === 'TALK' ? 'text-white/85' : 'text-ember-300/80')}>
            {l.user && <b className="mr-1 text-arcane-300">{l.user}:</b>}
            <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(l.html) }} />
          </p>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-2">
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="input" maxLength={500} />
        <button className="shrink-0 rounded-lg bg-white/10 px-3 text-sm text-white ring-1 ring-white/15 hover:bg-white/20">Enviar</button>
      </form>
    </section>
  );
}
