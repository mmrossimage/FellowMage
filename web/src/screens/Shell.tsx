import { AnimatePresence, motion } from 'framer-motion';
import { DeckEditor } from '../deck/DeckEditor';
import { useStore, type View } from '../store';
import { cx } from '../util';
import { DecksScreen } from './DecksScreen';
import { HomeScreen } from './HomeScreen';
import { LobbyScreen } from './LobbyScreen';

const NAV: { view: View; label: string; icon: string }[] = [
  { view: 'home', label: 'Início', icon: '🏠' },
  { view: 'play', label: 'Jogar', icon: '⚔️' },
  { view: 'decks', label: 'Decks', icon: '🃏' },
];

/** Estrutura do app fora da partida: barra lateral + tela atual. */
export function Shell() {
  const view = useStore((s) => s.view);
  const navigate = useStore((s) => s.navigate);
  const disconnect = useStore((s) => s.disconnect);
  const user = useStore((s) => s.user);
  const server = useStore((s) => s.server);
  const clientVersion = useStore((s) => s.clientVersion);
  const serverVersion = useStore((s) => s.serverVersion);
  const active = view === 'editor' ? 'decks' : view;

  return (
    <div className="flex h-full">
      <nav className="flex w-20 shrink-0 flex-col items-center gap-1 border-r border-white/5 bg-black/30 py-4">
        <div className="mb-4 font-display text-xl font-bold text-ember-300" title="FellowMage">
          FM
        </div>
        {NAV.map((n) => (
          <button
            key={n.view}
            onClick={() => navigate(n.view)}
            className={cx(
              'relative flex w-16 flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] transition',
              active === n.view ? 'text-white' : 'text-white/45 hover:bg-white/5 hover:text-white/80',
            )}
          >
            {active === n.view && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-white/10 ring-1 ring-white/10" />}
            <span className="relative text-xl">{n.icon}</span>
            <span className="relative font-medium">{n.label}</span>
          </button>
        ))}
        <div className="mt-auto px-1 text-center text-[10px] leading-tight text-white/35" title={[server, clientVersion && `Gateway: XMage ${clientVersion}`, serverVersion && `Servidor: ${serverVersion}`].filter(Boolean).join('\n')}>
          {user}
        </div>
        <button
          onClick={disconnect}
          title="Desconectar e voltar à tela de conexão (para trocar de servidor ou de nome)"
          className="mt-1 rounded-lg px-2 py-1 text-[11px] text-white/45 transition hover:bg-white/5 hover:text-white/80"
        >
          ⏻ Sair
        </button>
      </nav>

      <main className="relative min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {view === 'home' && <HomeScreen />}
            {view === 'play' && <LobbyScreen />}
            {view === 'decks' && <DecksScreen />}
            {view === 'editor' && <DeckEditor />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
