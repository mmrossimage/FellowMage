import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { CardArt } from '../components/CardArt';
import { useStore } from '../store';
import type { CatalogCard, DecklistImport, EditorDeck } from '../types';
import { cx, rulesToHtml } from '../util';
import { DeckPanel } from './DeckPanel';
import { allowsMultiple, cardKey, commanderIdentity, exportText, validate } from './deckRules';
import { SearchPanel } from './SearchPanel';

const EMPTY: EditorDeck = { path: null, name: 'Novo deck', commanders: [], cards: [] };

export function DeckEditor() {
  const editor = useStore((s) => s.editor);
  const request = useStore((s) => s.request);
  const navigate = useStore((s) => s.navigate);
  const refreshUserDecks = useStore((s) => s.refreshUserDecks);
  const send = useStore((s) => s.send);

  const [deck, setDeck] = useState<EditorDeck>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<CatalogCard>();
  const [artFor, setArtFor] = useState<{ card: CatalogCard; commander: boolean }>();
  const [dialog, setDialog] = useState<'import' | 'export' | null>(null);
  const [importReport, setImportReport] = useState<DecklistImport>();
  const [message, setMessage] = useState<string>();

  // abrir: deck existente, deck novo, ou deck novo a partir de uma lista colada
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setHover(undefined);
      setImportReport(undefined);
      if (editor?.path) {
        const r = await request({ t: 'loadDeck', path: editor.path }, 'deck');
        if (!cancelled) setDeck(r.deck);
      } else if (editor?.importText) {
        const r = await request({ t: 'importDecklist', text: editor.importText }, 'decklist');
        if (!cancelled) {
          setDeck({ ...EMPTY, name: 'Deck importado', commanders: r.result.commanders, cards: mergeDuplicates(r.result.cards) });
          setImportReport(r.result);
          setDirty(true);
        }
      } else {
        setDeck(EMPTY);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [editor?.path, editor?.importText, request]);

  const { problems, offIdentity, duplicates } = useMemo(() => validate(deck), [deck]);
  const inDeck = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of [...deck.commanders, ...deck.cards]) m.set(cardKey(c), (m.get(cardKey(c)) ?? 0) + (c.qty ?? 1));
    return m;
  }, [deck]);
  const identity = deck.commanders.length ? commanderIdentity(deck) : null;
  const readOnly = !!deck.readOnly;

  const update = (fn: (d: EditorDeck) => EditorDeck) => {
    setDeck((d) => fn(d));
    setDirty(true);
  };

  const add = (c: CatalogCard) =>
    update((d) => {
      const i = d.cards.findIndex((x) => cardKey(x) === cardKey(c));
      if (i >= 0) {
        // singleton: só básicos e afins ganham cópias extras
        if (!allowsMultiple(d.cards[i])) {
          flash(`${c.name} já está no deck (Commander é singleton).`);
          return d;
        }
        return { ...d, cards: d.cards.map((x, j) => (j === i ? { ...x, qty: (x.qty ?? 1) + 1 } : x)) };
      }
      return { ...d, cards: [...d.cards, { ...c, qty: 1 }] };
    });

  const changeQty = (c: CatalogCard, delta: number) => {
    if (delta > 0 && !allowsMultiple(c)) {
      flash(`${c.name}: só 1 cópia (Commander é singleton).`);
      return;
    }
    update((d) => ({
      ...d,
      cards: d.cards.map((x) => (x === c ? { ...x, qty: (x.qty ?? 1) + delta } : x)).filter((x) => (x.qty ?? 1) > 0),
    }));
  };

  const setCommander = (c: CatalogCard) =>
    update((d) => {
      if (d.commanders.some((x) => cardKey(x) === cardKey(c))) return d;
      const partner = (x: CatalogCard) => x.rules.some((r) => /partner|friends forever|choose a background/i.test(r));
      // um segundo comandante só se ambos tiverem Parceiro; senão substitui
      const keep = d.commanders.length === 1 && partner(d.commanders[0]) && partner(c) ? d.commanders : [];
      return { ...d, commanders: [...keep, { ...c, qty: 1 }], cards: d.cards.filter((x) => cardKey(x) !== cardKey(c)) };
    });

  const save = async (asCopy = false) => {
    // exemplos do XMage são somente leitura: salvar cria uma cópia em "Meus decks"
    const path = readOnly || asCopy ? null : deck.path ?? null;
    const r = await request({ t: 'saveDeck', path, deck }, 'deckSaved');
    setDeck((d) => ({ ...d, path: r.path, readOnly: false }));
    setDirty(false);
    refreshUserDecks();
    flash('Deck salvo em ' + r.path);
    return r.path;
  };

  const play = async () => {
    const path = dirty || readOnly || !deck.path ? await save() : deck.path!;
    navigate('play', { playDeck: path });
  };

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage((m) => (m === text ? undefined : m)), 3500);
  };

  if (loading) return <div className="flex h-full items-center justify-center text-white/60">Abrindo deck…</div>;

  return (
    <div className="flex h-full flex-col">
      {/* cabeçalho */}
      <header className="flex items-center gap-3 border-b border-white/5 bg-black/20 px-5 py-3">
        <button
          onClick={() => (!dirty || confirm('Sair sem salvar as alterações?')) && navigate('decks')}
          className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
          title="Voltar"
        >
          ←
        </button>
        <input
          value={deck.name}
          disabled={readOnly}
          onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
          className="min-w-0 flex-1 bg-transparent font-display text-2xl font-bold text-white outline-none disabled:opacity-80"
        />
        {readOnly && <span className="rounded bg-white/10 px-2 py-1 text-xs text-white/60">exemplo do XMage (somente leitura)</span>}
        {deck.moxfieldUrl && deck.path && (
          <span
            className="flex items-center gap-2 rounded bg-white/10 px-2 py-1 text-xs text-white/60"
            title="Alterações feitas aqui são substituídas quando o deck mudar no Moxfield"
          >
            <a href={deck.moxfieldUrl} target="_blank" rel="noreferrer" className="hover:text-white">
              sincronizado com o Moxfield ↗
            </a>
            <button
              onClick={() => {
                if (!confirm('Parar de sincronizar este deck com o Moxfield? O deck continua em "Meus decks".')) return;
                send({ t: 'unlinkMoxfield', path: deck.path });
                setDeck((d) => ({ ...d, moxfieldUrl: undefined }));
              }}
              className="text-white/40 hover:text-blood-400"
              title="Desvincular do Moxfield"
            >
              ✕
            </button>
          </span>
        )}
        {dirty && !readOnly && <span className="text-xs text-ember-300">● não salvo</span>}
        <HeaderBtn onClick={() => setDialog('import')} disabled={readOnly}>Importar</HeaderBtn>
        <HeaderBtn onClick={() => setDialog('export')}>Exportar</HeaderBtn>
        {readOnly ? (
          <HeaderBtn primary onClick={() => save(true)}>Salvar cópia</HeaderBtn>
        ) : (
          <HeaderBtn primary onClick={() => save()} disabled={!dirty && !!deck.path}>Salvar</HeaderBtn>
        )}
        <HeaderBtn primary onClick={play}>Jogar ⚔️</HeaderBtn>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_minmax(340px,26vw)]">
        <div className="relative min-h-0 border-r border-white/5">
          <SearchPanel identity={identity} inDeck={inDeck} onAdd={add} onCommander={setCommander} onHover={setHover} readOnly={readOnly} />
        </div>
        <div className="relative min-h-0 bg-black/20">
          <DeckPanel
            deck={deck}
            problems={problems}
            offIdentity={offIdentity}
            duplicates={duplicates}
            readOnly={readOnly}
            onQty={changeQty}
            onRemoveCommander={(c) => update((d) => ({ ...d, commanders: d.commanders.filter((x) => x !== c) }))}
            onHover={setHover}
            onPickArt={(card, commander) => setArtFor({ card, commander })}
          />
        </div>
      </div>

      <Preview card={hover} />

      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-ink-800/95 px-5 py-2.5 text-sm text-white shadow-panel ring-1 ring-white/10"
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>

      {importReport && importReport.unresolved.length > 0 && (
        <div className="fixed bottom-6 right-6 z-40 max-w-sm rounded-xl bg-ink-900/95 p-4 text-sm shadow-panel ring-1 ring-ember-400/40">
          <div className="mb-1 flex items-center justify-between font-semibold text-ember-300">
            {importReport.unresolved.length} linha(s) não reconhecida(s)
            <button onClick={() => setImportReport(undefined)} className="text-white/50 hover:text-white">✕</button>
          </div>
          <ul className="max-h-40 overflow-y-auto text-xs text-white/70">
            {importReport.unresolved.map((l, i) => (
              <li key={i}>• {l}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-white/45">Cartas que o XMage ainda não implementa ou nomes escritos de outro jeito.</p>
        </div>
      )}

      {artFor && (
        <ArtPicker
          card={artFor.card}
          onClose={() => setArtFor(undefined)}
          onPick={(set, num) => {
            const swap = (x: CatalogCard) => (x === artFor.card ? { ...x, set, num } : x);
            update((d) => (artFor.commander ? { ...d, commanders: d.commanders.map(swap) } : { ...d, cards: d.cards.map(swap) }));
            setArtFor(undefined);
          }}
        />
      )}

      {dialog === 'export' && <ExportDialog text={exportText(deck)} onClose={() => setDialog(null)} />}
      {dialog === 'import' && (
        <ImportDialog
          onClose={() => setDialog(null)}
          onImported={(r, mode) => {
            update((d) =>
              mode === 'replace'
                ? { ...d, commanders: r.commanders.length ? r.commanders : d.commanders, cards: mergeDuplicates(r.cards) }
                : { ...d, commanders: d.commanders.length ? d.commanders : r.commanders, cards: mergeDuplicates([...d.cards, ...r.cards]) },
            );
            setImportReport(r);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

/** Junta linhas da mesma carta (ex.: importação com a mesma carta em duas linhas). */
function mergeDuplicates(cards: CatalogCard[]): CatalogCard[] {
  const map = new Map<string, CatalogCard>();
  for (const c of cards) {
    const k = cardKey(c);
    const prev = map.get(k);
    map.set(k, prev ? { ...prev, qty: (prev.qty ?? 1) + (c.qty ?? 1) } : { ...c });
  }
  return [...map.values()];
}

function HeaderBtn({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-40',
        primary ? 'bg-gradient-to-b from-ember-400 to-ember-500 text-ink-950 hover:brightness-110' : 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20',
      )}
    >
      {children}
    </button>
  );
}

/** Carta ampliada com o texto de regras, ao passar o mouse na busca ou na lista. */
function Preview({ card }: { card?: CatalogCard }) {
  return (
    <AnimatePresence>
      {card && (
        <motion.aside
          key={card.name + card.set + card.num}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          className="pointer-events-none fixed right-[calc(max(340px,26vw)+16px)] top-24 z-40 w-[260px]"
        >
          <CardArt card={card} size="large" className="shadow-[0_20px_60px_rgba(0,0,0,.8)]" />
          <div className="mt-2 rounded-xl bg-ink-900/95 p-3 text-xs leading-relaxed text-white/85 ring-1 ring-white/10">
            <div className="mb-1 font-semibold text-white">{card.type}</div>
            {card.rules.slice(0, 6).map((r, i) => (
              <p key={i} className="mb-1" dangerouslySetInnerHTML={{ __html: rulesToHtml(r, card.name) }} />
            ))}
            {card.unknown && <p className="text-blood-400">O XMage não conhece esta carta.</p>}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className={cx('max-h-[85vh] w-full overflow-auto rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-panel', wide ? 'max-w-5xl' : 'max-w-2xl')}
      >
        {children}
      </motion.div>
    </div>
  );
}

function ArtPicker({ card, onClose, onPick }: { card: CatalogCard; onClose: () => void; onPick: (set: string, num: string) => void }) {
  const request = useStore((s) => s.request);
  const [list, setList] = useState<{ set: string; num: string }[]>();
  useEffect(() => {
    request({ t: 'printings', name: card.name }, 'printings').then((r) => setList(r.result.printings));
  }, [card.name, request]);
  return (
    <Modal onClose={onClose} wide>
      <h2 className="mb-1 font-display text-lg text-white">Arte de {card.name}</h2>
      <p className="mb-4 text-xs text-white/50">Impressões disponíveis no XMage{list ? ` (${list.length})` : ''}. A arte escolhida aparece na mesa durante a partida.</p>
      {!list ? (
        <p className="text-white/50">Carregando…</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
          {list.slice(0, 120).map((p) => (
            <button key={p.set + p.num} onClick={() => onPick(p.set, p.num)} className="group text-left">
              <CardArt card={{ name: card.name, set: p.set, num: p.num }} size="small" className={cx('transition group-hover:-translate-y-1', p.set === card.set && p.num === card.num && 'ring-2 ring-ember-400')} />
              <span className="mt-1 block text-center text-[11px] text-white/50">
                {p.set} · {p.num}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ExportDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 font-display text-lg text-white">Exportar lista</h2>
      <textarea readOnly value={text} className="input h-80 resize-none font-mono text-xs" />
      <div className="mt-3 flex justify-end gap-2">
        <HeaderBtn onClick={onClose}>Fechar</HeaderBtn>
        <HeaderBtn
          primary
          onClick={() => {
            navigator.clipboard?.writeText(text).then(() => setCopied(true));
          }}
        >
          {copied ? 'Copiado ✓' : 'Copiar'}
        </HeaderBtn>
      </div>
    </Modal>
  );
}

function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (r: DecklistImport, mode: 'replace' | 'add') => void }) {
  const request = useStore((s) => s.request);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (mode: 'replace' | 'add') => {
    setBusy(true);
    const r = await request({ t: 'importDecklist', text }, 'decklist');
    setBusy(false);
    onImported(r.result, mode);
  };
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-1 font-display text-lg text-white">Importar lista</h2>
      <p className="mb-3 text-xs text-white/50">Formatos: Moxfield, Archidekt, MTG Arena/MTGO, .dck do XMage, ou simplesmente “1 Nome da carta” por linha.</p>
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} className="input h-72 resize-none font-mono text-xs" placeholder={'Commander\n1 Kenrith, the Returned King\n\nDeck\n1 Sol Ring\n…'} />
      <div className="mt-3 flex justify-end gap-2">
        <HeaderBtn onClick={onClose}>Cancelar</HeaderBtn>
        <HeaderBtn disabled={!text.trim() || busy} onClick={() => run('add')}>Adicionar ao deck</HeaderBtn>
        <HeaderBtn primary disabled={!text.trim() || busy} onClick={() => run('replace')}>Substituir deck</HeaderBtn>
      </div>
    </Modal>
  );
}
