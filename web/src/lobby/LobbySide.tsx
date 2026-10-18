import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { cx, sanitizeHtml } from '../util';
import { ChatBox } from './ChatBox';
import { ago } from './tables';

type Tab = 'chat' | 'users' | 'finished';

// o cliente oficial atualiza a lista de usuários a cada 10 s e as partidas encerradas a cada 60 s
const USERS_MS = 10000;
const FINISHED_MS = 60000;

/** Coluna do lobby: chat do servidor, jogadores conectados (cochichar) e partidas encerradas (replay). */
export function LobbySide({ className }: { className?: string }) {
  const [tab, setTab] = useState<Tab>('chat');
  const [prefill, setPrefill] = useState<{ text: string; key: number }>();
  const roomChat = useStore((s) => s.chats.room);
  const users = useStore((s) => s.roomUsers);
  const sendChat = useStore((s) => s.sendChat);
  const send = useStore((s) => s.send);

  useEffect(() => {
    if (tab !== 'users') return;
    send({ t: 'roomUsers' });
    const id = setInterval(() => send({ t: 'roomUsers' }), USERS_MS);
    return () => clearInterval(id);
  }, [tab, send]);
  useEffect(() => {
    if (tab !== 'finished') return;
    send({ t: 'finishedMatches' });
    const id = setInterval(() => send({ t: 'finishedMatches' }), FINISHED_MS);
    return () => clearInterval(id);
  }, [tab, send]);

  const whisper = (name: string) => {
    setTab('chat');
    // comando de chat do servidor XMage (ChatManager): \w <nome> <texto>
    setPrefill({ text: `\\w ${name} `, key: Date.now() });
  };

  return (
    <section className={cx('flex min-h-0 flex-col rounded-xl border border-white/10 bg-ink-900/70 shadow-panel', className)}>
      <div className="flex border-b border-white/10 text-xs">
        {(
          [
            ['chat', 'Chat'],
            ['users', `Jogadores${users.length ? ` (${users.length})` : ''}`],
            ['finished', 'Encerradas'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cx('flex-1 px-2 py-2 font-display uppercase tracking-wider', tab === id ? 'text-ember-300 shadow-[inset_0_-2px_0] shadow-ember-400' : 'text-white/50 hover:text-white')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'chat' && (
        <ChatBox lines={roomChat} onSend={(text) => sendChat('room', text)} prefill={prefill} className="min-h-0 flex-1 rounded-none border-0 bg-transparent shadow-none" />
      )}
      {tab === 'users' && <UserList onWhisper={whisper} />}
      {tab === 'finished' && <FinishedList />}
    </section>
  );
}

function UserList({ onWhisper }: { onWhisper: (name: string) => void }) {
  const users = useStore((s) => s.roomUsers);
  const me = useStore((s) => s.user);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2 text-[13px]">
      {!users.length && <p className="p-2 text-white/35">Carregando…</p>}
      {users.map((u) => (
        <div key={u.name} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-white">
              {u.name}
              {u.name === me && <span className="ml-1 text-[10px] font-normal text-arcane-300">você</span>}
            </div>
            <div className="truncate text-[11px] text-white/45" title={`Histórico: ${u.history} · abandono ${u.quitRatio}% · ping ${u.ping}`}>
              {u.games || 'no lobby'}
              {u.quitRatio > 0 && ` · abandono ${u.quitRatio}%`}
            </div>
          </div>
          {u.name !== me && (
            <button onClick={() => onWhisper(u.name)} className="shrink-0 rounded px-2 py-1 text-[11px] text-arcane-300 opacity-0 ring-1 ring-arcane-400/30 group-hover:opacity-100">
              Cochichar
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function FinishedList() {
  const matches = useStore((s) => s.finishedMatches);
  const send = useStore((s) => s.send);
  return (
    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2 text-[12px]">
      {!matches.length && <p className="p-2 text-white/35">Nenhuma partida encerrada recentemente.</p>}
      {matches.map((m) => (
        <div key={m.id} className="rounded-lg bg-black/20 px-2.5 py-2 ring-1 ring-white/5">
          <div className="truncate font-semibold text-white">{m.name}</div>
          <div className="truncate text-white/55">{m.players}</div>
          <div className="text-white/45" dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.result) }} />
          <div className="mt-1 flex items-center justify-between text-[11px] text-white/35">
            <span>
              {m.deckType} · {ago(m.end ?? null)}
            </span>
            {m.replay &&
              m.games.map((g, i) => (
                <button key={g} onClick={() => send({ t: 'replay', gameId: g })} className="ml-1 rounded px-1.5 py-0.5 text-arcane-300 ring-1 ring-arcane-400/30 hover:bg-arcane-400/10">
                  ▶ Jogo {i + 1}
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Avisos do servidor (mensagem do dia), como o painel de notícias do lobby oficial. */
export function ServerNews() {
  const messages = useStore((s) => s.serverMessages);
  const send = useStore((s) => s.send);
  const [hidden, setHidden] = useState(false);
  useEffect(() => send({ t: 'serverMessages' }), [send]);
  const shown = messages.filter((m) => m.trim());
  if (hidden || !shown.length) return null;
  return (
    <div className="mt-3 flex items-start gap-3 rounded-xl border border-arcane-400/20 bg-arcane-400/5 px-4 py-2.5 text-sm text-white/75">
      <span>📣</span>
      <div className="min-w-0 flex-1 space-y-0.5">
        {shown.map((m, i) => (
          <p key={i} dangerouslySetInnerHTML={{ __html: sanitizeHtml(m) }} />
        ))}
      </div>
      <button onClick={() => setHidden(true)} className="text-white/40 hover:text-white">
        ✕
      </button>
    </div>
  );
}
