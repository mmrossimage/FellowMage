import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { cardImageUrls } from '../cardImage';
import { useStore } from '../store';
import { DEFAULT_TABLE_BG, PRESETS, myCommanderName, resolveTableBg, type TableBg } from '../tableBg';
import type { CatalogCard } from '../types';
import { cx } from '../util';

const MODES: { id: TableBg['kind']; label: string; hint: string }[] = [
  { id: 'preset', label: 'Tema', hint: 'Um dos fundos prontos.' },
  { id: 'card', label: 'Arte de carta', hint: 'A ilustração de qualquer carta.' },
  { id: 'commander', label: 'Meu comandante', hint: 'A arte do seu comandante; fora do Commander, usa o tema.' },
  { id: 'random', label: 'Aleatório', hint: 'Um tema sorteado a cada partida.' },
];

/** Escolha do fundo da mesa; as mudanças valem na hora (por cima da partida dá para ver o resultado). */
export function TableBgDialog() {
  const open = useStore((s) => s.tableBgOpen);
  const setOpen = useStore((s) => s.setTableBgOpen);
  const bg = useStore((s) => s.tableBg);
  const setBg = useStore((s) => s.setTableBg);
  const game = useStore((s) => s.game);
  const gameId = useStore((s) => s.gameId);
  const update = (patch: Partial<TableBg>) => setBg({ ...bg, ...patch });
  const preview = resolveTableBg(bg, game, gameId);
  const commander = myCommanderName(game);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
        >
          <motion.div
            initial={{ scale: 0.96, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            className="max-h-[90vh] w-[min(680px,96vw)] overflow-y-auto rounded-2xl border border-white/10 bg-ink-900/95 p-6 shadow-panel"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-ember-300">Fundo da mesa</h2>
                <p className="mt-1 text-sm text-white/50">Só você vê. Fica salvo neste navegador.</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/50 hover:text-white">
                ✕
              </button>
            </div>

            {/* prévia em miniatura (útil fora da partida) */}
            <div className="relative mt-4 h-28 overflow-hidden rounded-xl ring-1 ring-white/10">
              <div className="absolute inset-0" style={{ background: preview.css }} />
              {preview.art && <div className="absolute -inset-4 bg-cover bg-center" style={{ backgroundImage: `url("${preview.art}")`, filter: bg.blur ? `blur(${bg.blur / 2}px)` : undefined }} />}
              <div className="absolute inset-0 bg-black" style={{ opacity: bg.dim / 100 }} />
              <div className="table-overlay absolute inset-0" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => update({ kind: m.id })}
                  title={m.hint}
                  className={cx('rounded-lg px-3 py-2 text-sm ring-1 transition', bg.kind === m.id ? 'bg-ember-500 text-ink-950 ring-ember-400' : 'bg-black/30 text-white/75 ring-white/10 hover:text-white')}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-white/45">
              {MODES.find((m) => m.id === bg.kind)?.hint}
              {bg.kind === 'commander' && (commander ? ` Agora: ${commander}.` : game ? ' Nesta partida você não tem comandante.' : '')}
            </p>

            {bg.kind === 'card' && <CardArtPicker value={bg.card} onPick={(c) => update({ card: c.name, cardSet: c.set, cardNum: c.num })} />}

            {bg.kind !== 'random' && (
              <div className="mt-4">
                <div className="mb-2 text-xs uppercase tracking-wider text-white/50">{bg.kind === 'preset' ? 'Tema' : 'Tema (enquanto a arte carrega, ou sem comandante)'}</div>
                <div className="grid grid-cols-4 gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => update({ preset: p.id })}
                      className={cx('relative h-14 overflow-hidden rounded-lg ring-2 transition', bg.preset === p.id ? 'ring-ember-400' : 'ring-transparent hover:ring-white/30')}
                      style={{ background: p.css }}
                    >
                      <span className="absolute bottom-1 left-2 text-[11px] font-semibold text-white/85 drop-shadow">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Slider label="Escurecer" value={bg.dim} min={0} max={80} unit="%" onChange={(dim) => update({ dim })} />
              <Slider label="Desfocar a arte" value={bg.blur} min={0} max={12} unit=" px" onChange={(blur) => update({ blur })} disabled={!preview.art} />
            </div>

            <div className="mt-6 flex justify-between">
              <button onClick={() => setBg(DEFAULT_TABLE_BG)} className="rounded-xl px-4 py-2 text-sm text-white/60 hover:text-white">
                Restaurar padrão
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl bg-gradient-to-b from-ember-400 to-ember-500 px-6 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-ink-950"
              >
                Pronto
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Slider({ label, value, min, max, unit, onChange, disabled }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className={cx('block', disabled && 'opacity-40')}>
      <span className="mb-1 flex justify-between text-xs uppercase tracking-wider text-white/50">
        {label}
        <span className="tabular-nums text-white/70">
          {value}
          {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-ember-400" />
    </label>
  );
}

/** Busca no catálogo de cartas do gateway; mostra o recorte da ilustração de cada resultado. */
function CardArtPicker({ value, onPick }: { value?: string; onPick: (card: CatalogCard) => void }) {
  const request = useStore((s) => s.request);
  const [text, setText] = useState(value ?? '');
  const [results, setResults] = useState<CatalogCard[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const r = await request({ t: 'searchCards', query: { text: q, sort: 'name', offset: 0, limit: 12 } }, 'cards');
      if (my === seq.current) setResults(r.result.cards);
    }, 250);
    return () => clearTimeout(t);
  }, [text, request]);

  return (
    <div className="mt-4">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar carta pelo nome…" className="input" />
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {results.map((c) => {
          const art = cardImageUrls({ name: c.name, set: c.set, num: c.num }, 'art_crop')[0];
          return (
            <button
              key={c.name}
              onClick={() => onPick(c)}
              className={cx('overflow-hidden rounded-lg text-left ring-2 transition', value === c.name ? 'ring-ember-400' : 'ring-transparent hover:ring-white/30')}
            >
              <div className="aspect-[4/3] bg-black/40 bg-cover bg-center" style={{ backgroundImage: art ? `url("${art}")` : undefined }} />
              <div className="truncate bg-black/50 px-1.5 py-1 text-[11px] text-white/80">{c.name}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
