import { useEffect, useState } from 'react';
import { useStore } from '../store';

type Kind = 'attack' | 'block' | 'target';
type Arrow = { from: string; to: string; kind: Kind };
type Drawn = Arrow & { x1: number; y1: number; x2: number; y2: number };

const COLORS: Record<Kind, string> = {
  attack: '#ff5a5f',
  block: '#5fd3f5',
  target: '#ffb44d',
};

/**
 * Camada SVG por cima da mesa com setas de combate (quem ataca quem, quem bloqueia quem)
 * e de alvos dos objetos na pilha. Os pontos de origem/destino são elementos com data-obj="<uuid>".
 */
export function Arrows() {
  const game = useStore((s) => s.game);
  const hovered = useStore((s) => s.hovered);

  const arrows: Arrow[] = [];
  if (game) {
    for (const g of game.combat) {
      for (const a of g.attackers) arrows.push({ from: a, to: g.defenderId, kind: 'attack' });
      for (const b of g.blockers) for (const a of g.attackers) arrows.push({ from: b, to: a, kind: 'block' });
    }
    // alvos: objeto do topo da pilha sempre; outro objeto da pilha quando estiver sob o mouse
    const top = game.stack[game.stack.length - 1];
    const shown = new Set([top?.id, hovered].filter(Boolean) as string[]);
    for (const s of game.stack) {
      if (!shown.has(s.id)) continue;
      for (const t of s.targets ?? []) arrows.push({ from: s.id, to: t, kind: 'target' });
    }
  }
  const key = arrows.map((a) => `${a.kind}:${a.from}>${a.to}`).join('|');
  const drawn = useArrowPositions(arrows, key);

  if (!drawn.length) return null;
  return (
    <svg className="pointer-events-none fixed inset-0 z-[35] h-full w-full">
      <defs>
        {(Object.keys(COLORS) as Kind[]).map((k) => (
          <marker key={k} id={`head-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS[k]} />
          </marker>
        ))}
        <filter id="arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {drawn.map((a) => {
        const mx = (a.x1 + a.x2) / 2;
        const my = (a.y1 + a.y2) / 2;
        const dx = a.x2 - a.x1;
        const dy = a.y2 - a.y1;
        const len = Math.hypot(dx, dy) || 1;
        // curva para o lado, proporcional à distância
        const bend = Math.min(120, len * 0.25);
        const cx = mx - (dy / len) * bend;
        const cy = my + (dx / len) * bend;
        return (
          <path
            key={`${a.kind}:${a.from}>${a.to}`}
            d={`M ${a.x1} ${a.y1} Q ${cx} ${cy} ${a.x2} ${a.y2}`}
            fill="none"
            stroke={COLORS[a.kind]}
            strokeWidth={a.kind === 'block' ? 3 : 4}
            strokeDasharray={a.kind === 'target' ? '10 6' : undefined}
            strokeLinecap="round"
            markerEnd={`url(#head-${a.kind})`}
            filter="url(#arrow-glow)"
            opacity={0.9}
          />
        );
      })}
    </svg>
  );
}

/** Mede as posições na tela a cada quadro (as cartas se movem com animação). */
function useArrowPositions(arrows: Arrow[], key: string): Drawn[] {
  const [drawn, setDrawn] = useState<Drawn[]>([]);
  useEffect(() => {
    if (!arrows.length) {
      setDrawn([]);
      return;
    }
    let raf = 0;
    let prev = '';
    const center = (id: string) => {
      const el = document.querySelector(`[data-obj="${CSS.escape(id)}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const tick = () => {
      const res: Drawn[] = [];
      for (const a of arrows) {
        const p1 = center(a.from);
        const p2 = center(a.to);
        if (p1 && p2) res.push({ ...a, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      }
      const sig = res.map((d) => `${d.x1 | 0},${d.y1 | 0},${d.x2 | 0},${d.y2 | 0}`).join(';');
      if (sig !== prev) {
        prev = sig;
        setDrawn(res);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return drawn;
}
