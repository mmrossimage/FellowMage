import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useStore } from '../store';
import type { Card, Prompt } from '../types';
import { promptHtml } from '../i18n';
import { cx, rulesToHtml, sanitizeHtml } from '../util';
import { CardFace } from './CardFace';
import { HIGHLIGHT_CLASS, isPromptTarget, optionIds, promptListsTargets } from './interaction';

/** Diálogos modais para pedidos que não são "clique no tabuleiro". */
export function PromptDialogs() {
  const prompt = useStore((s) => s.prompt);
  const waiting = useStore((s) => s.waiting);
  const [hidden, setHidden] = useState<Prompt | undefined>();

  if (!waiting || !prompt || hidden === prompt) return null;

  let body: React.ReactNode = null;
  switch (prompt.kind) {
    case 'choice':
      body = <ChoiceDialog prompt={prompt} />;
      break;
    case 'ability':
      body = <AbilityDialog prompt={prompt} />;
      break;
    case 'amount':
      body = <AmountDialog prompt={prompt} />;
      break;
    case 'multiAmount':
      body = <MultiAmountDialog prompt={prompt} />;
      break;
    case 'pile':
      body = <PileDialog prompt={prompt} />;
      break;
    case 'target':
      if (prompt.cards1?.length) body = <CardPickDialog prompt={prompt} onPeek={() => setHidden(prompt)} />;
      break;
  }
  if (!body) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center gap-6 bg-black/60 p-6 backdrop-blur-sm"
      >
        {prompt.kind !== 'ability' && <PromptSource />}
        <motion.div
          initial={{ scale: 0.92, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl border border-white/10 bg-ink-900/95 p-6 shadow-panel"
        >
          {body}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * O XMage não diz qual carta pediu a escolha (ex.: "Choose a card name" do ChooseACardNameEffect só traz o texto).
 * Mas quase toda escolha acontece enquanto algo resolve ou é conjurado, e o objeto fica no topo da pilha até
 * terminar (GameImpl.resolve só o remove depois): mostramos esse objeto ao lado do diálogo, para dar contexto.
 */
function PromptSource() {
  const top = useStore((s) => s.game?.stack[0]); // XMage envia a pilha do topo para o fundo
  const setHovered = useStore((s) => s.setHovered);
  if (!top) return null;
  const name = top.ability ? top.sourceName ?? top.name : top.name;
  return (
    <motion.aside
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      onMouseEnter={() => setHovered(top.id)}
      onMouseLeave={() => setHovered(undefined)}
      className="hidden w-60 shrink-0 flex-col gap-2 lg:flex"
    >
      <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">Topo da pilha</div>
      <CardFace card={top} overlays={false} className="w-full shadow-target" />
      <div className="rounded-xl border border-white/10 bg-ink-900/95 p-3 text-xs shadow-panel">
        <div className="font-semibold text-white">{name}</div>
        {top.ability && top.rules[0] && (
          <div className="mt-1 text-white/70" dangerouslySetInnerHTML={{ __html: rulesToHtml(top.rules[0], name) }} />
        )}
      </div>
    </motion.aside>
  );
}

function Title({ html, sub }: { html?: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-lg text-white" dangerouslySetInnerHTML={{ __html: promptHtml(html) }} />
      {sub && <p className="mt-1 text-sm text-white/60" dangerouslySetInnerHTML={{ __html: sanitizeHtml(sub) }} />}
    </div>
  );
}

function Btn({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:opacity-40',
        primary ? 'bg-gradient-to-b from-ember-400 to-ember-500 text-ink-950 hover:brightness-110' : 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20',
      )}
    >
      {children}
    </button>
  );
}

function ChoiceDialog({ prompt }: { prompt: Prompt }) {
  const respondString = useStore((s) => s.respondString);
  const c = prompt.choice!;
  const [filter, setFilter] = useState('');
  const entries: [string, string][] = c.keyChoices
    ? Object.entries(c.keyChoices)
    : (c.choices ?? []).map((x) => [x, x]);
  // ordem do servidor (ex.: tipos de criatura seus e dos oponentes primeiro), depois alfabética, como o PickChoiceDialog
  if (c.sortData) {
    const order = c.sortData;
    entries.sort(([ka, la], [kb, lb]) => (order[ka] ?? 0) - (order[kb] ?? 0) || la.localeCompare(lb));
  }
  const shown = entries.filter(([, label]) => label.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <Title html={c.message} sub={c.subMessage} />
      {entries.length > 12 && (
        <input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar…"
          className="mb-3 w-full rounded-lg bg-black/40 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-arcane-400"
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        {shown.map(([key, label]) => (
          <button
            key={key}
            onClick={() => respondString(key)}
            className="rounded-lg bg-white/5 px-3 py-2 text-left text-sm text-white ring-1 ring-white/10 transition hover:bg-arcane-600/30 hover:ring-arcane-400"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(label) }}
          />
        ))}
      </div>
      {!c.required && (
        <div className="mt-4 flex justify-end">
          <Btn onClick={() => respondString(null)}>Cancelar</Btn>
        </div>
      )}
    </>
  );
}

function AbilityDialog({ prompt }: { prompt: Prompt }) {
  const respondUUID = useStore((s) => s.respondUUID);
  const respondBoolean = useStore((s) => s.respondBoolean);
  return (
    <>
      <Title html={prompt.message || 'Escolha uma habilidade'} />
      <div className="flex flex-col gap-2">
        {Object.entries(prompt.abilities ?? {}).map(([id, text]) => (
          <button
            key={id}
            onClick={() => respondUUID(id)}
            className="rounded-lg bg-white/5 px-4 py-3 text-left text-sm text-white ring-1 ring-white/10 transition hover:bg-arcane-600/30 hover:ring-arcane-400"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }}
          />
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Btn onClick={() => respondBoolean(false)}>Cancelar</Btn>
      </div>
    </>
  );
}

function AmountDialog({ prompt }: { prompt: Prompt }) {
  const respondInteger = useStore((s) => s.respondInteger);
  const min = prompt.min ?? 0;
  const max = prompt.max ?? 0;
  const [value, setValue] = useState(min);
  return (
    <>
      <Title html={prompt.message} />
      <div className="flex items-center gap-4">
        <input type="range" min={min} max={max} value={value} onChange={(e) => setValue(Number(e.target.value))} className="flex-1 accent-amber-400" />
        <span className="w-12 text-center font-display text-3xl text-white">{value}</span>
      </div>
      <div className="mt-5 flex justify-end">
        <Btn primary onClick={() => respondInteger(value)}>Confirmar</Btn>
      </div>
    </>
  );
}

function MultiAmountDialog({ prompt }: { prompt: Prompt }) {
  const respondString = useStore((s) => s.respondString);
  const items = prompt.multiAmount ?? [];
  const [values, setValues] = useState(items.map((i) => i.default));
  const total = values.reduce((a, b) => a + b, 0);
  const ok = total >= (prompt.min ?? 0) && total <= (prompt.max ?? Infinity);
  return (
    <>
      <Title html={prompt.message} sub={`Total: ${total} (mín. ${prompt.min ?? 0}, máx. ${prompt.max ?? '∞'})`} />
      <div className="flex flex-col gap-3">
        {items.map((it, i) => (
          <label key={i} className="flex items-center gap-3 text-sm text-white">
            <span className="flex-1" dangerouslySetInnerHTML={{ __html: sanitizeHtml(it.message) }} />
            <input
              type="number"
              min={it.min}
              max={it.max}
              value={values[i]}
              onChange={(e) => setValues(values.map((v, j) => (j === i ? Number(e.target.value) : v)))}
              className="w-20 rounded-lg bg-black/40 px-2 py-1 text-right ring-1 ring-white/10"
            />
          </label>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <Btn primary disabled={!ok} onClick={() => respondString(values.join(' '))}>Confirmar</Btn>
      </div>
    </>
  );
}

function PileDialog({ prompt }: { prompt: Prompt }) {
  const respondBoolean = useStore((s) => s.respondBoolean);
  const pile = (cards: Card[] | undefined, n: 1 | 2) => (
    <button onClick={() => respondBoolean(n === 1)} className="flex-1 rounded-xl bg-white/5 p-3 ring-1 ring-white/10 transition hover:ring-arcane-400">
      <div className="mb-2 text-sm font-semibold text-white">Monte {n} ({cards?.length ?? 0})</div>
      <div className="grid grid-cols-3 gap-1">
        {cards?.map((c) => <CardFace key={c.id} card={c} size="small" />)}
      </div>
    </button>
  );
  return (
    <>
      <Title html={prompt.message} />
      <div className="flex gap-4">
        {pile(prompt.cards1, 1)}
        {pile(prompt.cards2, 2)}
      </div>
    </>
  );
}

/** Escolher cartas que não estão no tabuleiro (grimório, cartas reveladas, gatilhos...). */
function CardPickDialog({ prompt, onPeek }: { prompt: Prompt; onPeek: () => void }) {
  const respondUUID = useStore((s) => s.respondUUID);
  const respondBoolean = useStore((s) => s.respondBoolean);
  const setHovered = useStore((s) => s.setHovered);
  const opts = prompt.options ?? {};
  // já escolhidas: o XMage manda em "chosenTargets" (HumanPlayer.chooseTarget), como no tabuleiro
  const chosen = new Set(optionIds(prompt, 'chosenTargets'));
  // numa busca no grimório o XMage manda o grimório inteiro e só as permitidas em "possibleTargets"
  const listsTargets = promptListsTargets(prompt);
  return (
    <>
      <Title html={prompt.message} sub={opts['secondMessage'] as string | undefined} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
        {prompt.cards1!.map((c) => {
          const can = !listsTargets || isPromptTarget(c, prompt);
          const isChosen = !!c.selected || chosen.has(c.id);
          return (
            <button
              key={c.id}
              disabled={!can && !isChosen}
              onClick={() => respondUUID(c.id)}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered(undefined)}
              className={cx('relative rounded-[6%/4.5%] transition hover:-translate-y-1 disabled:opacity-40')}
            >
              {/* um box-shadow só: as classes de destaque se sobrescrevem, então escolhida tem precedência */}
              <CardFace
                card={c}
                className={cx(isChosen ? HIGHLIGHT_CLASS.selected : can && HIGHLIGHT_CLASS.target.replace(' animate-pulse', ''))}
              />
              {isChosen && (
                <span className="pointer-events-none absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-blood-500 text-sm font-bold text-white shadow-lg ring-2 ring-ink-900">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Btn onClick={onPeek}>Ver a mesa</Btn>
        {!prompt.flag && <Btn onClick={() => respondBoolean(false)}>{(opts['UI.right.btn.text'] as string) || 'Concluir'}</Btn>}
      </div>
    </>
  );
}
