import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useStore } from '../store';
import { promptHtml } from '../i18n';
import { cx, sanitizeHtml } from '../util';
import { SKIPS } from './GameMenu';

type Btn = { label: string; onClick: () => void; tone?: 'primary' | 'secondary' | 'danger'; hotkey?: string };

/** textos do botão especial enviados pelo XMage (Constants.Option.SPECIAL_BUTTON) */
const SPECIAL_LABELS: Record<string, string> = {
  'All attack': 'Atacar com todos',
};

/**
 * Barra de ação no canto inferior direito: mostra o pedido atual do servidor
 * e os botões equivalentes aos "esquerdo/direito/especial" do cliente XMage.
 */
export function ActionBar() {
  const prompt = useStore((s) => s.prompt);
  const waiting = useStore((s) => s.waiting);
  const game = useStore((s) => s.game);
  const respondBoolean = useStore((s) => s.respondBoolean);
  const respondString = useStore((s) => s.respondString);
  const action = useStore((s) => s.action);

  const opts = prompt?.options ?? {};
  const leftText = opts['UI.left.btn.text'] as string | undefined;
  const rightText = opts['UI.right.btn.text'] as string | undefined;

  const buttons: Btn[] = [];
  if (waiting && prompt) {
    switch (prompt.kind) {
      case 'ask':
        buttons.push({ label: leftText || 'Sim', onClick: () => respondBoolean(true), tone: 'primary', hotkey: 'Enter' });
        buttons.push({ label: rightText || 'Não', onClick: () => respondBoolean(false), tone: 'secondary' });
        break;
      case 'select': {
        const combatStep = opts['possibleAttackers'] || opts['possibleBlockers'];
        buttons.push({ label: rightText || (combatStep ? 'Concluir' : 'Passar'), onClick: () => respondBoolean(false), tone: 'primary', hotkey: 'Space' });
        break;
      }
      case 'target':
        if (leftText) buttons.push({ label: leftText, onClick: () => respondBoolean(true), tone: 'primary' });
        if (!prompt.flag || rightText) buttons.push({ label: rightText || 'Cancelar', onClick: () => respondBoolean(false), tone: 'secondary' });
        break;
      case 'playMana':
        buttons.push({ label: 'Cancelar', onClick: () => respondBoolean(false), tone: 'secondary' });
        break;
      case 'playXMana':
        buttons.push({ label: 'Concluir', onClick: () => respondBoolean(true), tone: 'primary', hotkey: 'Enter' });
        buttons.push({ label: 'Cancelar', onClick: () => respondBoolean(false), tone: 'secondary' });
        break;
    }
    // botão especial, como o FeedbackPanel do cliente oficial: aparece quando o pedido traz "specialButton"
    // (ex.: "All attack" ao declarar atacantes, HumanPlayer.selectAttackers) ou há ações especiais (game.special)
    const specialText = opts['specialButton'] as string | undefined;
    if ((specialText || game?.special) && ['select', 'target', 'playMana', 'playXMana'].includes(prompt.kind)) {
      buttons.push({ label: SPECIAL_LABELS[specialText ?? ''] ?? (specialText || 'Especial'), onClick: () => respondString('special'), tone: 'secondary' });
    }
  }

  const me = game?.players.find((p) => p.me);
  const myTurn = me?.id === game?.activePlayerId;
  // desfazer: o servidor guarda estados das próprias ações enquanto a pilha está vazia (botão Undo do cliente oficial)
  const canUndo = waiting && (me?.statesSaved ?? 0) > 0 && !game?.stack.length;
  // F2 só confirma (OK/Sim/Concluir/Passar), nunca cancela
  const f2Button = buttons.find((x) => x.tone === 'primary');

  // atalhos de teclado: Espaço = passar/concluir, Enter = confirmar, F2 = OK/Sim/Concluir (feedbackPanel.pressOKYesOrDone)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (canUndo) {
          e.preventDefault();
          action('UNDO');
        }
        return;
      }
      const b =
        e.key === 'F2'
          ? f2Button
          : buttons.find((x) => x.hotkey === (e.code === 'Space' ? 'Space' : e.key === 'Enter' ? 'Enter' : null));
      if (b) {
        e.preventDefault();
        b.onClick();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const message = prompt?.message ?? '';
  const second = opts['secondMessage'] as string | undefined;

  return (
    <div className="flex w-[min(380px,30vw)] flex-col items-stretch gap-2">
      <motion.div
        key={message}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={cx('rounded-xl border bg-ink-900/85 px-4 py-3 shadow-panel backdrop-blur', waiting ? 'border-ember-400/50' : 'border-white/10')}
      >
        <div className="text-sm font-medium text-white" dangerouslySetInnerHTML={{ __html: promptHtml(message) || '&nbsp;' }} />
        {second && <div className="mt-1 text-xs text-white/60" dangerouslySetInnerHTML={{ __html: sanitizeHtml(second) }} />}
        {waiting && prompt?.kind === 'playMana' && (
          <div className="mt-1 text-xs text-arcane-300">Clique nas fontes de mana destacadas (ou na sua reserva de mana) para pagar.</div>
        )}
        {!waiting && <div className="mt-1 text-xs text-white/40">Aguardando {game?.priorityPlayerName || 'oponente'}…</div>}
      </motion.div>

      <div className="flex gap-2">
        {buttons.map((b) => (
          <button
            key={b.label}
            onClick={b.onClick}
            className={cx(
              'flex-1 rounded-xl px-4 py-3 font-display text-sm font-bold uppercase tracking-wider shadow-panel transition active:scale-[0.98]',
              b.tone === 'primary' && 'bg-gradient-to-b from-ember-400 to-ember-500 text-ink-950 hover:brightness-110',
              b.tone === 'secondary' && 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20',
              b.tone === 'danger' && 'bg-blood-500 text-white',
            )}
          >
            {b.label}
            {hotkeyText(b, b === f2Button) && (
              <span className="ml-1.5 text-[10px] font-normal normal-case opacity-60">({hotkeyText(b, b === f2Button)})</span>
            )}
          </button>
        ))}
      </div>

      {canUndo && (
        <button
          onClick={() => action('UNDO')}
          className="rounded-lg bg-black/40 px-2 py-1.5 text-[11px] text-white/70 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
        >
          ↶ Desfazer última ação (Ctrl+Z)
        </button>
      )}

      {/* botões de passe do cliente oficial (GamePanel: btnCancelSkip, btnSkipToNextTurn...), sempre com a tecla;
          o F3 também cancela um passe já em andamento, então fica visível mesmo sem prioridade */}
      {!game?.watching && (
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          {QUICK_SKIPS.map((key) => {
            const s = SKIPS.find((x) => x.key === key)!;
            const enabled = key === 'F3' || (waiting && prompt?.kind === 'select');
            const label = key === 'F5' && !myTurn ? 'Até o fim do turno atual' : s.short;
            return (
              <QuickPass
                key={key}
                label={`${label} (${key})`}
                title={s.label}
                disabled={!enabled}
                highlight={key === 'F3'}
                onClick={() => action(s.action)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function hotkeyText(b: Btn, f2: boolean): string {
  const keys = [b.hotkey === 'Space' ? '␣' : b.hotkey === 'Enter' ? '↵' : b.hotkey, f2 ? 'F2' : undefined].filter(Boolean);
  return keys.join(' ');
}

/** os mesmos botões de passe da barra do cliente oficial (o F6 fica só no menu e no teclado, como lá) */
const QUICK_SKIPS = ['F3', 'F4', 'F5', 'F7', 'F9', 'F10', 'F11'];

function QuickPass({ label, title, onClick, disabled, highlight }: { label: string; title?: string; onClick: () => void; disabled?: boolean; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cx(
        'rounded-lg bg-black/40 px-2 py-1.5 ring-1 transition enabled:hover:bg-white/10 enabled:hover:text-white disabled:opacity-35',
        highlight ? 'text-ember-200 ring-ember-400/30' : 'text-white/70 ring-white/10',
      )}
    >
      {label}
    </button>
  );
}
