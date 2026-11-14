import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useStore } from '../store';
import { promptHtml } from '../i18n';
import { cx, sanitizeHtml } from '../util';

type Btn = { label: string; onClick: () => void; tone?: 'primary' | 'secondary' | 'danger'; hotkey?: string };

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
    if (game?.special && ['select', 'target', 'playMana', 'playXMana'].includes(prompt.kind)) {
      buttons.push({ label: (opts['specialButton'] as string) || 'Especial', onClick: () => respondString('special'), tone: 'secondary' });
    }
  }

  // atalhos de teclado: Espaço = passar/concluir, Enter = confirmar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const key = e.code === 'Space' ? 'Space' : e.key === 'Enter' ? 'Enter' : null;
      const b = key && buttons.find((x) => x.hotkey === key);
      if (b) {
        e.preventDefault();
        b.onClick();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const me = game?.players.find((p) => p.me);
  const myTurn = me?.id === game?.activePlayerId;
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
            {b.hotkey && <span className="ml-2 text-[10px] font-normal opacity-60">{b.hotkey === 'Space' ? '␣' : '↵'}</span>}
          </button>
        ))}
      </div>

      {/* desfazer: o servidor guarda estados das próprias ações enquanto a pilha está vazia (botão Undo do cliente oficial) */}
      {waiting && (me?.statesSaved ?? 0) > 0 && !game?.stack.length && (
        <button
          onClick={() => action('UNDO')}
          className="rounded-lg bg-black/40 px-2 py-1.5 text-[11px] text-white/70 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
        >
          ↶ Desfazer última ação
        </button>
      )}

      {waiting && prompt?.kind === 'select' && (
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <QuickPass
            label={myTurn ? 'Até o fim do turno' : 'Até meu turno'}
            title={myTurn ? 'Passa até a etapa final deste turno (F5)' : 'Passa tudo até o início do meu próximo turno (F9)'}
            onClick={() => action(myTurn ? 'PASS_PRIORITY_UNTIL_TURN_END_STEP' : 'PASS_PRIORITY_UNTIL_MY_NEXT_TURN')}
          />
          {/* F11 do cliente oficial: para na etapa final do jogador anterior a mim (hora de instantâneas/flash) */}
          <QuickPass
            label="Etapa final antes do meu turno"
            title="Passa tudo até a etapa final do turno do oponente que joga antes de mim (F11)"
            onClick={() => action('PASS_PRIORITY_UNTIL_END_STEP_BEFORE_MY_NEXT_TURN')}
          />
          <QuickPass label="Próxima fase principal" title="Passa até a próxima fase principal (F7)" onClick={() => action('PASS_PRIORITY_UNTIL_NEXT_MAIN_PHASE')} />
          <QuickPass label="Resolver pilha" title="Passa até a pilha resolver (F10)" onClick={() => action('PASS_PRIORITY_UNTIL_STACK_RESOLVED')} />
        </div>
      )}
    </div>
  );
}

function QuickPass({ label, title, onClick }: { label: string; title?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} className="rounded-lg bg-black/40 px-2 py-1.5 text-white/70 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white">
      {label}
    </button>
  );
}
