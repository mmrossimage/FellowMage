import { useStore } from '../store';
import type { Card, Game, Prompt } from '../types';

export type Highlight = 'playable' | 'target' | 'selected' | 'attacking' | 'blocking' | null;

const CLICKABLE_KINDS = new Set(['select', 'target', 'playMana', 'playXMana']);

export function optionIds(prompt: Prompt | undefined, key: string): string[] {
  const v = prompt?.options?.[key];
  return Array.isArray(v) ? (v as string[]) : [];
}

/**
 * Alvo válido no pedido atual: `targets` da mensagem ou a opção `possibleTargets`
 * (HumanPlayer.choose/chooseTarget; o cliente oficial marca essas cartas como selecionáveis no GamePanel).
 */
export function isPromptTarget(card: Card, prompt: Prompt | undefined): boolean {
  return !!prompt && (!!prompt.targets?.includes(card.id) || optionIds(prompt, 'possibleTargets').includes(card.id) || !!card.choosable);
}

/** O pedido de alvo diz quais cartas valem? (sem essa informação, todas as cartas mostradas podem ser escolhidas) */
export function promptListsTargets(prompt: Prompt | undefined): boolean {
  return !!prompt && (!!prompt.targets || Array.isArray(prompt.options?.['possibleTargets']));
}

/** O pedido atual do XMage é a fonte de verdade para cliques em cartas de qualquer zona. */
export function canChooseCard(card: Card, prompt: Prompt | undefined, waiting: boolean): boolean {
  if (!waiting || !prompt || !CLICKABLE_KINDS.has(prompt.kind)) return false;
  const target = isPromptTarget(card, prompt);
  if (prompt.kind === 'target') return target;
  if (prompt.kind === 'select') return target || !!card.playable;
  return !!card.playable;
}

export function combatRoles(game: Game | undefined) {
  const attacking = new Set<string>();
  const blocking = new Set<string>();
  game?.combat.forEach((g) => {
    g.attackers.forEach((id) => attacking.add(id));
    g.blockers.forEach((id) => blocking.add(id));
  });
  return { attacking, blocking };
}

/** Destaque visual de uma carta de acordo com o pedido atual do servidor. */
export function highlightFor(card: Card, game: Game | undefined, prompt: Prompt | undefined, waiting: boolean): Highlight {
  if (card.selected || (waiting && optionIds(prompt, 'chosenTargets').includes(card.id))) return 'selected';
  if (waiting && prompt) {
    if (isPromptTarget(card, prompt)) return 'target';
    if (prompt.kind === 'select') {
      if (optionIds(prompt, 'possibleAttackers').includes(card.id)) return 'playable';
      if (optionIds(prompt, 'possibleBlockers').includes(card.id)) return 'playable';
    }
    // em 'select' = pode jogar/ativar; em 'playMana' = fonte de mana que pode pagar o custo
    if ((prompt.kind === 'select' || prompt.kind === 'playMana' || prompt.kind === 'playXMana') && card.playable) return 'playable';
  }
  const { attacking, blocking } = combatRoles(game);
  if (attacking.has(card.id)) return 'attacking';
  if (blocking.has(card.id)) return 'blocking';
  return null;
}

/** Clique numa carta/objeto: no XMage quase tudo é "enviar o UUID do objeto clicado". */
export function useObjectClick() {
  const waiting = useStore((s) => s.waiting);
  const prompt = useStore((s) => s.prompt);
  const respondUUID = useStore((s) => s.respondUUID);
  return (id: string) => {
    if (!waiting || !prompt || !CLICKABLE_KINDS.has(prompt.kind)) return;
    respondUUID(id);
  };
}

export const HIGHLIGHT_CLASS: Record<Exclude<Highlight, null>, string> = {
  playable: 'shadow-playable',
  target: 'shadow-target animate-pulse',
  selected: 'shadow-selected',
  attacking: 'shadow-selected',
  blocking: 'shadow-[0_0_0_2px_rgba(155,231,255,.9),0_0_18px_4px_rgba(95,211,245,.5)]',
};
