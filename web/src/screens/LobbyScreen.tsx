import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { cx } from '../util';

const RANDOM = '';

export function LobbyScreen() {
  const decks = useStore((s) => s.decks);
  const user = useStore((s) => s.user);
  const server = useStore((s) => s.server);
  const status = useStore((s) => s.status);
  const startAiGame = useStore((s) => s.startAiGame);

  const [deck, setDeck] = useState(RANDOM);
  const [aiDeck, setAiDeck] = useState(RANDOM);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl rounded-2xl border border-white/10 bg-ink-900/80 p-8 shadow-panel backdrop-blur"
      >
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-3xl font-bold text-ember-300">Jogar contra a IA</h1>
          <span className="text-sm text-white/50">
            {user} @ {server}
          </span>
        </div>
        <p className="mt-1 text-sm text-white/60">Duelo de dois jogadores (regras completas do XMage, formato livre).</p>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <DeckPicker title="Seu deck" decks={decks} value={deck} onChange={setDeck} />
          <DeckPicker title="Deck da IA" decks={decks} value={aiDeck} onChange={setAiDeck} />
        </div>

        <button
          disabled={status === 'starting'}
          onClick={() => startAiGame(deck || undefined, aiDeck || undefined)}
          className="mt-8 w-full rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 py-3.5 font-display text-lg font-bold uppercase tracking-wider text-ink-950 transition hover:brightness-110 disabled:opacity-60"
        >
          {status === 'starting' ? 'Preparando a mesa…' : 'Começar partida'}
        </button>
      </motion.div>
    </div>
  );
}

function DeckPicker({ title, decks, value, onChange }: { title: string; decks: string[]; value: string; onChange: (v: string) => void }) {
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const f = filter.toLowerCase();
    return decks.filter((d) => d.toLowerCase().includes(f)).slice(0, 200);
  }, [decks, filter]);

  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wider text-white/50">{title}</div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Buscar entre ${decks.length} decks…`} className="input mb-2" />
      <div className="h-72 overflow-y-auto rounded-xl bg-black/30 p-1 ring-1 ring-white/10">
        <DeckRow label="🎲 Aleatório" active={value === RANDOM} onClick={() => onChange(RANDOM)} />
        {shown.map((d) => {
          const parts = d.replace(/\.dck$/i, '').split('/');
          return <DeckRow key={d} label={parts[parts.length - 1]} folder={parts.slice(0, -1).join(' / ')} active={value === d} onClick={() => onChange(d)} />;
        })}
      </div>
    </div>
  );
}

function DeckRow({ label, folder, active, onClick }: { label: string; folder?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cx('flex w-full items-baseline justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition', active ? 'bg-ember-500/25 text-white' : 'text-white/75 hover:bg-white/5')}
    >
      <span className="truncate">{label}</span>
      {folder && <span className="shrink-0 text-[11px] text-white/35">{folder}</span>}
    </button>
  );
}
