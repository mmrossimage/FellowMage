import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore, type GamePrefs } from '../store';
import { cx } from '../util';

/** Passes de prioridade com as teclas de função do cliente oficial (GamePanel/PlayAreaPanel). */
export const SKIPS: { key: string; action: string; label: string }[] = [
  { key: 'F4', action: 'PASS_PRIORITY_UNTIL_NEXT_TURN', label: 'Fases até o próximo turno' },
  { key: 'F5', action: 'PASS_PRIORITY_UNTIL_TURN_END_STEP', label: 'Fases até a próxima etapa final' },
  { key: 'F6', action: 'PASS_PRIORITY_UNTIL_NEXT_TURN_SKIP_STACK', label: 'Tudo até o próximo turno' },
  { key: 'F7', action: 'PASS_PRIORITY_UNTIL_NEXT_MAIN_PHASE', label: 'Fases até a próxima fase principal' },
  { key: 'F9', action: 'PASS_PRIORITY_UNTIL_MY_NEXT_TURN', label: 'Tudo até o meu próximo turno' },
  { key: 'F10', action: 'PASS_PRIORITY_UNTIL_STACK_RESOLVED', label: 'Até a pilha resolver' },
  { key: 'F11', action: 'PASS_PRIORITY_UNTIL_END_STEP_BEFORE_MY_NEXT_TURN', label: 'Tudo até a etapa final antes do meu turno' },
  { key: 'F3', action: 'PASS_PRIORITY_CANCEL_ALL_ACTIONS', label: 'Cancelar passes automáticos' },
];

const ROLLBACKS: { turns: number; label: string }[] = [
  { turns: 0, label: 'Ao início do turno atual' },
  { turns: 1, label: 'Ao início do turno anterior' },
  { turns: 2, label: 'Turno atual e os 2 anteriores' },
  { turns: 3, label: 'Turno atual e os 3 anteriores' },
];

/** Teclas F3–F11 durante a partida, como no cliente oficial. */
export function useSkipHotkeys() {
  const action = useStore((s) => s.action);
  const watching = useStore((s) => s.game?.watching);
  useEffect(() => {
    if (watching) return;
    const onKey = (e: KeyboardEvent) => {
      const skip = SKIPS.find((s) => s.key === e.key);
      if (skip) {
        e.preventDefault();
        action(skip.action);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [action, watching]);
}

/** Menu da partida: passes, pagamento de mana, respostas automáticas, voltar turnos, mãos e conceder. */
export function GameMenu() {
  const game = useStore((s) => s.game);
  const action = useStore((s) => s.action);
  const prefs = useStore((s) => s.gamePrefs);
  const setPref = useStore((s) => s.setGamePref);
  const leaveGame = useStore((s) => s.leaveGame);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  if (!game) return null;
  const opponents = game.players.filter((p) => !p.me && !p.left);
  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  const toggle = (key: keyof GamePrefs) => () => setPref(key, !prefs[key]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cx('rounded-lg px-3 py-1.5 text-xs ring-1 ring-white/10 hover:bg-white/10 hover:text-white', open ? 'bg-white/10 text-white' : 'text-white/60')}
      >
        Menu ▾
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 top-9 z-[58] max-h-[80vh] w-80 overflow-y-auto rounded-xl border border-white/10 bg-ink-900/95 p-2 text-sm shadow-panel backdrop-blur"
          >
            {game.watching ? (
              <Section title="Espectador">
                {opponents.map((p) => (
                  <Item key={p.id} onClick={run(() => action('REQUEST_PERMISSION_TO_SEE_HAND_CARDS', p.id))}>
                    Pedir para ver a mão de {p.name}
                  </Item>
                ))}
                <Item onClick={run(leaveGame)}>Parar de assistir</Item>
              </Section>
            ) : (
              <>
                <Section title="Passar prioridade">
                  {SKIPS.map((s) => (
                    <Item key={s.key} hint={s.key} onClick={run(() => action(s.action))}>
                      {s.label}
                    </Item>
                  ))}
                  <Check checked={prefs.holdPriority} onClick={toggle('holdPriority')}>
                    Segurar prioridade (responder às próprias mágicas)
                  </Check>
                </Section>
                <Section title="Pagamento de mana">
                  <Check checked={prefs.manaAuto} onClick={toggle('manaAuto')}>Automático</Check>
                  <Check checked={prefs.manaAutoRestricted} onClick={toggle('manaAutoRestricted')}>Não usar sozinho a mana que já está na reserva</Check>
                  <Check checked={prefs.firstManaAbility} onClick={toggle('firstManaAbility')}>Usar a primeira habilidade de mana ao virar terrenos</Check>
                </Section>
                <Section title="Respostas automáticas">
                  <Item onClick={run(() => action('RESET_AUTO_SELECT_REPLACEMENT_EFFECTS'))}>Efeitos de substituição: esquecer escolhas</Item>
                  <Item onClick={run(() => action('TRIGGER_AUTO_ORDER_RESET_ALL'))}>Habilidades desencadeadas: esquecer a ordem</Item>
                  <Item onClick={run(() => action('REQUEST_AUTO_ANSWER_RESET_ALL'))}>Perguntas sim/não: esquecer respostas</Item>
                </Section>
                {game.rollbackAllowed && (
                  <Section title="Voltar turnos (pede aos outros jogadores)">
                    {ROLLBACKS.filter((r) => r.turns < game.turn).map((r) => (
                      <Item key={r.turns} onClick={run(() => confirm(`${r.label}?`) && action('ROLLBACK_TURNS', r.turns))}>
                        {r.label}
                      </Item>
                    ))}
                  </Section>
                )}
                <Section title="Cartas na mão">
                  {opponents.map((p) => (
                    <Item key={p.id} onClick={run(() => action('REQUEST_PERMISSION_TO_SEE_HAND_CARDS', p.id))}>
                      Pedir para ver a mão de {p.name}
                    </Item>
                  ))}
                  <Check checked={prefs.allowHandRequests} onClick={toggle('allowHandRequests')}>Aceitar pedidos para ver minha mão</Check>
                  <Item onClick={run(() => action('REVOKE_PERMISSIONS_TO_SEE_HAND_CARDS'))}>Revogar quem já pode ver minha mão</Item>
                </Section>
                <Section title="Conceder">
                  <Item onClick={run(() => confirm('Conceder este jogo?') && action('CONCEDE'))}>Este jogo</Item>
                  <Item onClick={run(() => confirm('Conceder a partida inteira (todos os jogos restantes)?') && leaveGame())}>A partida inteira</Item>
                </Section>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-white/5 py-1.5 last:border-0">
      <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-white/40">{title}</div>
      {children}
    </div>
  );
}

function Item({ children, onClick, hint }: { children: ReactNode; onClick: () => void; hint?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-white/80 hover:bg-white/10 hover:text-white">
      <span>{children}</span>
      {hint && <span className="text-[10px] text-white/40">{hint}</span>}
    </button>
  );
}

function Check({ children, checked, onClick }: { children: ReactNode; checked: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-white/80 hover:bg-white/10 hover:text-white">
      <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]', checked ? 'border-ember-400 bg-ember-500 text-ink-950' : 'border-white/30')}>
        {checked && '✓'}
      </span>
      <span>{children}</span>
    </button>
  );
}
