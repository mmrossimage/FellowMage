import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import type { LobbyTable } from '../types';
import { cx } from '../util';
import { LobbySide, ServerNews } from './LobbySide';
import { CreateTableDialog, JoinTableDialog } from './TableDialogs';
import { SKILL_LABEL, TABLE_STATE, ago, canJoin, filledSeats } from './tables';

// mesmo intervalo do cliente oficial (TablesPanel.REFRESH_ACTIVE_TABLES_SECS)
const REFRESH_MS = 5000;

/** Lobby do servidor online: mesas abertas e em andamento, criar ou entrar numa mesa, chat geral. */
export function OnlineLobby() {
  const tables = useStore((s) => s.tables);
  const user = useStore((s) => s.user);
  const server = useStore((s) => s.server);
  const serverVersion = useStore((s) => s.serverVersion);
  const send = useStore((s) => s.send);

  const [search, setSearch] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [deckType, setDeckType] = useState('');
  const [joining, setJoining] = useState<LobbyTable>();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    send({ t: 'lobbyOptions' });
    send({ t: 'listTables' });
    const id = setInterval(() => send({ t: 'listTables' }), REFRESH_MS);
    return () => clearInterval(id);
  }, [send]);

  const deckTypes = useMemo(() => [...new Set(tables.map((t) => t.deckType))].sort(), [tables]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tables
      .filter((t) => !onlyOpen || canJoin(t))
      .filter((t) => !deckType || t.deckType === deckType)
      .filter((t) => !q || [t.name, t.owner, t.deckType, t.gameType, ...t.seats.map((s) => s.name)].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => Number(canJoin(b)) - Number(canJoin(a)) || (b.created ?? 0) - (a.created ?? 0));
  }, [tables, search, onlyOpen, deckType]);
  const openCount = tables.filter(canJoin).length;

  return (
    <div className="flex h-full min-h-0 gap-4 p-6">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold text-ember-300">Mesas online</h1>
            <p className="mt-1 text-sm text-white/50">
              {user} @ {server}
              {serverVersion && <span className="text-white/35"> · {serverVersion}</span>} · {openCount} aguardando jogadores · {tables.length} no total
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-ink-950 hover:brightness-110"
          >
            + Nova mesa
          </button>
        </div>

        <ServerNews />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por mesa, jogador ou formato…" className="input max-w-xs" />
          <select value={deckType} onChange={(e) => setDeckType(e.target.value)} className="input w-auto">
            <option value="">Todos os formatos</option>
            {deckTypes.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            Só com vagas
          </label>
        </div>

        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {shown.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-white/45">
              {tables.length === 0 ? 'Carregando mesas…' : 'Nenhuma mesa com esses filtros. Que tal criar uma?'}
            </p>
          )}
          {shown.map((t) => (
            <TableRow key={t.id} table={t} onJoin={() => setJoining(t)} />
          ))}
        </div>
      </section>

      <LobbySide className="w-80 shrink-0" />

      {joining && <JoinTableDialog table={joining} onClose={() => setJoining(undefined)} />}
      {creating && <CreateTableDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function TableRow({ table: t, onJoin }: { table: LobbyTable; onJoin: () => void }) {
  const send = useStore((s) => s.send);
  const open = canJoin(t);
  const players = t.seats.filter((s) => s.name).map((s) => s.name);
  // mesa em jogo que aceita espectadores (o servidor recusa as demais)
  const watchable = t.spectators && !t.tournament && (t.state === 'DUELING' || t.state === 'SIDEBOARDING');
  return (
    <div className={cx('flex items-center gap-4 rounded-xl border px-4 py-3 transition', open ? 'border-ember-400/25 bg-ember-500/5' : 'border-white/5 bg-black/20')}>
      <div className="w-14 shrink-0 text-center">
        <div className={cx('font-display text-xl font-bold', open ? 'text-ember-300' : 'text-white/60')}>
          {filledSeats(t)}/{t.seats.length}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-white/35">jogadores</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-white">{t.name}</span>
          {t.passworded && <span title="Mesa com senha">🔒</span>}
          {t.rated && <span className="rounded bg-purple-500/20 px-1.5 text-[10px] text-purple-200">ranqueada</span>}
          {t.tournament && <span className="rounded bg-white/10 px-1.5 text-[10px] text-white/60">torneio</span>}
        </div>
        <div className="truncate text-xs text-white/55">
          {t.deckType} · {t.gameType}
          {t.skill && ` · ${SKILL_LABEL[t.skill] ?? t.skill}`}
          {t.quitRatio && t.quitRatio !== '100' && ` · abandono máx. ${t.quitRatio}%`}
        </div>
        <div className="truncate text-xs text-white/40">{players.length ? players.join(', ') : `criada por ${t.owner}`}</div>
      </div>
      <div className="hidden w-40 shrink-0 text-right text-xs sm:block">
        <div className={cx(open ? 'text-ember-300' : 'text-white/50')}>{t.state ? (TABLE_STATE[t.state] ?? t.stateText) : t.stateText}</div>
        <div className="text-white/35">{ago(t.created)}</div>
      </div>
      {watchable && (
        <button
          onClick={() => send({ t: 'watchTable', tableId: t.id })}
          className="shrink-0 rounded-lg px-3 py-2 text-sm text-arcane-300 ring-1 ring-arcane-400/30 transition hover:bg-arcane-400/10"
          title="Assistir como espectador"
        >
          👁 Assistir
        </button>
      )}
      <button
        disabled={!open}
        onClick={onJoin}
        className="w-24 shrink-0 rounded-lg bg-white/10 py-2 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-ember-500 hover:text-ink-950 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-white/10 disabled:hover:text-white"
      >
        {t.tournament ? 'Torneio' : open ? 'Entrar' : 'Cheia'}
      </button>
    </div>
  );
}
