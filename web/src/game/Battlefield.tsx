import { AnimatePresence, LayoutGroup } from 'framer-motion';
import { useStore } from '../store';
import type { Permanent, Player } from '../types';
import { cx } from '../util';
import { GameCard } from './GameCard';
import { combatRoles } from './interaction';

type Props = { player: Player; mirrored: boolean };

/**
 * Campo de batalha de um jogador em duas fileiras: permanentes "ativas" (criaturas, artefatos...)
 * perto do centro da mesa e terrenos na borda — como no Arena/Phase.
 */
export function Battlefield({ player, mirrored }: Props) {
  const game = useStore((s) => s.game);
  const { attacking } = combatRoles(game);

  const all = player.battlefield;
  const attachedIds = new Set(all.filter((p) => p.attachedTo && all.some((h) => h.id === p.attachedTo)).map((p) => p.id));
  const roots = all.filter((p) => !attachedIds.has(p.id));
  const lands = roots.filter((p) => p.types.includes('LAND') && !p.types.includes('CREATURE'));
  const others = roots.filter((p) => !lands.includes(p));

  const attachmentsOf = (host: Permanent) => all.filter((p) => p.attachedTo === host.id);

  const front = (
    <Row key="front" className="min-h-[calc(var(--card-w)*1.45)]">
      {others.map((p) => (
        <Stacked key={p.id} host={p} attachments={attachmentsOf(p)} lift={attacking.has(p.id) ? (mirrored ? 26 : -26) : 0} />
      ))}
    </Row>
  );
  const back = (
    <Row key="back" className="min-h-[calc(var(--card-w)*1.1)]">
      {groupLands(lands).map((group) => (
        <LandPile key={group[0].id} lands={group} attachmentsOf={attachmentsOf} />
      ))}
    </Row>
  );

  return (
    <LayoutGroup id={`bf-${player.id}`}>
      <div className="flex h-full flex-col justify-center gap-2">{mirrored ? [back, front] : [front, back]}</div>
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

/** Terrenos iguais, desvirados e "simples" são empilhados num monte. */
function groupLands(lands: Permanent[]): Permanent[][] {
  const groups: Permanent[][] = [];
  const byKey = new Map<string, Permanent[]>();
  for (const l of lands) {
    const simple = !l.tapped && l.counters.length === 0 && !l.attachments?.length;
    if (!simple) {
      groups.push([l]);
      continue;
    }
    const key = l.name;
    let g = byKey.get(key);
    if (!g) {
      g = [];
      byKey.set(key, g);
      groups.push(g);
    }
    g.push(l);
  }
  return groups;
}

function LandPile({ lands, attachmentsOf }: { lands: Permanent[]; attachmentsOf: (p: Permanent) => Permanent[] }) {
  if (lands.length === 1) {
    return <Stacked host={lands[0]} attachments={attachmentsOf(lands[0])} lift={0} />;
  }
  const step = 0.14;
  return (
    <div className="relative" style={{ width: `calc(var(--card-w) * ${1 + step * (lands.length - 1)})` }}>
      {lands.map((l, i) => (
        <div key={l.id} className={i === 0 ? 'relative' : 'absolute top-0'} style={{ left: `calc(var(--card-w) * ${step * i})`, zIndex: i }}>
          <GameCard card={l} className="w-[var(--card-w)]" />
        </div>
      ))}
      <span className="absolute -bottom-2 right-0 z-20 rounded-full bg-black/80 px-1.5 text-[11px] font-semibold text-white ring-1 ring-white/20">
        ×{lands.length}
      </span>
    </div>
  );
}
