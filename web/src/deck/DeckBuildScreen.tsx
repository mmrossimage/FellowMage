import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CardArt } from '../components/CardArt';
import { useStore } from '../store';
import type { BuildCard } from '../types';
import { cx, symbolUrl } from '../util';

const BASICS: { name: string; symbol: string }[] = [
  { name: 'Plains', symbol: 'W' },
  { name: 'Island', symbol: 'U' },
  { name: 'Swamp', symbol: 'B' },
  { name: 'Mountain', symbol: 'R' },
  { name: 'Forest', symbol: 'G' },
];

const TITLES = {
  sideboard: 'Sideboard entre os jogos',
  constructSideboard: 'Ajuste do deck limitado',
  construct: 'Monte seu deck',
};

/**
 * Montagem de deck pedida pelo servidor (SIDEBOARD / CONSTRUCT): clique numa carta para movê-la
 * entre o deck e o sideboard/pool. No limitado dá para somar terrenos básicos. O deck é guardado no
 * servidor a cada mudança (updateDeck) e enviado sozinho se o tempo acabar, como no editor oficial.
 */
export function DeckBuildScreen() {
  const build = useStore((s) => s.deckBuild)!;
  const send = useStore((s) => s.send);
  const all = useMemo(() => [...build.main, ...build.side], [build]);
  const [main, setMain] = useState<Set<string>>(() => new Set(build.main.map((c) => c.id)));
  const [basics, setBasics] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const sentFinal = useRef(false);

  useEffect(() => {
    setMain(new Set(build.main.map((c) => c.id)));
    setBasics({});
    sentFinal.current = false;
  }, [build]);

  const payload = () => ({ main: [...main], basics });

  // guarda no servidor a cada mudança: se o tempo acabar, vale o último deck enviado
  useEffect(() => {
    const t = setTimeout(() => send({ t: 'updateDeck', ...payload() }), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [main, basics]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = build.time > 0 ? Math.max(0, build.time - Math.floor((now - build.since) / 1000)) : null;

  const submit = () => {
    if (sentFinal.current) return;
    sentFinal.current = true;
    send({ t: 'submitDeck', ...payload() });
    setTimeout(() => (sentFinal.current = false), 3000); // permite tentar de novo se o servidor recusar
  };
  useEffect(() => {
    if (left === 0) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left === 0]);

  const mainCards = all.filter((c) => main.has(c.id));
  const sideCards = all.filter((c) => !main.has(c.id));
  const basicCount = Object.values(basics).reduce((a, b) => a + b, 0);
  const move = (id: string) =>
    setMain((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[57] flex flex-col bg-ink-950/97 backdrop-blur">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
        <div>
          <div className="font-display text-xl font-bold text-ember-300">{TITLES[build.mode]}</div>
          <div className="text-xs text-white/50">Clique numa carta para movê-la entre o deck e o {build.mode === 'construct' ? 'pool' : 'sideboard'}.</div>
        </div>
        <div className="flex items-center gap-3">
          {left !== null && (
            <span className={cx('rounded-lg px-3 py-1.5 font-display text-lg tabular-nums', left < 60 ? 'bg-blood-500/30 text-blood-400' : 'bg-white/10 text-white')}>
              ⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </span>
          )}
          <span className="text-sm text-white/70">
            Deck: <b className="text-white">{mainCards.length + basicCount}</b>
          </span>
          <button onClick={submit} className="rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 px-6 py-2.5 font-display font-bold uppercase tracking-wider text-ink-950">
            Pronto
          </button>
        </div>
      </header>

      {build.basics && (
        <div className="flex flex-wrap items-center gap-3 border-b border-white/5 px-5 py-2 text-sm text-white/70">
          <span>Terrenos básicos:</span>
          {BASICS.map((b) => (
            <span key={b.name} className="flex items-center gap-1 rounded-lg bg-black/40 px-2 py-1 ring-1 ring-white/10">
              <img src={symbolUrl(b.symbol)} className="h-4 w-4" alt={b.name} />
              <button className="px-1 text-white/60 hover:text-white" onClick={() => setBasics((s) => ({ ...s, [b.name]: Math.max(0, (s[b.name] ?? 0) - 1) }))}>
                −
              </button>
              <span className="w-5 text-center tabular-nums text-white">{basics[b.name] ?? 0}</span>
              <button className="px-1 text-white/60 hover:text-white" onClick={() => setBasics((s) => ({ ...s, [b.name]: (s[b.name] ?? 0) + 1 }))}>
                +
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-2">
        <Pile title="Deck" cards={mainCards} onClick={move} />
        <Pile title={build.mode === 'construct' ? 'Pool' : 'Sideboard'} cards={sideCards} onClick={move} />
      </div>
    </motion.div>
  );
}

/** Cartas agrupadas por nome e ordenadas por custo; clicar move uma cópia. */
function Pile({ title, cards, onClick }: { title: string; cards: BuildCard[]; onClick: (id: string) => void }) {
  const groups = useMemo(() => {
    const byName = new Map<string, BuildCard[]>();
    for (const c of cards) {
      const key = c.name ?? `${c.set}:${c.num}`;
      byName.set(key, [...(byName.get(key) ?? []), c]);
    }
    return [...byName.values()].sort((a, b) => {
      const la = a[0].types?.includes('LAND') ? 1 : 0;
      const lb = b[0].types?.includes('LAND') ? 1 : 0;
      return la - lb || (a[0].mv ?? 0) - (b[0].mv ?? 0) || (a[0].name ?? '').localeCompare(b[0].name ?? '');
    });
  }, [cards]);
  return (
    <section className="flex min-h-0 flex-col rounded-xl bg-black/30 ring-1 ring-white/10">
      <div className="border-b border-white/5 px-3 py-2 font-display text-sm text-white">
        {title} <span className="text-white/50">({cards.length})</span>
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2 overflow-y-auto p-3">
        {groups.map((g) => (
          <button key={g[0].id} onClick={() => onClick(g[0].id)} className="relative text-left transition hover:-translate-y-0.5" title={`${g[0].name ?? ''} — ${g[0].type ?? ''}`}>
            <CardArt card={{ name: g[0].name ?? '', set: g[0].set, num: g[0].num, colors: g[0].colors }} size="small" />
            {g.length > 1 && <span className="absolute right-1 top-1 rounded-full bg-ink-950/90 px-1.5 text-xs font-bold text-ember-300 ring-1 ring-ember-400/50">×{g.length}</span>}
          </button>
        ))}
        {!groups.length && <span className="col-span-full text-sm text-white/40">Vazio.</span>}
      </div>
    </section>
  );
}
