import { motion } from 'framer-motion';
import { useState } from 'react';
import { MoxfieldMissingDialog } from '../deck/MoxfieldMissingDialog';
import { CardArt, IdentityPips } from '../components/CardArt';
import { useStore } from '../store';
import type { DeckSummary, MoxfieldLink } from '../types';

function formatWhen(iso?: string | null) {
  if (!iso) return 'desconhecida';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Selo no canto do deck vinculado ao Moxfield: abre o link, atualiza agora e mostra erros/cartas não reconhecidas. */
function MoxfieldBadge({ deck, link }: { deck: DeckSummary; link: MoxfieldLink }) {
  const path = deck.path;
  const busy = useStore((s) => s.moxfieldBusy === path);
  const sync = useStore((s) => s.syncMoxfield);
  const [open, setOpen] = useState(false);
  const pending = link.missing.filter((m) => !m.substitute);
  const substituted = link.missing.length - pending.length;
  const warn = !!link.error || pending.length > 0;
  const details = [
    link.error && `⚠ ${link.error}`,
    pending.length > 0 && `⚠ Fora do XMage: ${pending.map((m) => m.name).join(', ')}`,
    substituted > 0 && `${substituted} carta(s) substituída(s)`,
  ].filter(Boolean);
  const title = [`Sincronizado com o Moxfield`, `Alterado no Moxfield em ${formatWhen(link.updated)}`, ...details].join('\n');
  return (
    <div className="absolute right-2 top-2 flex items-center gap-1">
      {(warn || link.missing.length > 0) && (
        <button
          onClick={() => setOpen(true)}
          title={`${details.join('\n')}\nClique para escolher substitutos`}
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold backdrop-blur ${
            warn ? 'bg-ember-500/90 text-ink-950 hover:bg-ember-400' : 'bg-black/60 text-white/70 hover:text-white'
          }`}
        >
          {warn ? `⚠ ${link.error && !pending.length ? 'erro' : pending.length}` : `⇄ ${substituted}`}
        </button>
      )}
      <a
        href={link.url}
        target="_blank"
        rel="noreferrer"
        title={title}
        className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/80 backdrop-blur hover:text-white"
      >
        Moxfield
      </a>
      <button
        onClick={() => sync(path)}
        disabled={busy}
        title="Atualizar agora a partir do Moxfield"
        className="rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white/80 backdrop-blur hover:text-white disabled:opacity-60"
      >
        <span className={busy ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
      </button>
      {open && <MoxfieldMissingDialog deck={deck} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function HomeScreen() {
  const user = useStore((s) => s.user);
  const userDecks = useStore((s) => s.userDecks);
  const navigate = useStore((s) => s.navigate);
  const mode = useStore((s) => s.mode);

  return (
    <div className="h-full overflow-y-auto">
      {/* destaque */}
      <section className="relative overflow-hidden border-b border-white/5 px-10 pb-10 pt-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_400px_at_20%_0%,rgba(245,154,27,.18),transparent_60%),radial-gradient(700px_400px_at_90%_30%,rgba(40,184,230,.14),transparent_60%)]" />
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative">
          <p className="text-sm uppercase tracking-[0.3em] text-white/45">Bem-vindo de volta{user ? `, ${user}` : ''}</p>
          <h1 className="mt-2 font-display text-5xl font-bold text-white">
            Fellow<span className="text-ember-300">Mage</span>
          </h1>
          <p className="mt-3 max-w-xl text-white/60">Commander com até 4 jogadores, regras completas do XMage e uma mesa feita para ser bonita.</p>

          <div className="mt-8 grid max-w-4xl grid-cols-3 gap-4">
            <BigAction
              title={mode === 'online' ? 'Jogar online' : 'Jogar Commander'}
              desc={mode === 'online' ? 'Mesas de outros jogadores' : 'Você contra 3 IAs'}
              icon="⚔️"
              primary
              onClick={() => navigate('play')}
            />
            <BigAction title="Novo deck" desc="Monte do zero no editor" icon="✨" onClick={() => navigate('editor', { editor: { path: null } })} />
            <BigAction title="Importar lista" desc="Moxfield, Archidekt, Arena…" icon="📋" onClick={() => navigate('decks')} />
          </div>
        </motion.div>
      </section>

      {/* meus decks */}
      <section className="px-10 py-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold text-white">Meus decks</h2>
          <button onClick={() => navigate('decks')} className="text-sm text-arcane-300 hover:text-arcane-300/80">
            Ver todos →
          </button>
        </div>
        {userDecks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-white/50">
            Você ainda não tem decks próprios. Crie um no editor ou importe uma lista.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {userDecks.slice(0, 8).map((d) => (
              <DeckTile key={d.path} deck={d} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BigAction({ title, desc, icon, primary, onClick }: { title: string; desc: string; icon: string; primary?: boolean; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={
        primary
          ? 'rounded-2xl bg-gradient-to-br from-ember-400 to-ember-500 p-5 text-left text-ink-950 shadow-panel'
          : 'rounded-2xl bg-white/5 p-5 text-left text-white ring-1 ring-white/10 hover:bg-white/10'
      }
    >
      <div className="text-2xl">{icon}</div>
      <div className="mt-2 font-display text-lg font-bold">{title}</div>
      <div className={primary ? 'text-sm text-ink-950/70' : 'text-sm text-white/55'}>{desc}</div>
    </motion.button>
  );
}

/** Cartão de deck com a arte do comandante ao fundo. */
export function DeckTile({ deck, onDelete }: { deck: DeckSummary; onDelete?: () => void }) {
  const navigate = useStore((s) => s.navigate);
  const cmd = deck.commanders?.[0];
  return (
    <motion.div whileHover={{ y: -3 }} className="group relative h-40 overflow-hidden rounded-2xl ring-1 ring-white/10">
      {cmd ? <CardArt card={cmd} crop className="absolute inset-0 h-full w-full" /> : <div className="absolute inset-0 bg-gradient-to-br from-ink-700 to-ink-900" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
      {deck.moxfield && <MoxfieldBadge deck={deck} link={deck.moxfield} />}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-display font-bold text-white">{deck.name}</div>
            <div className="truncate text-xs text-white/60">
              {deck.error ? '⚠ erro ao ler' : `${cmd?.name ?? 'sem comandante'} · ${deck.count ?? 0} cartas`}
            </div>
          </div>
          <IdentityPips identity={deck.identity} />
        </div>
        <div className="mt-2 flex gap-2 opacity-0 transition group-hover:opacity-100">
          <button onClick={() => navigate('play', { playDeck: deck.path })} className="flex-1 rounded-lg bg-ember-500 py-1.5 text-xs font-bold text-ink-950">
            Jogar
          </button>
          <button onClick={() => navigate('editor', { editor: { path: deck.path } })} className="flex-1 rounded-lg bg-white/15 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-white/25">
            Editar
          </button>
          {onDelete && (
            <button onClick={onDelete} className="rounded-lg bg-white/10 px-2 py-1.5 text-xs text-white/70 hover:bg-blood-500/60 hover:text-white" title="Apagar deck">
              🗑
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
