import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { CardArt } from '../components/CardArt';
import { useStore } from '../store';
import type { DraftCard } from '../types';
import { cx, sanitizeHtml } from '../util';
import { ChatBox } from './ChatBox';

// o TournamentPanel oficial consulta o torneio a cada 2 s
const REFRESH_MS = 2000;

/** Painel do torneio: classificação, rodadas, situação atual e chat; entre as partidas o jogador espera aqui. */
export function TournamentScreen() {
  const tournament = useStore((s) => s.tournament)!;
  const chat = useStore((s) => s.chats.table);
  const send = useStore((s) => s.send);
  const sendChat = useStore((s) => s.sendChat);
  const info = tournament.info;

  useEffect(() => {
    send({ t: 'tournamentInfo' });
    const id = setInterval(() => send({ t: 'tournamentInfo' }), REFRESH_MS);
    return () => clearInterval(id);
  }, [send]);

  const quit = () => {
    if (tournament.over || confirm('Sair do torneio? Você desiste das rodadas restantes.')) send({ t: 'quitTournament' });
  };

  return (
    <div className="flex h-full min-h-0 gap-4 p-6">
      <section className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/45">Torneio</p>
            <h1 className="font-display text-3xl font-bold text-ember-300">{info?.name ?? 'Carregando…'}</h1>
            {info && (
              <p className="mt-1 text-sm text-white/55">
                {info.type} · <span className="text-arcane-300">{info.state}</span>
                {info.info && <span className="text-white/45"> · {info.info}</span>}
              </p>
            )}
          </div>
          <button onClick={quit} className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/20">
            {tournament.over ? 'Voltar ao lobby' : 'Sair do torneio'}
          </button>
        </div>

        {tournament.over && (
          <div className="rounded-xl border border-ember-400/40 bg-ember-500/10 px-4 py-3 text-ember-200" dangerouslySetInnerHTML={{ __html: sanitizeHtml(tournament.over) }} />
        )}

        <div className="rounded-xl border border-white/10 bg-ink-900/70">
          <div className="border-b border-white/10 px-4 py-2 font-display text-xs uppercase tracking-[0.2em] text-white/60">Classificação</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-white/45">
                <th className="px-4 py-2 font-normal">Jogador</th>
                <th className="px-2 py-2 font-normal">Pontos</th>
                <th className="px-2 py-2 font-normal">Resultados</th>
                <th className="px-4 py-2 font-normal">Situação</th>
              </tr>
            </thead>
            <tbody>
              {[...(info?.players ?? [])]
                .sort((a, b) => b.points - a.points)
                .map((p) => (
                  <tr key={p.name} className="border-t border-white/5">
                    <td className="px-4 py-2 font-semibold text-white">{p.name}</td>
                    <td className="px-2 py-2 tabular-nums text-ember-300">{p.points}</td>
                    <td className="px-2 py-2 text-white/70">{p.results}</td>
                    <td className="px-4 py-2 text-white/55">{p.state}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {info?.rounds.map((games, r) => (
          <div key={r} className="rounded-xl border border-white/10 bg-ink-900/70">
            <div className="border-b border-white/10 px-4 py-2 font-display text-xs uppercase tracking-[0.2em] text-white/60">Rodada {r + 1}</div>
            {games.map((g) => (
              <div key={g.matchId} className="flex items-center gap-3 border-t border-white/5 px-4 py-2 text-sm first:border-0">
                <span className="flex-1 text-white">{g.players}</span>
                <span className="text-white/55">{g.state}</span>
                <span className="w-40 text-right text-white/70">{g.result}</span>
              </div>
            ))}
          </div>
        ))}
      </section>

      <ChatBox title="Chat do torneio" lines={chat} onSend={(text) => sendChat('table', text)} className="w-80 shrink-0" />
    </div>
  );
}

/**
 * Draft (DraftPanel oficial): clique numa carta do booster para escolhê-la (duplo clique, ou clique
 * e depois "Escolher"). O relógio mostra o tempo da escolha; as escolhas feitas ficam embaixo.
 */
export function DraftScreen() {
  const draft = useStore((s) => s.draft)!;
  const send = useStore((s) => s.send);
  const setHovered = useStore((s) => s.setHovered);
  const [selected, setSelected] = useState<string>();
  const [now, setNow] = useState(Date.now());
  const booster = draft.booster ?? [];
  const picks = draft.picks ?? [];

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setSelected(undefined), [draft.since]);

  const left = draft.timeout ? Math.max(0, draft.timeout - Math.floor((now - draft.since) / 1000)) : null;
  const pick = (id: string) => {
    send({ t: 'draftPick', cardId: id });
    setSelected(undefined);
  };
  const sortedPicks = useMemo(() => [...picks].sort((a, b) => (a.mv ?? 0) - (b.mv ?? 0) || (a.name ?? '').localeCompare(b.name ?? '')), [picks]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full min-h-0 flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-2xl font-bold text-ember-300">Draft</div>
          <div className="text-sm text-white/55">
            Pacote {draft.boosterNum ?? '–'} · escolha {draft.cardNum ?? '–'}
            {draft.sets?.length ? ` · ${draft.sets.join(', ')}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {left !== null && booster.length > 0 && (
            <span className={cx('rounded-lg px-3 py-1.5 font-display text-lg tabular-nums', left <= 10 ? 'bg-blood-500/30 text-blood-400' : 'bg-white/10 text-white')}>⏱ {left}s</span>
          )}
          <button
            disabled={!selected}
            onClick={() => selected && pick(selected)}
            className="rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 px-6 py-2.5 font-display font-bold uppercase tracking-wider text-ink-950 disabled:opacity-40"
          >
            Escolher
          </button>
          <button onClick={() => confirm('Sair do draft e do torneio?') && send({ t: 'quitTournament' })} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm text-white ring-1 ring-white/15 hover:bg-white/20">
            Sair
          </button>
        </div>
      </header>

      <section className="min-h-0 flex-[3] overflow-y-auto rounded-xl bg-black/30 p-3 ring-1 ring-white/10">
        {booster.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
            {booster.map((c) => (
              <DraftCardButton
                key={c.id}
                card={c}
                selected={selected === c.id}
                onClick={() => setSelected(c.id)}
                onDoubleClick={() => pick(c.id)}
                onHover={setHovered}
              />
            ))}
          </div>
        ) : (
          <p className="p-8 text-center text-white/50">Aguardando o próximo booster…</p>
        )}
      </section>

      <section className="min-h-0 flex-[2] overflow-y-auto rounded-xl bg-black/20 p-3 ring-1 ring-white/5">
        <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Suas escolhas ({picks.length})</div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
          {sortedPicks.map((c) => (
            <CardArt key={c.id} card={{ name: c.name ?? '', set: c.set, num: c.num, colors: c.colors }} size="small" />
          ))}
        </div>
      </section>
    </motion.div>
  );
}

function DraftCardButton({
  card,
  selected,
  onClick,
  onDoubleClick,
}: {
  card: DraftCard;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onHover: (id?: string) => void;
}) {
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={`${card.name ?? ''} — ${card.type ?? ''}`}
      className={cx('relative rounded-[6%/4.5%] transition hover:-translate-y-1', selected && 'ring-4 ring-ember-400 shadow-playable')}
    >
      <CardArt card={{ name: card.name ?? '', set: card.set, num: card.num, colors: card.colors }} />
    </button>
  );
}
