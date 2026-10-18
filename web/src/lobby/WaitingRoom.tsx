import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useStore } from '../store';
import { cx } from '../util';
import { ChatBox } from './ChatBox';
import { TABLE_STATE, filledSeats } from './tables';

// o cliente oficial atualiza a sala de espera a cada segundo; 2 s basta para o navegador
const REFRESH_MS = 2000;

/** Sala de espera da mesa: quem já entrou, vagas livres, chat da mesa; o dono começa quando lotar. */
export function WaitingRoom() {
  const table = useStore((s) => s.table)!;
  const user = useStore((s) => s.user);
  const chat = useStore((s) => s.chats.table);
  const send = useStore((s) => s.send);
  const sendChat = useStore((s) => s.sendChat);
  const leaveTable = useStore((s) => s.leaveTable);

  useEffect(() => {
    send({ t: 'tableInfo' });
    const id = setInterval(() => send({ t: 'tableInfo' }), REFRESH_MS);
    return () => clearInterval(id);
  }, [send]);

  const info = table.info;
  const ready = info?.state === 'READY_TO_START';
  const starting = info?.state === 'STARTING' || info?.state === 'DUELING';

  return (
    <div className="flex h-full min-h-0 items-stretch justify-center gap-4 p-6">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-ink-900/80 p-8 shadow-panel"
      >
        <p className="text-xs uppercase tracking-[0.3em] text-white/45">Sala de espera</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ember-300">{info?.name ?? 'Mesa'}</h1>
        {info && (
          <p className="mt-1 text-sm text-white/55">
            {info.deckType} · {info.gameType}
            {info.passworded && ' · 🔒 com senha'}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-white/50">Jogadores {info && `(${filledSeats(info)}/${info.seats.length})`}</span>
          <span className={cx('text-sm', ready ? 'text-ember-300' : 'text-white/55')}>
            {info?.state ? (TABLE_STATE[info.state] ?? info.stateText) : 'Carregando…'}
          </span>
        </div>
        <ul className="mt-2 space-y-2">
          {(info?.seats ?? []).map((s, i) => (
            <li key={i} className={cx('flex items-center gap-3 rounded-xl px-4 py-3 ring-1', s.name ? 'bg-white/5 ring-white/10' : 'bg-black/20 ring-white/5')}>
              <span className="w-6 text-center font-display text-white/40">{i + 1}</span>
              {s.name ? (
                <span className="font-semibold text-white">
                  {s.name}
                  {s.name === info?.owner && <span className="ml-2 text-xs font-normal text-ember-300">dono</span>}
                  {s.name === user && <span className="ml-2 text-xs font-normal text-arcane-300">você</span>}
                </span>
              ) : (
                <span className="italic text-white/35">Vaga livre — aguardando…</span>
              )}
            </li>
          ))}
        </ul>

        <div className="min-h-6 flex-1" />
        <p className="text-sm text-white/50">
          {starting
            ? 'A partida está começando…'
            : table.owner
              ? ready
                ? 'Mesa cheia! Você pode começar.'
                : 'Quando todas as vagas forem preenchidas, o botão Começar é liberado.'
              : `Aguardando ${info?.owner ?? 'o dono da mesa'} começar a partida.`}
        </p>
        <div className="mt-4 flex gap-3">
          <button onClick={leaveTable} className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/20">
            Sair da mesa
          </button>
          {table.owner && (
            <button
              disabled={!ready}
              onClick={() => send({ t: 'startMatch' })}
              className="flex-[2] rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 py-3 font-display font-bold uppercase tracking-wider text-ink-950 hover:brightness-110 disabled:opacity-40"
            >
              Começar partida
            </button>
          )}
        </div>
      </motion.section>

      <ChatBox title="Chat da mesa" lines={chat} onSend={(text) => sendChat('table', text)} className="w-80 shrink-0" />
    </div>
  );
}
