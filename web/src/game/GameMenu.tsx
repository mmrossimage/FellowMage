import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useStore, type GamePrefs } from '../store';
import { cx } from '../util';

/** Passes de prioridade com as teclas de função do cliente oficial (GamePanel/PlayAreaPanel). */
export const SKIPS: { key: string; action: string; label: string; short: string }[] = [
  { key: 'F3', action: 'PASS_PRIORITY_CANCEL_ALL_ACTIONS', label: 'Cancelar passes automáticos', short: 'Cancelar passes' },
  { key: 'F4', action: 'PASS_PRIORITY_UNTIL_NEXT_TURN', label: 'Fases até o próximo turno', short: 'Próximo turno' },
  { key: 'F5', action: 'PASS_PRIORITY_UNTIL_TURN_END_STEP', label: 'Fases até a próxima etapa final', short: 'Até o fim do turno' },
  { key: 'F6', action: 'PASS_PRIORITY_UNTIL_NEXT_TURN_SKIP_STACK', label: 'Tudo até o próximo turno', short: 'Tudo até o próximo turno' },
  { key: 'F7', action: 'PASS_PRIORITY_UNTIL_NEXT_MAIN_PHASE', label: 'Fases até a próxima fase principal', short: 'Próxima fase principal' },
  { key: 'F9', action: 'PASS_PRIORITY_UNTIL_MY_NEXT_TURN', label: 'Tudo até o meu próximo turno', short: 'Até meu turno' },
  { key: 'F10', action: 'PASS_PRIORITY_UNTIL_STACK_RESOLVED', label: 'Até a pilha resolver', short: 'Resolver pilha' },
  { key: 'F11', action: 'PASS_PRIORITY_UNTIL_END_STEP_BEFORE_MY_NEXT_TURN', label: 'Tudo até a etapa final antes do meu turno', short: 'Etapa final antes do meu turno' },
];

/** Atalhos do cliente oficial que não são passes (GamePanel.installComponents). */
export const OTHER_HOTKEYS: { key: string; label: string }[] = [
  { key: 'F2', label: 'Confirmar o pedido atual (OK / Sim / Concluir)' },
  { key: 'Espaço', label: 'Passar / concluir' },
  { key: 'Enter', label: 'Confirmar' },
  { key: 'F12', label: 'Ir para o chat / voltar à mesa' },
  { key: 'Alt+1 (segurar)', label: 'Usar a primeira habilidade de mana ao virar terrenos' },
  { key: 'Ctrl+Z', label: 'Desfazer a última ação' },
];

const ROLLBACKS: { turns: number; label: string }[] = [
  { turns: 0, label: 'Ao início do turno atual' },
  { turns: 1, label: 'Ao início do turno anterior' },
  { turns: 2, label: 'Turno atual e os 2 anteriores' },
  { turns: 3, label: 'Turno atual e os 3 anteriores' },
];

const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

/** Teclas F3–F12 e Alt+1 durante a partida, como no cliente oficial. */
export function useSkipHotkeys() {
  const action = useStore((s) => s.action);
  const watching = useStore((s) => s.game?.watching);
  useEffect(() => {
    if (watching) return;
    let firstManaHeld = false;
    const onKey = (e: KeyboardEvent) => {
      // F12 também vale dentro do chat: entra e sai dele
      if (e.key === 'F12') {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>('[data-game-chat]');
        if (input && document.activeElement === input) input.blur();
        else input?.focus();
        return;
      }
      if (typing(e)) return;
      const skip = SKIPS.find((s) => s.key === e.key);
      if (skip) {
        e.preventDefault();
        action(skip.action);
        return;
      }
      // Alt+1 segurado: usa a primeira habilidade de mana ao virar terrenos (USE_FIRST_MANA_ABILITY_ON/OFF)
      if (e.altKey && e.code === 'Digit1' && !firstManaHeld) {
        e.preventDefault();
        firstManaHeld = true;
        action('USE_FIRST_MANA_ABILITY_ON');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (firstManaHeld && (e.code === 'Digit1' || e.key === 'Alt')) {
        firstManaHeld = false;
        action(useStore.getState().gamePrefs.firstManaAbility ? 'USE_FIRST_MANA_ABILITY_ON' : 'USE_FIRST_MANA_ABILITY_OFF');
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [action, watching]);
}

/** Menu da partida (botão "Menu" no cabeçalho). */
export function GameMenu() {
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
            <GameMenuContent onDone={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Menu de contexto da mesa: clique direito no tabuleiro, como o popup do PlayAreaPanel do cliente oficial
 * (é onde ficam "Rollback", passes e respostas automáticas). Com Shift, abre o menu normal do navegador.
 */
export function TableContextMenu({ children }: { children: ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    // só o botão esquerdo fecha: outro clique direito na mesa apenas reposiciona o menu
    const close = (e: MouseEvent) => {
      if (e.button === 0 && !ref.current?.contains(e.target as Node)) setPos(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPos(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [pos]);

  // mantém o menu dentro da janela
  useLayoutEffect(() => {
    if (!pos || !ref.current) return setPlace(null);
    const r = ref.current.getBoundingClientRect();
    setPlace({ left: Math.max(8, Math.min(pos.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(pos.y, window.innerHeight - r.height - 8)) });
  }, [pos]);

  return (
    <div
      className="contents"
      onContextMenu={(e) => {
        if (e.shiftKey) return;
        e.preventDefault();
        setPos({ x: e.clientX, y: e.clientY });
      }}
    >
      {children}
      {pos && (
        <div
          ref={ref}
          style={{ left: place?.left ?? pos.x, top: place?.top ?? pos.y, visibility: place ? 'visible' : 'hidden' }}
          className="fixed z-[70] max-h-[85vh] w-80 overflow-y-auto rounded-xl border border-white/10 bg-ink-900/95 p-2 text-sm shadow-panel backdrop-blur"
        >
          <GameMenuContent onDone={() => setPos(null)} />
        </div>
      )}
    </div>
  );
}

/** Conteúdo do menu: passes, pagamento de mana, respostas automáticas, voltar turnos, mãos, atalhos e conceder. */
function GameMenuContent({ onDone }: { onDone: () => void }) {
  const game = useStore((s) => s.game);
  const action = useStore((s) => s.action);
  const prefs = useStore((s) => s.gamePrefs);
  const setPref = useStore((s) => s.setGamePref);
  const leaveGame = useStore((s) => s.leaveGame);
  const setTableBgOpen = useStore((s) => s.setTableBgOpen);
  const [showKeys, setShowKeys] = useState(false);

  if (!game) return null;
  const opponents = game.players.filter((p) => !p.me && !p.left);
  const run = (fn: () => void) => () => {
    fn();
    onDone();
  };
  const toggle = (key: keyof GamePrefs) => () => setPref(key, !prefs[key]);

  if (game.watching) {
    return (
      <Section title="Espectador">
        {opponents.map((p) => (
          <Item key={p.id} onClick={run(() => action('REQUEST_PERMISSION_TO_SEE_HAND_CARDS', p.id))}>
            Pedir para ver a mão de {p.name}
          </Item>
        ))}
        <Item onClick={run(leaveGame)}>Parar de assistir</Item>
      </Section>
    );
  }

  return (
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
      <Section title="Voltar turnos (rollback; pede aos outros jogadores)">
        {game.rollbackAllowed ? (
          ROLLBACKS.filter((r) => r.turns < game.turn).map((r) => (
            <Item key={r.turns} onClick={run(() => confirm(`Voltar a partida: ${r.label.toLowerCase()}?`) && action('ROLLBACK_TURNS', r.turns))}>
              {r.label}
            </Item>
          ))
        ) : (
          <div className="px-2 py-1.5 text-xs text-white/40">Não permitido nesta mesa.</div>
        )}
      </Section>
      <Section title="Pagamento de mana">
        <Check checked={prefs.manaAuto} onClick={toggle('manaAuto')}>Automático</Check>
        <Check checked={prefs.manaAutoRestricted} onClick={toggle('manaAutoRestricted')}>Não usar sozinho a mana que já está na reserva</Check>
        <Check checked={prefs.firstManaAbility} onClick={toggle('firstManaAbility')}>Usar a primeira habilidade de mana ao virar terrenos (Alt+1)</Check>
      </Section>
      <Section title="Respostas automáticas">
        <Item onClick={run(() => action('RESET_AUTO_SELECT_REPLACEMENT_EFFECTS'))}>Efeitos de substituição: esquecer escolhas</Item>
        <Item onClick={run(() => action('TRIGGER_AUTO_ORDER_RESET_ALL'))}>Habilidades desencadeadas: esquecer a ordem</Item>
        <Item onClick={run(() => action('REQUEST_AUTO_ANSWER_RESET_ALL'))}>Perguntas sim/não: esquecer respostas</Item>
      </Section>
      <Section title="Cartas na mão">
        {opponents.map((p) => (
          <Item key={p.id} onClick={run(() => action('REQUEST_PERMISSION_TO_SEE_HAND_CARDS', p.id))}>
            Pedir para ver a mão de {p.name}
          </Item>
        ))}
        <Check checked={prefs.allowHandRequests} onClick={toggle('allowHandRequests')}>Aceitar pedidos para ver minha mão</Check>
        <Item onClick={run(() => action('REVOKE_PERMISSIONS_TO_SEE_HAND_CARDS'))}>Revogar quem já pode ver minha mão</Item>
      </Section>
      <Section title="Aparência">
        <Item onClick={run(() => setTableBgOpen(true))}>Fundo da mesa…</Item>
      </Section>
      <Section title="Atalhos">
        <Item onClick={() => setShowKeys(!showKeys)}>{showKeys ? 'Esconder atalhos' : 'Ver todos os atalhos'}</Item>
        {showKeys && (
          <div className="px-2 pb-1 text-xs text-white/60">
            {[...OTHER_HOTKEYS, ...SKIPS.map((s) => ({ key: s.key, label: s.label })), { key: 'Clique direito', label: 'Este menu, sobre a mesa' }].map((h) => (
              <div key={h.key + h.label} className="flex justify-between gap-2 py-0.5">
                <span>{h.label}</span>
                <span className="shrink-0 text-white/40">{h.key}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title="Conceder">
        <Item onClick={run(() => confirm('Conceder este jogo?') && action('CONCEDE'))}>Este jogo</Item>
        <Item onClick={run(() => confirm('Conceder a partida inteira (todos os jogos restantes)?') && leaveGame())}>A partida inteira</Item>
      </Section>
    </>
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
