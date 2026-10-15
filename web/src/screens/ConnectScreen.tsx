import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useStore } from '../store';

let autoConnectTried = false;

export function ConnectScreen() {
  const connect = useStore((s) => s.connect);
  const status = useStore((s) => s.status);
  const [host, setHost] = useState(() => localStorageGet('fm.host') ?? 'localhost');
  const [port, setPort] = useState(() => localStorageGet('fm.port') ?? '17171');
  const [user, setUser] = useState(() => localStorageGet('fm.user') ?? '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorageSet('fm.host', host);
    localStorageSet('fm.port', port);
    localStorageSet('fm.user', user);
    localStorageSet('fm.auto', user ? '1' : '0');
    connect(host, Number(port), user);
  };

  // ao recarregar a página: entra direto (e retoma a partida, se houver).
  // Uma vez só por carregamento — o StrictMode monta o componente duas vezes em dev, e duas
  // conexões simultâneas do mesmo usuário fazem o servidor XMage derrubar uma delas.
  useEffect(() => {
    if (autoConnectTried) return;
    autoConnectTried = true;
    if (status === 'offline' && user && localStorageGet('fm.auto') === '1') connect(host, Number(port), user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-900/80 p-8 shadow-panel backdrop-blur"
      >
        <h1 className="font-display text-4xl font-bold tracking-wide text-ember-300">FellowMage</h1>
        <p className="mt-1 text-sm text-white/60">Um cliente moderno para servidores XMage.</p>

        <div className="mt-8 space-y-4">
          <Field label="Seu nome">
            <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Mago" className="input" maxLength={14} />
          </Field>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label="Servidor XMage">
              <input value={host} onChange={(e) => setHost(e.target.value)} className="input" />
            </Field>
            <Field label="Porta">
              <input value={port} onChange={(e) => setPort(e.target.value)} className="input" inputMode="numeric" />
            </Field>
          </div>
        </div>

        <button
          disabled={status === 'connecting'}
          className="mt-8 w-full rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 py-3 font-display font-bold uppercase tracking-wider text-ink-950 transition hover:brightness-110 disabled:opacity-60"
        >
          {status === 'connecting' ? 'Conectando…' : 'Entrar'}
        </button>
      </motion.form>
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
