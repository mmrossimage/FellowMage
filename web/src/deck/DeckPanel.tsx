import { AnimatePresence, motion } from 'framer-motion';
import { CardArt, IdentityPips } from '../components/CardArt';
import { ManaCost } from '../game/CardFace';
import type { CatalogCard, EditorDeck } from '../types';
import { cx } from '../util';
import { CATEGORIES, DECK_SIZE, cardKey, categoryOf, colorPips, commanderIdentity, countCards, manaCurve, type Problem } from './deckRules';

type Props = {
  deck: EditorDeck;
  problems: Problem[];
  offIdentity: Set<string>;
  duplicates: Set<string>;
  readOnly?: boolean;
  onQty: (c: CatalogCard, delta: number) => void;
  onRemoveCommander: (c: CatalogCard) => void;
  onHover: (c?: CatalogCard) => void;
  onPickArt: (c: CatalogCard, commander: boolean) => void;
};

export function DeckPanel({ deck, problems, offIdentity, duplicates, readOnly, onQty, onRemoveCommander, onHover, onPickArt }: Props) {
  const total = countCards(deck);
  const groups = CATEGORIES.map((cat) => ({
    ...cat,
    cards: deck.cards.filter((c) => categoryOf(c) === cat.key).sort((a, b) => a.mv - b.mv || a.name.localeCompare(b.name)),
  })).filter((g) => g.cards.length);

  return (
    <div className="flex h-full min-h-0 flex-col" onMouseLeave={() => onHover(undefined)}>
      {/* comandante(s) */}
      <div className="border-b border-white/5 p-3">
        {deck.commanders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-400/30 p-4 text-center text-sm text-amber-100/60">
            👑 Sem comandante — use “Comandante” numa carta lendária da busca.
          </div>
        ) : (
          <div className={cx('grid gap-2', deck.commanders.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
            {deck.commanders.map((c) => (
              <div key={c.name} className="group relative h-24 overflow-hidden rounded-xl ring-1 ring-amber-400/40" onMouseEnter={() => onHover(c)}>
                <CardArt card={c} crop className="absolute inset-0 h-full w-full" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute inset-x-2 bottom-1.5 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-amber-200/80">Comandante</div>
                    <div className="truncate font-display text-sm font-bold text-white">{c.name}</div>
                  </div>
                  <IdentityPips identity={commanderIdentity(deck)} />
                </div>
                {!readOnly && (
                  <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <SmallBtn title="Trocar arte" onClick={() => onPickArt(c, true)}>🎨</SmallBtn>
                    <SmallBtn title="Remover comandante" onClick={() => onRemoveCommander(c)}>✕</SmallBtn>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* lista */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {groups.length === 0 && <p className="mt-6 text-center text-sm text-white/40">Clique nas cartas da busca para adicioná-las.</p>}
        {groups.map((g) => (
          <div key={g.key} className="mb-3">
            <div className="mb-1 flex items-baseline justify-between px-1 text-[11px] uppercase tracking-wider text-white/45">
              <span>{g.label}</span>
              <span>{g.cards.reduce((n, c) => n + (c.qty ?? 1), 0)}</span>
            </div>
            <AnimatePresence initial={false}>
              {g.cards.map((c) => {
                const k = cardKey(c);
                const bad = offIdentity.has(k) || duplicates.has(k) || c.unknown;
                return (
                  <motion.div
                    key={k + c.set + c.num}
                    layout
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    className={cx('group flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm', bad ? 'bg-blood-500/15 ring-1 ring-blood-500/40' : 'hover:bg-white/5')}
                    onMouseEnter={() => onHover(c)}
                    title={c.unknown ? 'O XMage não conhece esta carta' : offIdentity.has(k) ? 'Fora da identidade de cor do comandante' : duplicates.has(k) ? 'Cópia repetida (Commander é singleton)' : undefined}
                  >
                    <span className="w-6 text-right font-semibold tabular-nums text-white/70">{c.qty ?? 1}</span>
                    <button disabled={readOnly} onClick={() => onPickArt(c, false)} className="min-w-0 flex-1 truncate text-left text-white/90 disabled:cursor-default" title="Trocar arte">
                      {c.name}
                    </button>
                    <ManaCost cost={c.cost} className="h-3.5" />
                    {!readOnly && (
                      <span className="flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                        <SmallBtn onClick={() => onQty(c, -1)} title="Remover uma">−</SmallBtn>
                        <SmallBtn onClick={() => onQty(c, 1)} title="Adicionar uma">+</SmallBtn>
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* estatísticas + validação */}
      <div className="border-t border-white/5 p-3">
        <Stats deck={deck} />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={cx('font-semibold tabular-nums', total === DECK_SIZE ? 'text-emerald-300' : 'text-ember-300')}>
            {total}/{DECK_SIZE} cartas
          </span>
          {problems.length === 0 ? <span className="text-emerald-300">✓ Deck válido para Commander</span> : <span className="text-white/50">{problems.length} aviso(s)</span>}
        </div>
        {problems.length > 0 && (
          <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto text-[11px]">
            {problems.map((p, i) => (
              <li key={i} className={p.level === 'error' ? 'text-blood-400' : 'text-ember-300'}>
                • {p.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stats({ deck }: { deck: EditorDeck }) {
  const curve = manaCurve(deck);
  const max = Math.max(1, ...curve);
  const lands = deck.cards.filter((c) => c.types.includes('LAND')).reduce((n, c) => n + (c.qty ?? 1), 0);
  const spells = deck.cards.filter((c) => !c.types.includes('LAND'));
  const nSpells = spells.reduce((n, c) => n + (c.qty ?? 1), 0);
  const avg = nSpells ? spells.reduce((n, c) => n + c.mv * (c.qty ?? 1), 0) / nSpells : 0;
  const pips = colorPips(deck);
  return (
    <div className="flex items-end gap-4">
      <div className="flex flex-1 items-end gap-1" title="Curva de mana (sem terrenos)">
        {curve.map((n, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
            <span className="text-[9px] tabular-nums text-white/40">{n || ''}</span>
            <div className="w-full rounded-t bg-gradient-to-t from-arcane-600 to-arcane-400" style={{ height: `${(n / max) * 40 + 2}px` }} />
            <span className="text-[9px] text-white/45">{i === 7 ? '7+' : i}</span>
          </div>
        ))}
      </div>
      <div className="space-y-0.5 text-right text-[11px] text-white/60">
        <div>
          <b className="text-white">{lands}</b> terrenos
        </div>
        <div>
          custo médio <b className="text-white">{avg.toFixed(2)}</b>
        </div>
        <div className="flex justify-end gap-1">
          {Object.entries(pips)
            .filter(([, n]) => n > 0)
            .map(([c, n]) => (
              <span key={c} className="flex items-center gap-0.5">
                <img src={`https://svgs.scryfall.io/card-symbols/${c}.svg`} className="h-3 w-3" alt={c} />
                {n}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}

function SmallBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-xs text-white ring-1 ring-white/15 hover:bg-white/20">
      {children}
    </button>
  );
}
