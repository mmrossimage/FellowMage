import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { FormatId } from '../types';
import { cx } from '../util';

const RANDOM = '';
const USER_FOLDER = 'Meus decks/';

const FORMATS: { id: FormatId; label: string; desc: string; folder: string; maxOpponents: number }[] = [
  { id: 'commander', label: 'Commander', desc: '40 de vida · comandante · até 4 jogadores', folder: 'Commander/', maxOpponents: 3 },
  { id: 'duel', label: 'Duelo', desc: '20 de vida · 1 contra 1 · formato livre', folder: '', maxOpponents: 1 },
];

// "skill" da IA "Computer - mad" do XMage: profundidade de busca (mais alto = mais forte e mais lento)
const AI_LEVELS = [
  { skill: 2, label: 'Rápida', desc: 'joga quase sem pensar' },
  { skill: 4, label: 'Equilibrada', desc: 'bom ritmo para 4 jogadores' },
  { skill: 7, label: 'Forte', desc: 'mais desafiadora, turnos lentos' },
];

const deckLabel = (path: string) => {
  const parts = path.replace(/\.dck$/i, '').split('/');
  return { name: parts[parts.length - 1], folder: parts.slice(0, -1).join(' / ') };
};

export function LobbyScreen() {
  const decks = useStore((s) => s.decks);
  const user = useStore((s) => s.user);
  const server = useStore((s) => s.server);
  const clientVersion = useStore((s) => s.clientVersion);
  const serverVersion = useStore((s) => s.serverVersion);
  const status = useStore((s) => s.status);
  const startGame = useStore((s) => s.startGame);

  const playDeck = useStore((s) => s.playDeck);
  const [formatId, setFormatId] = useState<FormatId>('commander');
  const format = FORMATS.find((f) => f.id === formatId)!;
  const [opponents, setOpponents] = useState(3);
  const [deck, setDeck] = useState(playDeck ?? RANDOM);
  const [opponentDecks, setOpponentDecks] = useState<string[]>([RANDOM, RANDOM, RANDOM]);
  const [aiSkill, setAiSkill] = useState(4);

  // seus decks primeiro, depois os exemplos do formato
  const pool = useMemo(
    () => decks.filter((d) => d.startsWith(USER_FOLDER) || d.startsWith(format.folder)),
    [decks, format.folder],
  );
  const nOpp = Math.min(opponents, format.maxOpponents);

  const changeFormat = (id: FormatId) => {
    setFormatId(id);
    setDeck(RANDOM);
    setOpponentDecks([RANDOM, RANDOM, RANDOM]);
  };

  return (
    <div className="flex h-full items-center justify-center overflow-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-5xl rounded-2xl border border-white/10 bg-ink-900/80 p-8 shadow-panel backdrop-blur"
      >
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-3xl font-bold text-ember-300">Nova partida contra a IA</h1>
          <div className="text-right">
            <div className="text-sm text-white/50">
              {user} @ {server}
            </div>
            {clientVersion && (
              <div className="text-xs text-white/35">
                Gateway: XMage {clientVersion} · Servidor: {serverVersion ?? '?'}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => changeFormat(f.id)}
              className={cx(
                'rounded-xl p-4 text-left ring-1 transition',
                formatId === f.id ? 'bg-ember-500/15 ring-ember-400/70' : 'bg-black/30 ring-white/10 hover:ring-white/25',
              )}
            >
              <div className="font-display text-lg font-bold text-white">{f.label}</div>
              <div className="text-xs text-white/55">{f.desc}</div>
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-white/50">Nível da IA</span>
          {AI_LEVELS.map((l) => (
            <button
              key={l.skill}
              onClick={() => setAiSkill(l.skill)}
              title={l.desc}
              className={cx('rounded-lg px-3 py-1.5 text-sm ring-1 transition', aiSkill === l.skill ? 'bg-ember-500 font-semibold text-ink-950 ring-ember-400' : 'bg-black/30 text-white/70 ring-white/10 hover:text-white')}
            >
              {l.label}
            </button>
          ))}
          <span className="text-xs text-white/40">{AI_LEVELS.find((l) => l.skill === aiSkill)?.desc}</span>
        </div>

        {format.maxOpponents > 1 && (
          <div className="mt-4 flex items-center gap-3">
            <span className="text-xs uppercase tracking-wider text-white/50">Oponentes (IA)</span>
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => setOpponents(n)}
                className={cx('h-9 w-9 rounded-lg font-semibold ring-1 transition', nOpp === n ? 'bg-ember-500 text-ink-950 ring-ember-400' : 'bg-black/30 text-white/70 ring-white/10 hover:text-white')}
              >
                {n}
              </button>
            ))}
            <span className="text-xs text-white/40">→ mesa de {nOpp + 1} jogadores</span>
          </div>
        )}

        <div className="mt-6 grid grid-cols-[1.1fr_1fr] gap-6">
          <DeckPicker title="Seu deck" decks={pool} value={deck} onChange={setDeck} />
          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Decks dos oponentes</div>
            <div className="space-y-2">
              {Array.from({ length: nOpp }).map((_, i) => (
                <label key={i} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-xs text-white/50">IA {i + 1}</span>
                  <select
                    value={opponentDecks[i]}
                    onChange={(e) => setOpponentDecks(opponentDecks.map((d, j) => (j === i ? e.target.value : d)))}
                    className="input"
                  >
                    <option value={RANDOM}>🎲 Aleatório</option>
                    {pool.map((d) => {
                      const l = deckLabel(d);
                      return (
                        <option key={d} value={d}>
                          {l.name}
                          {l.folder && l.folder !== 'Commander' ? ` — ${l.folder.replace(/^Commander \/ /, '')}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/40">
              {formatId === 'commander'
                ? 'Usa “Freeform Commander” do XMage: estrutura de Commander sem lista de banidas, para aceitar todos os decks de exemplo.'
                : 'Duelo em formato livre com qualquer deck de exemplo.'}
            </p>
          </div>
        </div>

        <button
          disabled={status === 'starting' || pool.length === 0}
          onClick={() => startGame(formatId, deck || undefined, opponentDecks.slice(0, nOpp).map((d) => d || null), aiSkill)}
          className="mt-8 w-full rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 py-3.5 font-display text-lg font-bold uppercase tracking-wider text-ink-950 transition hover:brightness-110 disabled:opacity-60"
        >
          {status === 'starting' ? 'Preparando a mesa…' : `Começar ${format.label}`}
        </button>
      </motion.div>
    </div>
  );
}

function DeckPicker({ title, decks, value, onChange }: { title: string; decks: string[]; value: string; onChange: (v: string) => void }) {
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const f = filter.toLowerCase();
    return decks.filter((d) => d.toLowerCase().includes(f)).slice(0, 300);
  }, [decks, filter]);

  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wider text-white/50">{title}</div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Buscar entre ${decks.length} decks…`} className="input mb-2" />
      <div className="h-64 overflow-y-auto rounded-xl bg-black/30 p-1 ring-1 ring-white/10">
        <DeckRow label="🎲 Aleatório" active={value === RANDOM} onClick={() => onChange(RANDOM)} />
        {shown.map((d) => {
          const l = deckLabel(d);
          return <DeckRow key={d} label={l.name} folder={l.folder.replace(/^Commander( \/ )?/, '')} active={value === d} onClick={() => onChange(d)} />;
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
      {folder && <span className="shrink-0 truncate text-[11px] text-white/35">{folder}</span>}
    </button>
  );
}
