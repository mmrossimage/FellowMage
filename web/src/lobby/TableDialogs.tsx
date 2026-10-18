import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { DeckPicker } from '../screens/LobbyScreen';
import { useStore } from '../store';
import type { CreateTableOptions, LobbyTable } from '../types';
import { cx } from '../util';
import { SKILL_LABEL, filledSeats, sortDecks } from './tables';

const LAST_DECK = 'fm.onlineDeck';
const LAST_TABLE = 'fm.onlineTable';

function lsGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* sem armazenamento: só não lembra a escolha */
  }
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-white/10 bg-ink-900/95 p-6 shadow-panel"
        >
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs uppercase tracking-wider text-white/50">{label}</span>
      {children}
    </label>
  );
}

function Actions({ busy, okLabel, onCancel, disabled }: { busy: boolean; okLabel: string; onCancel: () => void; disabled?: boolean }) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="rounded-xl bg-white/10 px-5 py-2.5 text-sm text-white ring-1 ring-white/15 hover:bg-white/20">
        Cancelar
      </button>
      <button
        disabled={busy || disabled}
        className="rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 px-6 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-ink-950 hover:brightness-110 disabled:opacity-50"
      >
        {busy ? 'Aguardando o servidor…' : okLabel}
      </button>
    </div>
  );
}

/** Equivalente ao "Join Table" do XMage: escolher o deck e, se houver, a senha. */
export function JoinTableDialog({ table, onClose }: { table: LobbyTable; onClose: () => void }) {
  const decks = useStore((s) => s.decks);
  const busy = useStore((s) => s.tableBusy);
  const joinTable = useStore((s) => s.joinTable);
  const pool = useMemo(() => sortDecks(decks, table.deckType), [decks, table.deckType]);
  const [deck, setDeck] = useState(() => lsGet(LAST_DECK) ?? '');
  const [password, setPassword] = useState('');
  const validDeck = pool.includes(deck);

  return (
    <Modal onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lsSet(LAST_DECK, deck);
          joinTable(table.id, deck, password);
        }}
      >
        <h2 className="font-display text-2xl font-bold text-ember-300">Entrar na mesa</h2>
        <p className="mt-1 text-white/80">{table.name}</p>
        <p className="mt-1 text-sm text-white/50">
          {table.deckType} · {table.gameType} · {filledSeats(table)}/{table.seats.length} jogadores · criada por {table.owner}
        </p>

        <div className="mt-5">
          <DeckPicker title="Seu deck" decks={pool} value={deck} onChange={setDeck} allowRandom={false} heightClass="h-56" />
          <p className="mt-2 text-xs text-white/40">O servidor confere se o deck é válido para “{table.deckType}”.</p>
        </div>
        {table.passworded && (
          <Field label="Senha da mesa" className="mt-4 max-w-xs">
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="input" />
          </Field>
        )}
        <Actions busy={busy} okLabel="Entrar" onCancel={onClose} disabled={!validDeck} />
      </form>
    </Modal>
  );
}

/** Equivalente enxuto do "New Table" do XMage: todas as vagas são para pessoas. */
export function CreateTableDialog({ onClose }: { onClose: () => void }) {
  const decks = useStore((s) => s.decks);
  const user = useStore((s) => s.user);
  const busy = useStore((s) => s.tableBusy);
  const options = useStore((s) => s.lobbyOptions);
  const send = useStore((s) => s.send);
  const createTable = useStore((s) => s.createTable);

  useEffect(() => {
    if (!options) send({ t: 'lobbyOptions' });
  }, [options, send]);

  const saved = useMemo<Partial<CreateTableOptions>>(() => {
    try {
      return JSON.parse(lsGet(LAST_TABLE) ?? '{}');
    } catch {
      return {};
    }
  }, []);
  const [o, setO] = useState<CreateTableOptions>(() => ({
    name: `${user ?? 'Mago'}'s table`,
    gameType: saved.gameType ?? '',
    deckType: saved.deckType ?? '',
    players: saved.players ?? 4,
    timeLimit: saved.timeLimit ?? 'MIN__55',
    skill: saved.skill ?? 'CASUAL',
    wins: 1,
    password: '',
    spectators: saved.spectators ?? false,
    deck: lsGet(LAST_DECK) ?? '',
  }));
  const set = <K extends keyof CreateTableOptions>(k: K, v: CreateTableOptions[K]) => setO((p) => ({ ...p, [k]: v }));

  // padrões quando as opções do servidor chegam: Commander em mesa de 4, como as mesas mais comuns
  useEffect(() => {
    if (!options) return;
    setO((p) => {
      const deckType = options.deckTypes.includes(p.deckType)
        ? p.deckType
        : (options.deckTypes.find((d) => d === 'Variant Magic - Commander') ?? options.deckTypes[0] ?? '');
      const gameType = options.gameTypes.some((g) => g.name === p.gameType)
        ? p.gameType
        : (options.gameTypes.find((g) => g.name === 'Commander Free For All') ?? options.gameTypes[0])?.name ?? '';
      return { ...p, deckType, gameType };
    });
  }, [options]);

  const gameType = options?.gameTypes.find((g) => g.name === o.gameType);
  const minP = gameType?.minPlayers ?? 2;
  const maxP = gameType?.maxPlayers ?? 4;
  const players = Math.max(minP, Math.min(maxP, o.players));
  const pool = useMemo(() => sortDecks(decks, o.deckType), [decks, o.deckType]);

  return (
    <Modal onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const final = { ...o, players };
          lsSet(LAST_DECK, final.deck);
          lsSet(LAST_TABLE, JSON.stringify({ ...final, name: undefined, password: undefined, deck: undefined }));
          createTable(final);
        }}
      >
        <h2 className="font-display text-2xl font-bold text-ember-300">Nova mesa</h2>
        <p className="mt-1 text-sm text-white/50">Fica aberta no lobby até as vagas serem preenchidas. Você começa a partida quando a mesa estiver cheia.</p>

        {!options ? (
          <p className="mt-6 text-white/60">Carregando as opções do servidor…</p>
        ) : (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Nome da mesa" className="sm:col-span-2">
                <input value={o.name} onChange={(e) => set('name', e.target.value)} className="input" maxLength={60} />
              </Field>
              <Field label="Formato do deck">
                <select value={o.deckType} onChange={(e) => set('deckType', e.target.value)} className="input">
                  {options.deckTypes.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo de jogo">
                <select value={o.gameType} onChange={(e) => set('gameType', e.target.value)} className="input">
                  {options.gameTypes.map((g) => (
                    <option key={g.name}>{g.name}</option>
                  ))}
                </select>
              </Field>
              <Field label={`Jogadores (${minP}–${maxP})`}>
                <div className="flex gap-1.5">
                  {Array.from({ length: maxP - minP + 1 }, (_, i) => minP + i)
                    .slice(0, 9)
                    .map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => set('players', n)}
                        className={cx('h-9 w-9 rounded-lg text-sm font-semibold ring-1 transition', players === n ? 'bg-ember-500 text-ink-950 ring-ember-400' : 'bg-black/30 text-white/70 ring-white/10 hover:text-white')}
                      >
                        {n}
                      </button>
                    ))}
                </div>
              </Field>
              <Field label="Tempo de cada jogador">
                <select value={o.timeLimit} onChange={(e) => set('timeLimit', e.target.value)} className="input">
                  {options.timeLimits.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.minutes ? `${t.minutes} minutos` : 'Sem limite'}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nível">
                <select value={o.skill} onChange={(e) => set('skill', e.target.value)} className="input">
                  {options.skillLevels.map((s) => (
                    <option key={s} value={s}>
                      {SKILL_LABEL[s] ?? s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Senha (opcional)">
                <input value={o.password} onChange={(e) => set('password', e.target.value)} className="input" placeholder="Mesa aberta a todos" />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-white/75">
                <input type="checkbox" checked={o.spectators} onChange={(e) => set('spectators', e.target.checked)} />
                Permitir espectadores
              </label>
            </div>

            <div className="mt-5">
              <DeckPicker title="Seu deck" decks={pool} value={o.deck} onChange={(d) => set('deck', d)} allowRandom={false} heightClass="h-48" />
            </div>
          </>
        )}
        <Actions busy={busy} okLabel="Criar mesa" onCancel={onClose} disabled={!options || !pool.includes(o.deck)} />
      </form>
    </Modal>
  );
}
