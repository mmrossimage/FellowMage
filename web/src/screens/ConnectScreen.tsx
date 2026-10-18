import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useStore, type Mode } from '../store';
import { sessionGet, sessionSet } from '../util';

let autoConnectTried = false;

const DEFAULT_ONLINE_HOST = 'beta.xmage.today';
const DEFAULT_PORT = '17171';
const isLocalHost = (h: string | null) => !h || h === 'localhost' || h === '127.0.0.1';

/** Escolha inicial: jogar online (servidor público, contra pessoas) ou contra a IA (servidor local). */
export function ConnectScreen() {
  const connect = useStore((s) => s.connect);
  const status = useStore((s) => s.status);
  const mode = useStore((s) => s.mode);
  const localServerStarting = useStore((s) => s.localServerStarting);
  const savedHost = localStorageGet('fm.host');
  const [host, setHost] = useState(() => (isLocalHost(savedHost) ? DEFAULT_ONLINE_HOST : savedHost!));
  const [port, setPort] = useState(() => localStorageGet('fm.port') ?? DEFAULT_PORT);
  const [user, setUser] = useState(() => localStorageGet('fm.user') ?? '');
  const busy = status === 'connecting';

  const start = (chosen: Mode) => {
    localStorageSet('fm.user', user);
    if (chosen === 'online') {
      localStorageSet('fm.host', host);
      localStorageSet('fm.port', port);
      connect(host, Number(port), user, 'online');
    } else {
      connect('127.0.0.1', 17171, user, 'local');
    }
  };

  // ao recarregar a página (F5) na mesma aba: volta direto, retomando a partida, se houver.
  // Uma vez só por carregamento — o StrictMode monta o componente duas vezes em dev, e duas
  // conexões simultâneas do mesmo usuário fazem o servidor XMage derrubar uma delas.
  useEffect(() => {
    if (autoConnectTried) return;
    autoConnectTried = true;
    const resume = sessionGet('fm.resume');
    if (status !== 'offline' || !resume) return;
    try {
      const r = JSON.parse(resume) as { host: string; port: number; user: string; mode: Mode };
      connect(r.host, r.port, r.user, r.mode);
    } catch {
      sessionSet('fm.resume', null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full items-center justify-center overflow-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl rounded-2xl border border-white/10 bg-ink-900/80 p-8 shadow-panel backdrop-blur"
      >
        <h1 className="font-display text-4xl font-bold tracking-wide text-ember-300">FellowMage</h1>
        <p className="mt-1 text-sm text-white/60">Um cliente moderno para servidores XMage.</p>

        <div className="mt-8 max-w-xs">
          <Field label="Seu nome">
            <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Mago" className="input" maxLength={14} />
          </Field>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start('online');
            }}
            className="flex flex-col rounded-xl border border-white/10 bg-black/25 p-5"
          >
            <h2 className="font-display text-xl font-bold text-white">🌐 Jogar online</h2>
            <p className="mt-1 text-sm text-white/55">Contra outras pessoas num servidor XMage público. Não precisa do servidor local.</p>
            <div className="mt-4 grid grid-cols-[1fr_90px] gap-3">
              <Field label="Servidor">
                <input value={host} onChange={(e) => setHost(e.target.value)} className="input" />
              </Field>
              <Field label="Porta">
                <input value={port} onChange={(e) => setPort(e.target.value)} className="input" inputMode="numeric" />
              </Field>
            </div>
            <div className="min-h-5 flex-1" />
            <button
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-b from-arcane-400 to-arcane-600 py-3 font-display font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {busy && mode === 'online' ? 'Conectando…' : 'Conectar'}
            </button>
          </form>

          <div className="flex flex-col rounded-xl border border-white/10 bg-black/25 p-5">
            <h2 className="font-display text-xl font-bold text-white">🤖 Jogar contra a IA</h2>
            <p className="mt-1 text-sm text-white/55">
              Liga o servidor XMage no seu computador. Leva cerca de 1 minuto; na primeira vez, alguns minutos para criar o banco de cartas.
            </p>
            {localServerStarting && (
              <p className="mt-3 text-sm text-ember-300">Iniciando o servidor local… a tela avança sozinha quando ele estiver pronto.</p>
            )}
            <div className="min-h-5 flex-1" />
            <button
              type="button"
              disabled={busy}
              onClick={() => start('local')}
              className="w-full rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 py-3 font-display font-bold uppercase tracking-wider text-ink-950 transition hover:brightness-110 disabled:opacity-60"
            >
              {busy && mode === 'local' ? (localServerStarting ? 'Iniciando servidor…' : 'Conectando…') : 'Iniciar servidor local'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-white/50">{label}</span>
      {children}
    </label>
  );
}

function localStorageGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function localStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* sem armazenamento: tudo bem */
  }
}
