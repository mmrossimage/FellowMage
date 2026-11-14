import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cardImageUrls } from '../cardImage';
import { useStore } from '../store';
import type { CatalogCard, DeckSummary, MoxfieldMissing } from '../types';
import { cx } from '../util';

/**
 * Cartas de um deck do Moxfield que o XMage ainda não implementa: mostra quais ficaram de fora
 * e deixa escolher um substituto do catálogo (guardado no vínculo e reaplicado a cada sincronização).
 */
export function MoxfieldMissingDialog({ deck, onClose }: { deck: DeckSummary; onClose: () => void }) {
  const link = deck.moxfield!;
  const send = useStore((s) => s.send);
  const [picking, setPicking] = useState<string>();

  const choose = (missing: MoxfieldMissing, card: CatalogCard | null) => {
    send({
      t: 'setMoxfieldSubstitute',
      path: deck.path,
      card: missing.name,
      substitute: card ? { name: card.name, set: card.set, num: card.num } : null,
    });
    setPicking(undefined);
  };

  // o card do deck tem transform (hover); o diálogo vai para o body para o "fixed" cobrir a tela
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
    >
      <motion.div
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        className="max-h-[90vh] w-[min(640px,96vw)] overflow-y-auto rounded-2xl border border-white/10 bg-ink-900/95 p-6 shadow-panel"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold text-ember-300">Cartas fora do XMage</h2>
            <p className="mt-1 truncate text-sm text-white/50">{deck.name}</p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white">
            ✕
          </button>
        </div>

        {link.error && (
          <p className="mt-4 rounded-lg bg-blood-500/20 px-3 py-2 text-sm text-white/80">
            ⚠ Última consulta ao Moxfield falhou: {link.error}
          </p>
        )}

        {link.missing.length === 0 ? (
          <p className="mt-4 text-sm text-white/60">Todas as cartas do deck existem no XMage.</p>
        ) : (
          <>
            <p className="mt-4 text-sm text-white/60">
              Estas cartas do Moxfield ainda não foram implementadas no XMage e ficaram fora do deck. Escolha um
              substituto para jogar com {link.missing.length > 1 ? 'elas' : 'ela'}; a troca continua valendo nas próximas
              atualizações do Moxfield.
            </p>
            <ul className="mt-4 space-y-3">
              {link.missing.map((m) => (
                <li key={m.name} className="rounded-xl bg-black/30 p-3 ring-1 ring-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">
                        {m.qty > 1 && <span className="text-white/50">{m.qty}× </span>}
                        {m.name}
                      </div>
                      <div className="truncate text-xs text-white/50">
                        {m.substitute ? (
                          <>
                            substituída por <span className="text-ember-300">{m.substitute.name}</span>
                          </>
                        ) : (
                          'não incluída no deck'
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => setPicking(picking === m.name ? undefined : m.name)}
                        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 hover:bg-white/20"
                      >
                        {picking === m.name ? 'Cancelar' : m.substitute ? 'Trocar' : 'Escolher substituto'}
                      </button>
                      {m.substitute && (
                        <button
                          onClick={() => choose(m, null)}
                          className="rounded-lg bg-white/5 px-2 py-1.5 text-xs text-white/60 hover:bg-blood-500/60 hover:text-white"
                          title="Remover o substituto (a carta volta a ficar fora do deck)"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                  {picking === m.name && (
                    <SubstitutePicker identity={deck.commanders?.length ? deck.identity : undefined} onPick={(c) => choose(m, c)} />
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/** Busca no catálogo do XMage, por padrão dentro da identidade de cor do comandante. */
function SubstitutePicker({ identity, onPick }: { identity?: string[]; onPick: (card: CatalogCard) => void }) {
  const request = useStore((s) => s.request);
  const [text, setText] = useState('');
  const [inIdentity, setInIdentity] = useState(true);
  const [results, setResults] = useState<CatalogCard[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const query: Record<string, unknown> = { text: q, sort: 'name', offset: 0, limit: 12 };
      if (identity && inIdentity) query.identity = identity;
      const r = await request({ t: 'searchCards', query }, 'cards');
      if (my === seq.current) setResults(r.result.cards);
    }, 250);
    return () => clearTimeout(t);
  }, [text, inIdentity, identity, request]);

  return (
    <div className="mt-3">
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar carta pelo nome ou texto…" className="input" />
      {identity && (
        <label className="mt-2 flex items-center gap-2 text-xs text-white/60">
          <input type="checkbox" checked={inIdentity} onChange={(e) => setInIdentity(e.target.checked)} className="accent-ember-400" />
          Só cartas na identidade de cor do comandante
        </label>
      )}
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {results.map((c) => {
          const art = cardImageUrls({ name: c.name, set: c.set, num: c.num }, 'art_crop')[0];
          return (
            <button
              key={c.name}
              onClick={() => onPick(c)}
              title={`${c.name} ${c.cost}\n${c.type}\n\n${c.rules.join('\n')}`}
              className={cx('overflow-hidden rounded-lg text-left ring-2 ring-transparent transition hover:ring-ember-400')}
            >
              <div className="aspect-[4/3] bg-black/40 bg-cover bg-center" style={{ backgroundImage: art ? `url("${art}")` : undefined }} />
              <div className="truncate bg-black/50 px-1.5 py-1 text-[11px] text-white/80">{c.name}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
