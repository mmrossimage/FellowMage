import { useEffect, useMemo, useState } from 'react';
import { DeckPicker } from '../screens/LobbyScreen';
import { useStore } from '../store';
import type { CreateTournamentOptions } from '../types';
import { Actions, Field, LAST_DECK, Modal, lsGet, lsSet } from './TableDialogs';
import { sortDecks } from './tables';

const LAST_TOURNEY = 'fm.onlineTournament';

const TIMING_LABEL: Record<string, string> = { BEGINNER: 'Iniciante (x2)', REGULAR: 'Normal (x1,5)', PROFESSIONAL: 'Profissional (x1)' };

/**
 * Novo torneio (NewTournamentDialog do cliente oficial): draft, selado ou construído, com as
 * coleções dos boosters, rodadas, vagas para IA e tempo de montagem do deck.
 */
export function CreateTournamentDialog({ onClose }: { onClose: () => void }) {
  const user = useStore((s) => s.user);
  const decks = useStore((s) => s.decks);
  const busy = useStore((s) => s.tableBusy);
  const options = useStore((s) => s.lobbyOptions);
  const send = useStore((s) => s.send);
  const createTournament = useStore((s) => s.createTournament);

  useEffect(() => {
    if (!options) send({ t: 'lobbyOptions' });
  }, [options, send]);

  const saved = useMemo<Partial<CreateTournamentOptions>>(() => {
    try {
      return JSON.parse(lsGet(LAST_TOURNEY) ?? '{}');
    } catch {
      return {};
    }
  }, []);
  const [o, setO] = useState<CreateTournamentOptions>(() => ({
    name: `${user ?? 'Mago'}'s tournament`,
    type: saved.type ?? '',
    players: saved.players ?? 4,
    ai: saved.ai ?? 0,
    packs: saved.packs ?? [],
    cube: saved.cube,
    timing: saved.timing ?? 'REGULAR',
    rounds: saved.rounds ?? 2,
    wins: saved.wins ?? 2,
    timeLimit: saved.timeLimit ?? 'NONE',
    constructMinutes: saved.constructMinutes ?? 20,
    password: '',
    spectators: saved.spectators ?? true,
    deckType: saved.deckType,
    gameType: saved.gameType,
    deck: lsGet(LAST_DECK) ?? '',
  }));
  const set = <K extends keyof CreateTournamentOptions>(k: K, v: CreateTournamentOptions[K]) => setO((p) => ({ ...p, [k]: v }));

  const types = options?.tournamentTypes ?? [];
  const type = types.find((t) => t.name === o.type) ?? types.find((t) => t.name.startsWith('Booster Draft')) ?? types[0];
  const sets = options?.boosterSets ?? [];
  const players = type ? Math.max(type.minPlayers, Math.min(type.maxPlayers, o.players)) : o.players;
  // número de pacotes = o do tipo de torneio (3 no draft, 6 no selado...); tipos aleatórios sorteiam
  const packCount = type?.limited && !type.cube && !type.jumpstart && !type.random ? type.boosters : 0;
  const packs = Array.from({ length: packCount }, (_, i) => o.packs[i] ?? o.packs[0] ?? sets[0]?.code ?? '');
  const constructedPool = useMemo(() => sortDecks(decks, o.deckType ?? ''), [decks, o.deckType]);
  const cube = o.cube ?? options?.draftCubes[0];

  const valid = !!type && (type.limited ? (type.cube ? !!cube : true) : !!o.deckType && !!o.gameType && constructedPool.includes(o.deck ?? ''));

  return (
    <Modal onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!type) return;
          const final: CreateTournamentOptions = {
            ...o,
            type: type.name,
            players,
            ai: Math.min(o.ai, players - 1),
            packs: type.random ? sets.slice(0, 20).map((s) => s.code) : packs,
            cube: type.cube ? cube : undefined,
            deckType: type.limited ? undefined : o.deckType,
            gameType: type.limited ? undefined : o.gameType,
            deck: type.limited ? undefined : o.deck,
          };
          lsSet(LAST_TOURNEY, JSON.stringify({ ...final, name: undefined, password: undefined, deck: undefined }));
          if (final.deck) lsSet(LAST_DECK, final.deck);
          createTournament(final);
        }}
      >
        <h2 className="font-display text-2xl font-bold text-ember-300">Novo torneio</h2>
        <p className="mt-1 text-sm text-white/50">Draft, selado ou construído. Fica aberto no lobby até lotar; você começa quando todos entrarem.</p>

        {!options ? (
          <p className="mt-6 text-white/60">Carregando as opções do servidor…</p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Nome" className="sm:col-span-2">
              <input value={o.name} onChange={(e) => set('name', e.target.value)} className="input" maxLength={60} />
            </Field>
            <Field label="Tipo de torneio" className="sm:col-span-2">
              <select value={type?.name ?? ''} onChange={(e) => set('type', e.target.value)} className="input">
                {types.map((t) => (
                  <option key={t.name}>{t.name}</option>
                ))}
              </select>
            </Field>
            <Field label={`Jogadores (${type?.minPlayers ?? 2}–${type?.maxPlayers ?? 8})`}>
              <input type="number" min={type?.minPlayers} max={type?.maxPlayers} value={players} onChange={(e) => set('players', Number(e.target.value))} className="input" />
            </Field>
            <Field label="Vagas para a IA">
              <select value={Math.min(o.ai, players - 1)} onChange={(e) => set('ai', Number(e.target.value))} className="input">
                {Array.from({ length: players }, (_, n) => (
                  <option key={n} value={n}>
                    {n === 0 ? 'Nenhuma' : `${n} IA${n > 1 ? 's' : ''}`}
                  </option>
                ))}
              </select>
            </Field>

            {type?.cube && (
              <Field label="Cubo" className="sm:col-span-2">
                <select value={cube} onChange={(e) => set('cube', e.target.value)} className="input">
                  {options.draftCubes.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            )}
            {packCount > 0 && (
              <div className="sm:col-span-2">
                <span className="mb-1 block text-xs uppercase tracking-wider text-white/50">Boosters ({packCount})</span>
                <div className="grid gap-2 sm:grid-cols-3">
                  {packs.map((p, i) => (
                    <select
                      key={i}
                      value={p}
                      onChange={(e) => {
                        // trocar o 1º pacote leva junto os que eram iguais a ele (atalho para "todos da mesma coleção")
                        const next = packs.map((v, j) => (j === i || (i === 0 && v === packs[0]) ? e.target.value : v));
                        set('packs', next);
                      }}
                      className="input"
                    >
                      {sets.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>
            )}
            {type?.random && <p className="text-sm text-white/60 sm:col-span-2">Boosters sorteados entre as coleções mais recentes.</p>}
            {type?.draft && (
              <Field label="Tempo por escolha no draft">
                <select value={o.timing} onChange={(e) => set('timing', e.target.value)} className="input">
                  {options.draftTimings.map((t) => (
                    <option key={t} value={t}>
                      {TIMING_LABEL[t] ?? t}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {type?.limited && (
              <Field label="Minutos para montar o deck">
                <input type="number" min={5} max={60} value={o.constructMinutes} onChange={(e) => set('constructMinutes', Number(e.target.value))} className="input" />
              </Field>
            )}
            {type && !type.limited && (
              <>
                <Field label="Formato do deck">
                  <select value={o.deckType ?? ''} onChange={(e) => set('deckType', e.target.value)} className="input">
                    <option value="">—</option>
                    {options.deckTypes.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Tipo de jogo">
                  <select value={o.gameType ?? ''} onChange={(e) => set('gameType', e.target.value)} className="input">
                    <option value="">—</option>
                    {options.tournamentGameTypes.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <DeckPicker title="Seu deck" decks={constructedPool} value={o.deck ?? ''} onChange={(d) => set('deck', d)} allowRandom={false} heightClass="h-40" />
                </div>
              </>
            )}

            {type && !type.elimination && (
              <Field label="Rodadas (suíço)">
                <input type="number" min={1} max={10} value={o.rounds} onChange={(e) => set('rounds', Number(e.target.value))} className="input" />
              </Field>
            )}
            <Field label="Cada partida">
              <select value={o.wins} onChange={(e) => set('wins', Number(e.target.value))} className="input">
                <option value={1}>Jogo único</option>
                <option value={2}>Melhor de 3</option>
                <option value={3}>Melhor de 5</option>
              </select>
            </Field>
            <Field label="Tempo de cada jogador">
              <select value={o.timeLimit} onChange={(e) => set('timeLimit', e.target.value)} className="input">
                {options.timeLimits.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.minutes ? `${t.minutes} minutos` : 'Sem limite'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Senha (opcional)">
              <input value={o.password} onChange={(e) => set('password', e.target.value)} className="input" placeholder="Aberto a todos" />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-white/75">
              <input type="checkbox" checked={o.spectators} onChange={(e) => set('spectators', e.target.checked)} />
              Permitir espectadores
            </label>
          </div>
        )}
        <Actions busy={busy} okLabel="Criar torneio" onCancel={onClose} disabled={!options || !valid} />
      </form>
    </Modal>
  );
}
