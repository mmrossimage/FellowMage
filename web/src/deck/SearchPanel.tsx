import { useEffect, useRef, useState } from 'react';
import { CardArt } from '../components/CardArt';
import { useStore } from '../store';
import type { CardQuery, CatalogCard } from '../types';
import { cx } from '../util';

const TYPE_CHIPS: { key: string; label: string }[] = [
  { key: 'CREATURE', label: 'Criatura' },
  { key: 'INSTANT', label: 'Instantânea' },
  { key: 'SORCERY', label: 'Feitiço' },
  { key: 'ARTIFACT', label: 'Artefato' },
  { key: 'ENCHANTMENT', label: 'Encantamento' },
  { key: 'PLANESWALKER', label: 'Planeswalker' },
  { key: 'LAND', label: 'Terreno' },
  { key: 'BATTLE', label: 'Batalha' },
];
const MV_CHIPS = [0, 1, 2, 3, 4, 5, 6, 7];
const PAGE = 60;

type Props = {
  /** identidade do comandante (null = sem comandante ainda) */
  identity: string[] | null;
  inDeck: Map<string, number>;
  onAdd: (c: CatalogCard) => void;
  onCommander: (c: CatalogCard) => void;
  onHover: (c?: CatalogCard) => void;
  readOnly?: boolean;
};

/** Busca no catálogo do XMage (só cartas implementadas) com filtros pensados para Commander. */
export function SearchPanel({ identity, inDeck, onAdd, onCommander, onHover, readOnly }: Props) {
  const request = useStore((s) => s.request);
  const [text, setText] = useState('');
  const [searchRules, setSearchRules] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [mv, setMv] = useState<number | null>(null);
  const [onlyIdentity, setOnlyIdentity] = useState(true);
  const [commandersOnly, setCommandersOnly] = useState(false);
  const [sort, setSort] = useState<'name' | 'mv'>('name');
  const [results, setResults] = useState<CatalogCard[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  // sem comandante: sugerir a busca de comandantes
  useEffect(() => setCommandersOnly(identity === null), [identity === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = (offset: number): CardQuery => ({
    text,
    searchRules,
    types,
    mvMin: mv,
    mvMax: mv === null ? null : mv === 7 ? 99 : mv,
    identity: onlyIdentity && identity ? identity : null,
    commandersOnly,
    sort,
    offset,
    limit: PAGE,
  });

  const run = async (offset: number) => {
    const my = ++seq.current;
    setLoading(true);
    const r = await request({ t: 'searchCards', query: query(offset) }, 'cards');
    if (my !== seq.current) return; // resposta de uma busca antiga
    setLoading(false);
    setStatus(r.status);
    setTotal(r.result.total);
    setResults((prev) => (offset === 0 ? r.result.cards : [...prev, ...r.result.cards]));
    // catálogo ainda carregando no gateway: tentar de novo
    if (r.status !== 'pronto' && r.status.startsWith('carregando')) setTimeout(() => run(0), 1500);
  };

  useEffect(() => {
    const t = setTimeout(() => run(0), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, searchRules, types.join(), mv, onlyIdentity, commandersOnly, sort, identity?.join()]);

  const toggleType = (k: string) => setTypes(types.includes(k) ? types.filter((x) => x !== k) : [...types, k]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-white/5 p-4">
        <div className="flex gap-2">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={searchRules ? 'Buscar no nome, tipo e texto das regras…' : 'Buscar carta pelo nome…'}
            className="input flex-1"
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as 'name' | 'mv')} className="input w-36">
            <option value="name">Ordem: nome</option>
            <option value="mv">Ordem: custo</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Toggle on={searchRules} onClick={() => setSearchRules(!searchRules)} label="Buscar no texto" />
          <Toggle on={commandersOnly} onClick={() => setCommandersOnly(!commandersOnly)} label="👑 Só comandantes" />
          {identity && <Toggle on={onlyIdentity} onClick={() => setOnlyIdentity(!onlyIdentity)} label="Só na identidade do comandante" />}
          <span className="mx-1 h-4 w-px bg-white/10" />
          {TYPE_CHIPS.map((t) => (
            <Toggle key={t.key} on={types.includes(t.key)} onClick={() => toggleType(t.key)} label={t.label} small />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-white/40">Custo</span>
          {MV_CHIPS.map((n) => (
            <button
              key={n}
              onClick={() => setMv(mv === n ? null : n)}
              className={cx('h-7 w-7 rounded-full text-xs font-bold ring-1 transition', mv === n ? 'bg-arcane-500 text-ink-950 ring-arcane-300' : 'bg-black/30 text-white/60 ring-white/10 hover:text-white')}
            >
              {n === 7 ? '7+' : n}
            </button>
          ))}
          <span className="ml-auto text-xs text-white/40">
            {status && status !== 'pronto' ? `Catálogo: ${status}` : `${total.toLocaleString('pt-BR')} cartas`}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4" onMouseLeave={() => onHover(undefined)}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {results.map((c) => {
            const n = inDeck.get(c.name.toLowerCase()) ?? 0;
            return (
              <div key={c.name} className="group relative" onMouseEnter={() => onHover(c)}>
                <button disabled={readOnly} onClick={() => onAdd(c)} className="block w-full transition hover:-translate-y-1 disabled:cursor-default" title={readOnly ? c.name : `Adicionar ${c.name}`}>
                  <CardArt card={c} />
                </button>
                {n > 0 && (
                  <span className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-ember-500 px-1.5 text-xs font-bold text-ink-950 shadow">{n}</span>
                )}
                {!readOnly && c.canBeCommander && (
                  <button
                    onClick={() => onCommander(c)}
                    className="absolute left-1/2 top-[38%] -translate-x-1/2 rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-semibold text-amber-200 opacity-0 ring-1 ring-amber-300/50 transition hover:bg-amber-500 hover:text-ink-950 group-hover:opacity-100"
                  >
                    👑 Comandante
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {results.length < total && (
          <button onClick={() => run(results.length)} disabled={loading} className="mx-auto mt-4 block rounded-lg bg-white/10 px-6 py-2 text-sm text-white hover:bg-white/20 disabled:opacity-50">
            {loading ? 'Carregando…' : `Mostrar mais (${(total - results.length).toLocaleString('pt-BR')})`}
          </button>
        )}
        {!loading && results.length === 0 && status === 'pronto' && <p className="mt-10 text-center text-white/45">Nenhuma carta encontrada com esses filtros.</p>}
      </div>
    </div>
  );
}

function Toggle({ on, onClick, label, small }: { on: boolean; onClick: () => void; label: string; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'rounded-full ring-1 transition',
        small ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        on ? 'bg-ember-500/25 text-ember-300 ring-ember-400/60' : 'bg-black/30 text-white/60 ring-white/10 hover:text-white',
      )}
    >
      {label}
    </button>
  );
}
