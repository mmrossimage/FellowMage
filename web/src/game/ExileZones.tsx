import { useStore } from '../store';
import { ZoneCards } from './ZoneCards';

/** Exílios nomeados por efeitos, separados do exílio exibido no retrato do jogador. */
export function ExileZones() {
  const exiles = useStore((s) => s.game?.exiles ?? []);
  const visible = exiles.filter((zone) => zone.cards.length > 0);
  if (!visible.length) return null;

  return (
    <section className="max-h-[35vh] shrink-0 overflow-auto rounded-xl border border-white/10 bg-ink-900/80 p-3 shadow-panel">
      <h3 className="mb-2 font-display text-xs uppercase tracking-[0.2em] text-white/60">Exílio</h3>
      <div className="space-y-2">
        {visible.map((zone) => (
          <div key={zone.id} className="rounded-lg bg-black/30 p-2">
            <div className="text-xs font-semibold text-white/80">
              {zone.name} <span className="text-white/40">({zone.cards.length})</span>
            </div>
            <div className="mt-2"><ZoneCards cards={zone.cards} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}
