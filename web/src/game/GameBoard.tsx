import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useState, type CSSProperties } from 'react';
import { promptHtml } from '../i18n';
import { useStore } from '../store';
import type { Player } from '../types';
import { cx } from '../util';
import { ActionBar } from './ActionBar';
import { Arrows } from './Arrows';
import { Battlefield } from './Battlefield';
import { CardPreview } from './CardPreview';
import { ExileZones } from './ExileZones';
import { GameMenu, useSkipHotkeys } from './GameMenu';
import { TableBackground } from './TableBackground';
import { VisibleHands } from './VisibleHands';
import { seatsFromMe } from './commander';
import { PromptDialogs } from './Dialogs';
import { Hand, OpponentHand } from './Hand';
import { PhaseTracker } from './PhaseTracker';
import { PlayerBadge } from './PlayerBadge';
import { LogPanel, StackPanel } from './SidePanels';

export function GameBoard() {
  const game = useStore((s) => s.game);
  const send = useStore((s) => s.send);
  const result = useStore((s) => s.result);
  const gameOver = useStore((s) => s.gameOver);
  const leaveGame = useStore((s) => s.leaveGame);
  const replay = useStore((s) => s.replay);
  useSkipHotkeys();

  if (!game) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <div className="animate-pulse font-display text-xl text-white/70">Embaralhando os grimórios…</div>
        <button onClick={leaveGame} className="rounded-lg px-3 py-1.5 text-xs text-white/50 ring-1 ring-white/10 hover:bg-white/10 hover:text-white">
          Voltar ao lobby
        </button>
      </div>
    );
  }

  const [me, ...opponents] = seatsFromMe(game);
  const multiplayer = opponents.length > 1;

  return (
    <LayoutGroup>
      <div className="table-bg relative isolate grid h-full grid-cols-[1fr_minmax(240px,18vw)] grid-rows-[auto_minmax(0,1fr)] overflow-clip">
        <TableBackground />
        {/* z-40: o backdrop-blur cria um contexto de empilhamento próprio; sem z, os menus do cabeçalho
            (Menu, Paradas) ficam atrás dos painéis do tabuleiro */}
        <header className="relative z-40 col-span-2 flex items-center justify-between gap-4 border-b border-white/5 bg-black/30 px-5 py-1.5 backdrop-blur">
          <span className="hidden font-display text-lg font-bold tracking-wider text-ember-300 xl:inline">FellowMage</span>
          <PhaseTracker />
          <div className="flex gap-2">
            <VisibleHands />
            <GameMenu />
            {!game.watching && (
              <button
                onClick={() => confirm('Conceder este jogo?') && send({ t: 'concede' })}
                className="rounded-lg px-3 py-1.5 text-xs text-white/60 ring-1 ring-white/10 hover:bg-blood-500/20 hover:text-blood-400"
              >
                Conceder
              </button>
            )}
            {/* saída sempre disponível, como fechar a aba do jogo no cliente oficial (quitMatch) */}
            <button
              onClick={() => (gameOver || game.watching || replay || confirm('Sair da partida? Se ela ainda estiver em andamento, você a abandona.')) && leaveGame()}
              className="rounded-lg px-3 py-1.5 text-xs text-white/60 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
            >
              {replay ? 'Fechar replay' : game.watching ? 'Parar de assistir' : 'Sair'}
            </button>
          </div>
        </header>

        <main
          className={cx(
            'relative grid min-h-0 overflow-clip',
            multiplayer ? 'grid-rows-[minmax(0,1.05fr)_minmax(0,1fr)_auto]' : 'grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)_auto]',
          )}
        >
          {multiplayer ? (
            <section className="grid min-h-0 gap-2 px-3 pt-2" style={{ gridTemplateColumns: `repeat(${opponents.length}, minmax(0, 1fr))` }}>
              {opponents.map((p, i) => (
                <OpponentPod key={p.id} player={p} seat={i + 1} />
              ))}
            </section>
          ) : (
            opponents[0] && (
              <>
                <div className="relative flex items-start justify-between px-6 pt-3">
                  <PlayerBadge player={opponents[0]} align="top" />
                  <div className="absolute left-1/2 top-0 -translate-x-1/2">
                    <OpponentHand count={opponents[0].handCount} />
                  </div>
                  <div />
                </div>
                <section className="min-h-0">
                  <Battlefield player={opponents[0]} mirrored />
                </section>
              </>
            )
          )}

          <section className="relative min-h-0">
            <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-gradient-to-r from-transparent via-ember-300/40 to-transparent" />
            <Battlefield player={me} mirrored={false} />
          </section>

          <div className="relative grid min-h-[calc(var(--hand-w)*0.8)] grid-cols-[minmax(220px,auto)_1fr_auto] items-end gap-4 px-6 pb-4">
            <div className="relative z-30">
              <PlayerBadge player={me} align="bottom" />
            </div>
            <div className="relative h-full min-w-0">
              <Hand />
            </div>
            <div className="relative z-30">{replay ? <ReplayBar /> : <ActionBar />}</div>
          </div>
        </main>

        <aside className="flex min-h-0 flex-col gap-3 border-l border-white/5 bg-black/20 p-3">
          <TurnOrder players={seatsFromMe(game)} />
          <StackPanel />
          <ExileZones />
          <LogPanel />
        </aside>

        <Arrows />
        <CardPreview />
        <PromptDialogs />
        <EliminatedBanner me={me} />
        <AnimatePresence>{(result || gameOver) && <ResultOverlay />}</AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

/** Um oponente no multiplayer: retrato + campo de batalha em escala reduzida. */
function OpponentPod({ player, seat }: { player: Player; seat: number }) {
  const style = { '--card-w': 'calc(var(--base-card-w) * 0.6)' } as CSSProperties;
  return (
    <div
      className={cx(
        'relative flex min-h-0 flex-col rounded-2xl border bg-black/25 transition-colors',
        player.active ? 'border-ember-400/50 shadow-[0_0_30px_-10px_rgba(245,154,27,.5)]' : 'border-white/5',
        player.priority && !player.active && 'border-arcane-400/40',
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2 px-3 pt-2">
        <PlayerBadge player={player} align="top" compact />
        <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/40" title="Posição na ordem de turno a partir de você">
          {seat}º
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" style={style}>
        <Battlefield player={player} mirrored />
      </div>
    </div>
  );
}

/** Ordem de turno, com o jogador ativo e quem tem prioridade. */
function TurnOrder({ players }: { players: Player[] }) {
  if (players.length <= 2) return null;
  return (
    <section className="rounded-xl border border-white/10 bg-ink-900/70 p-2.5">
      <h3 className="mb-1.5 font-display text-[10px] uppercase tracking-[0.2em] text-white/50">Ordem de turno</h3>
      <ol className="space-y-1">
        {players.map((p) => (
          <li key={p.id} className={cx('flex items-center gap-2 rounded-md px-2 py-1 text-xs', p.active ? 'bg-ember-500/15 text-white' : 'text-white/65', p.left && 'line-through opacity-50')}>
            <span className={cx('h-2 w-2 rounded-full', p.priority ? 'bg-arcane-400 shadow-[0_0_6px_rgba(95,211,245,.9)]' : p.active ? 'bg-ember-400' : 'bg-white/15')} />
            <span className="flex-1 truncate">{p.me ? `${p.name} (você)` : p.name}</span>
            <span className={cx('tabular-nums font-semibold', p.life <= 10 ? 'text-blood-400' : 'text-white/80')}>{p.life}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** No multiplayer, quem perde sai do jogo mas a partida continua: oferecer assistir ou sair. */
function EliminatedBanner({ me }: { me: Player }) {
  const ended = useStore((s) => !!s.result || !!s.gameOver);
  const leaveGame = useStore((s) => s.leaveGame);
  const [dismissed, setDismissed] = useState(false);
  const out = me.left || me.life <= 0;
  if (!out || dismissed || ended) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed left-1/2 top-16 z-[55] flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-blood-500/40 bg-ink-900/95 px-6 py-4 shadow-panel backdrop-blur"
    >
      <div>
        <div className="font-display text-xl font-bold text-blood-400">Você foi eliminado</div>
        <div className="text-sm text-white/60">A partida continua entre os outros jogadores.</div>
      </div>
      <button onClick={() => setDismissed(true)} className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white ring-1 ring-white/15 hover:bg-white/20">
        Assistir
      </button>
      <button
        onClick={leaveGame}
        className="rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 px-4 py-2 text-sm font-semibold text-ink-950"
      >
        Sair da partida
      </button>
    </motion.div>
  );
}

/** Controles do replay gravado no servidor (pnlReplay do cliente oficial). */
function ReplayBar() {
  const send = useStore((s) => s.send);
  const step = (dir: string, moves?: number) => send({ t: 'replayStep', dir, moves });
  const btn = 'rounded-xl bg-white/10 px-4 py-3 text-lg text-white ring-1 ring-white/15 hover:bg-white/20';
  return (
    <div className="flex w-[min(380px,30vw)] flex-col gap-2 rounded-xl border border-arcane-400/30 bg-ink-900/85 p-3 shadow-panel">
      <div className="text-center font-display text-sm uppercase tracking-wider text-arcane-300">Replay</div>
      <div className="flex justify-center gap-2">
        <button onClick={() => step('prev')} className={btn} title="Jogada anterior">◀</button>
        <button onClick={() => step('next')} className={btn} title="Próxima jogada">▶</button>
        <button onClick={() => step('skip', 10)} className={btn} title="Avançar 10 jogadas">⏩</button>
        <button onClick={() => step('stop')} className={btn} title="Encerrar replay">■</button>
      </div>
    </div>
  );
}

function ResultOverlay() {
  const result = useStore((s) => s.result);
  const gameOver = useStore((s) => s.gameOver);
  const leaveGame = useStore((s) => s.leaveGame);
  const dismissResult = useStore((s) => s.dismissResult);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur">
      <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="text-center">
        {result ? (
          <>
            <div className={`font-display text-6xl font-bold ${result.won ? 'text-ember-300' : 'text-blood-400'}`}>{result.won ? 'Vitória' : 'Derrota'}</div>
            <p className="mt-3 text-white/70" dangerouslySetInnerHTML={{ __html: promptHtml(result.title) }} />
            <p className="text-white/50" dangerouslySetInnerHTML={{ __html: promptHtml(result.info) }} />
            {result.extra && <p className="text-white/50" dangerouslySetInnerHTML={{ __html: promptHtml(result.extra) }} />}
          </>
        ) : (
          // só o GAME_OVER chegou (o END_GAME_INFO vem da partida e pode faltar): como o "Close game" do cliente oficial
          <>
            <div className="font-display text-6xl font-bold text-ember-300">Fim de jogo</div>
            <p className="mt-3 text-white/70" dangerouslySetInnerHTML={{ __html: promptHtml(gameOver ?? '') }} />
          </>
        )}
        {result && !result.matchOver ? (
          // melhor de N: o próximo jogo começa depois do sideboard; sair aqui abandonaria a partida
          <div className="mt-8 flex justify-center gap-3">
            <button onClick={dismissResult} className="rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 px-8 py-3 font-display font-bold uppercase tracking-wider text-ink-950">
              Próximo jogo
            </button>
            <button
              onClick={() => confirm('Abandonar a partida? Os jogos restantes contam como derrota.') && leaveGame()}
              className="rounded-xl bg-white/10 px-6 py-3 text-sm text-white ring-1 ring-white/15 hover:bg-white/20"
            >
              Abandonar partida
            </button>
          </div>
        ) : (
          <button onClick={leaveGame} className="mt-8 rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 px-8 py-3 font-display font-bold uppercase tracking-wider text-ink-950">
            Voltar ao lobby
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
