import { AnimatePresence, LayoutGroup } from 'framer-motion';
import { useStore } from '../store';
import type { Permanent, Player } from '../types';
import { cx } from '../util';
import { GameCard } from './GameCard';
import { combatRoles } from './interaction';

type Props = { player: Player; mirrored: boolean };

/** tokens iguais por monte: mais que isso fica difícil clicar num deles */
const TOKEN_PILE_MAX = 10;

/** ordem dos tipos na fileira do meio (permanentes que não são criatura nem terreno) */
const SUPPORT_ORDER = ['PLANESWALKER', 'BATTLE', 'ARTIFACT', 'ENCHANTMENT'];

/**
 * Campo de batalha de um jogador em fileiras por tipo, do centro da mesa para a borda:
 * criaturas, depois planeswalkers/batalhas/artefatos/encantamentos (só quando houver) e terrenos.
 * Dentro de cada fileira a ordem é a de entrada no campo; tokens idênticos viram montes de até 10.
 */
export function Battlefield({ player, mirrored }: Props) {
  const game = useStore((s) => s.game);
  const { attacking, blocking } = combatRoles(game);

  const all = player.battlefield;
  const attachedIds = new Set(all.filter((p) => p.attachedTo && all.some((h) => h.id === p.attachedTo)).map((p) => p.id));
  const roots = all.filter((p) => !attachedIds.has(p.id));
  const creatures = roots.filter((p) => p.types.includes('CREATURE'));
  const lands = roots.filter((p) => p.types.includes('LAND') && !p.types.includes('CREATURE'));
  const support = stableSort(
    roots.filter((p) => !creatures.includes(p) && !lands.includes(p)),
    (p) => {
      const i = SUPPORT_ORDER.findIndex((t) => p.types.includes(t));
      return i < 0 ? SUPPORT_ORDER.length : i;
    },
  );

  const attachmentsOf = (host: Permanent) => all.filter((p) => p.attachedTo === host.id);
  const liftOf = (p: Permanent) => (attacking.has(p.id) ? (mirrored ? 26 : -26) : 0);
  // monte de tokens: mesma carta e mesmo estado (virado, P/R, marcadores, dano, combate...), sem anexos
  const tokenKey = (p: Permanent) =>
    !p.token || attachmentsOf(p).length
      ? undefined
      : [p.name, p.set, p.num, p.tapped, p.power, p.toughness, p.damage, p.sick, p.selected, p.transformed, p.faceDown,
          attacking.has(p.id), blocking.has(p.id), p.counters.map((c) => `${c.name}:${c.count}`).sort().join(',')].join('|');
  // terrenos iguais, desvirados e "simples" já eram empilhados (sem limite: tanto faz qual deles é clicado)
  const landKey = (p: Permanent) => (p.token ? tokenKey(p) : !p.tapped && p.counters.length === 0 && !attachmentsOf(p).length ? p.name : undefined);

  const renderGroups = (groups: Permanent[][]) =>
    groups.map((g) => <Pile key={g[0].id} cards={g} attachmentsOf={attachmentsOf} lift={liftOf(g[0])} />);

  const front = (
    <Row key="front" className="min-h-[calc(var(--card-w)*1.45)]">
      {renderGroups(groupBy(creatures, tokenKey, TOKEN_PILE_MAX))}
    </Row>
  );
  const middle = support.length > 0 && (
    <Row key="middle" className="min-h-[calc(var(--card-w)*1.1)]">
      {renderGroups(groupBy(support, tokenKey, TOKEN_PILE_MAX))}
    </Row>
  );
  const back = (
    <Row key="back" className="min-h-[calc(var(--card-w)*1.1)]">
      {renderGroups(groupBy(lands, landKey, (key) => (key.includes('|') ? TOKEN_PILE_MAX : Infinity)))}
    </Row>
  );

  const rows = [front, middle, back].filter(Boolean);
  return (
    <LayoutGroup id={`bf-${player.id}`}>
      <div className={cx('flex h-full flex-col justify-center', support.length ? 'gap-1' : 'gap-2')}>{mirrored ? rows.reverse() : rows}</div>
    </LayoutGroup>
  );
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-center justify-center gap-x-[calc(var(--card-w)*0.18)] gap-y-2 px-4', className)}>
      <AnimatePresence mode="popLayout">{children}</AnimatePresence>
    </div>
  );
}

/** Permanente com auras/equipamentos aparecendo "atrás", levemente deslocados para cima. */
function Stacked({ host, attachments, lift }: { host: Permanent; attachments: Permanent[]; lift: number }) {
  const offset = 0.16;
  return (
    <div className="relative" style={{ paddingTop: `calc(var(--card-w) * ${offset * attachments.length})` }}>
      {attachments.map((a, i) => (
        <div key={a.id} className="absolute left-0" style={{ top: `calc(var(--card-w) * ${offset * i})`, zIndex: i }}>
          <GameCard card={a} className="w-[var(--card-w)]" />
        </div>
      ))}
      <div className="relative" style={{ zIndex: attachments.length + 1 }}>
        <GameCard card={host} lift={lift} className="w-[var(--card-w)]" />
      </div>
    </div>
  );
}

/**
 * Agrupa na ordem da primeira aparição. Sem chave, a permanente fica sozinha; um grupo cheio
 * (`max`) abre outro logo em seguida.
 */
export function groupBy<T>(items: T[], keyOf: (item: T) => string | undefined, max: number | ((key: string) => number)): T[][] {
  const groups: T[][] = [];
  const open = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === undefined) {
      groups.push([item]);
      continue;
    }
    const limit = typeof max === 'number' ? max : max(key);
    let g = open.get(key);
    if (!g || g.length >= limit) {
      g = [];
      open.set(key, g);
      groups.push(g);
    }
    g.push(item);
  }
  return groups;
}

function stableSort<T>(items: T[], rank: (item: T) => number): T[] {
  return items
    .map((item, i) => ({ item, i, r: rank(item) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item);
}

/** Monte de cartas iguais: cada uma aparece deslocada para o lado e continua clicável. */
function Pile({ cards, attachmentsOf, lift }: { cards: Permanent[]; attachmentsOf: (p: Permanent) => Permanent[]; lift: number }) {
  if (cards.length === 1) {
    return <Stacked host={cards[0]} attachments={attachmentsOf(cards[0])} lift={lift} />;
  }
  const step = cards[0].token ? 0.18 : 0.14;
  return (
    <div className="relative" style={{ width: `calc(var(--card-w) * ${1 + step * (cards.length - 1)})` }}>
      {cards.map((c, i) => (
        <div key={c.id} className={i === 0 ? 'relative' : 'absolute top-0'} style={{ left: `calc(var(--card-w) * ${step * i})`, zIndex: i }}>
          <GameCard card={c} lift={lift} className="w-[var(--card-w)]" />
        </div>
      ))}
      <span
        className="pointer-events-none absolute -bottom-2 right-0 z-20 rounded-full bg-black/80 px-1.5 text-[11px] font-semibold text-white ring-1 ring-white/20"
        title={cards[0].token ? `${cards.length} tokens iguais` : undefined}
      >
        ×{cards.length}
      </span>
    </div>
  );
}
