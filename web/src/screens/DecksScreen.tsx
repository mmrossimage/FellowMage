import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { DeckTile } from './HomeScreen';

export function DecksScreen() {
  const userDecks = useStore((s) => s.userDecks);
  const decks = useStore((s) => s.decks);
  const navigate = useStore((s) => s.navigate);
  const send = useStore((s) => s.send);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('');
  const [moxUrl, setMoxUrl] = useState('');
  const linkMoxfield = useStore((s) => s.linkMoxfield);
  const linking = useStore((s) => s.moxfieldBusy === 'link');
  const refreshUserDecks = useStore((s) => s.refreshUserDecks);
  // pedir a lista também confere no Moxfield os decks vinculados (no máximo a cada 10 min)
  useEffect(() => refreshUserDecks(), [refreshUserDecks]);
  const moxValid = /^(https?:\/\/)?(www\.)?moxfield\.com\/decks\/[A-Za-z0-9_-]{8,}|^[A-Za-z0-9_-]{8,}$/.test(moxUrl.trim());

  const submitMoxfield = () => {
    if (!moxValid || linking) return;
    linkMoxfield(moxUrl.trim());
    setMoxUrl('');
  };

  const samples = useMemo(
    () => decks.filter((d) => d.startsWith('Commander/') && d.toLowerCase().includes(filter.toLowerCase())),
    [decks, filter],
  );

  const remove = (path: string, name: string) => {
    if (confirm(`Apagar o deck "${name}"? Isso não pode ser desfeito.`)) send({ t: 'deleteDeck', path });
  };

  return (
    <div className="h-full overflow-y-auto px-10 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-bold text-white">Decks</h1>
        <button
          onClick={() => navigate('editor', { editor: { path: null } })}
          className="rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-ink-950"
        >
          + Novo deck
        </button>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-xs uppercase tracking-wider text-white/50">Meus decks ({userDecks.length})</h2>
        {userDecks.length === 0 ? (
          <p className="text-sm text-white/45">Nenhum deck ainda.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {userDecks.map((d) => (
              <DeckTile key={d.path} deck={d} onDelete={() => remove(d.path, d.name)} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-xs uppercase tracking-wider text-white/50">Vincular deck do Moxfield</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitMoxfield();
          }}
          className="flex gap-2"
        >
          <input
            value={moxUrl}
            onChange={(e) => setMoxUrl(e.target.value)}
            placeholder="https://moxfield.com/decks/…"
            className="input flex-1"
          />
          <button
            type="submit"
            disabled={!moxValid || linking}
            className="shrink-0 rounded-xl bg-white/10 px-5 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-40"
          >
            {linking ? 'Baixando…' : 'Vincular'}
          </button>
        </form>
        <p className="mt-2 text-xs text-white/40">
          O deck entra em “Meus decks” e é atualizado sozinho quando muda no Moxfield (conferido ao abrir esta tela, no
          máximo a cada 10 minutos, ou pelo botão ↻). Só funciona com decks públicos ou não listados. Edições feitas aqui
          num deck vinculado são substituídas na próxima alteração feita no Moxfield.
        </p>
      </section>

      <section className="mt-10 grid grid-cols-2 gap-8">
        <div>
          <h2 className="mb-3 text-xs uppercase tracking-wider text-white/50">Importar lista</h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Cole aqui a lista (Moxfield, Archidekt, Arena, MTGO ou .dck)\n\nCommander\n1 Atraxa, Praetors\' Voice\n\nDeck\n1 Sol Ring\n1 Command Tower\n…'}
            className="input h-64 resize-none font-mono text-xs leading-relaxed"
          />
          <button
            disabled={!text.trim()}
            onClick={() => navigate('editor', { editor: { path: null, importText: text } })}
            className="mt-3 w-full rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-40"
          >
            Importar e abrir no editor
          </button>
        </div>

        <div>
          <h2 className="mb-3 text-xs uppercase tracking-wider text-white/50">Decks de Commander de exemplo (XMage)</h2>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar…" className="input mb-2" />
          <div className="h-56 overflow-y-auto rounded-xl bg-black/30 p-1 ring-1 ring-white/10">
            {samples.map((d) => {
              const parts = d.replace(/\.dck$/i, '').split('/');
              return (
                <button
                  key={d}
                  onClick={() => navigate('editor', { editor: { path: d } })}
                  className="flex w-full items-baseline justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-white/75 hover:bg-white/5"
                >
                  <span className="truncate">{parts[parts.length - 1]}</span>
                  <span className="shrink-0 truncate text-[11px] text-white/35">{parts.slice(1, -1).join(' / ')}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-white/40">Abrir um exemplo no editor permite salvar uma cópia em “Meus decks”.</p>
        </div>
      </section>
    </div>
  );
}
