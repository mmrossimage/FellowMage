import type { StopKey } from './types';

// Mensagens do XMage vêm em HTML (cores de nomes, negrito...). Mantemos só tags inofensivas.
const ALLOWED = new Set(['B', 'I', 'U', 'BR', 'FONT', 'SPAN', 'STRONG', 'EM']);

export function sanitizeHtml(html: string | undefined | null): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!ALLOWED.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      const color = child.getAttribute('color');
      // referência a carta (GameLog.getColoredObjectIdName): id do objeto e nome alternativo para a prévia
      const objectId = child.getAttribute('object_id');
      const altName = child.getAttribute('alternative_name');
      for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name);
      if (color && /^#?[\w]+$/.test(color)) child.setAttribute('style', `color:${color}`);
      if (objectId) {
        child.setAttribute('data-obj', objectId);
        child.setAttribute('data-card', decodeName(altName) || child.textContent || '');
        child.setAttribute('class', 'card-ref');
      }
      walk(child);
    }
  };
  const root = doc.body.firstElementChild!;
  walk(root);
  return root.innerHTML;
}

/** alternative_name vem de CardUtil.urlEncode (URLEncoder do Java: espaço vira "+") */
function decodeName(s: string | null): string {
  if (!s) return '';
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

export function stripHtml(html: string | undefined | null): string {
  if (!html) return '';
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}

/** "{2}{R}{R/G}" -> ["2", "R", "RG"] (nomes de arquivo dos símbolos do Scryfall) */
export function manaSymbols(cost: string | undefined): string[] {
  if (!cost) return [];
  return Array.from(cost.matchAll(/\{([^}]+)\}/g)).map((m) => m[1].replace('/', '').toUpperCase());
}

export const symbolUrl = (sym: string) => `https://svgs.scryfall.io/card-symbols/${sym}.svg`;

// símbolos que existem como imagem (mana, {T}, {Q}, {E}, híbridos, phyrexianos...)
const SYMBOL = /^[0-9WUBRGCSXYZTQEPH½∞]+$/i;

/**
 * Substitui {T}, {R} etc. no texto das regras por <img> dos símbolos. {this} e {source} viram o nome
 * da carta e o que não é símbolo fica como texto, como no TextboxRuleParser do cliente oficial.
 */
export function rulesToHtml(rule: string, cardName?: string): string {
  // o XMage manda "&bull" (sem ";") antes de cada modo de "Choose one —"
  const decoded = rule.replace(/&bull;?/g, '•');
  return replaceHintIcons(sanitizeHtml(decoded)).replace(/\{([^}]+)\}/g, (whole, s: string) => {
    if (s === 'this' || s === 'source') return cardName ? escapeHtml(cardName) : 'esta carta';
    const code = s.replace('/', '').toUpperCase();
    if (!SYMBOL.test(code)) return whole;
    return `<img src="${symbolUrl(code)}" alt="{${s}}" class="inline h-[1em] w-[1em] align-[-0.12em] mx-[1px]" />`;
  });
}

/**
 * Marcadores das dicas de cartas (HintUtils.HINT_ICON_*: "ICON_GOOD", "ICON_BAD"...). O cliente oficial os troca
 * por imagens em ManaSymbols.replaceSymbolsWithHTML (resources/hint/good.png, bad.png...); aqui viram selos coloridos.
 */
const HINT_ICONS: Record<string, { char: string; bg: string; title: string }> = {
  ICON_DUNGEON_ROOM_CURRENT: { char: '▶', bg: '#16a34a', title: 'Sala atual' },
  ICON_DUNGEON_ROOM_NEXT: { char: '↘', bg: '#ca8a04', title: 'Próxima sala' },
  ICON_RESTRICT: { char: '⊘', bg: '#ea580c', title: 'Restrição' },
  ICON_REQUIRE: { char: '!', bg: '#ca8a04', title: 'Obrigação' },
  ICON_GOOD: { char: '✓', bg: '#16a34a', title: 'Condição cumprida' },
  ICON_BAD: { char: '✕', bg: '#dc2626', title: 'Condição não cumprida' },
};
const HINT_ICON_RE = new RegExp(Object.keys(HINT_ICONS).join('|'), 'g');

export function replaceHintIcons(html: string): string {
  return html.replace(HINT_ICON_RE, (key) => {
    const i = HINT_ICONS[key];
    return `<span title="${i.title}" style="background:${i.bg}" class="mr-1 inline-flex h-[1.15em] w-[1.15em] items-center justify-center rounded-full align-[-0.2em] text-[0.8em] font-bold leading-none text-white">${i.char}</span>`;
  });
}

/** Remove os marcadores de dica (para textos curtos, sem HTML). */
export const stripHintIcons = (s: string) => s.replace(HINT_ICON_RE, '');

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const STEP_LABEL: Record<string, string> = {
  UNTAP: 'Desvirar',
  UPKEEP: 'Manutenção',
  DRAW: 'Compra',
  PRECOMBAT_MAIN: 'Principal 1',
  BEGIN_COMBAT: 'Início do combate',
  DECLARE_ATTACKERS: 'Atacantes',
  DECLARE_BLOCKERS: 'Bloqueadores',
  FIRST_COMBAT_DAMAGE: 'Dano (1º golpe)',
  COMBAT_DAMAGE: 'Dano de combate',
  END_COMBAT: 'Fim do combate',
  POSTCOMBAT_MAIN: 'Principal 2',
  END_TURN: 'Final',
  CLEANUP: 'Limpeza',
};

export type TrackStep = {
  /** passos do XMage representados por este marcador */
  steps: string[];
  short: string;
  label: string;
  /** chave da parada de prioridade configurável (ausente = o XMage decide sozinho) */
  stop?: StopKey;
  /** nota quando não há parada configurável */
  note?: string;
};

/** As 5 fases do turno e os seus passos (CR 500.1). */
export const PHASE_TRACK: { key: string; label: string; steps: TrackStep[] }[] = [
  {
    key: 'BEGINNING',
    label: 'Início',
    steps: [
      { steps: ['UNTAP'], short: 'Desv', label: 'Desvirar', note: 'Ninguém recebe prioridade' },
      { steps: ['UPKEEP'], short: 'Manut', label: 'Manutenção', stop: 'upkeep' },
      { steps: ['DRAW'], short: 'Compra', label: 'Compra', stop: 'draw' },
    ],
  },
  { key: 'MAIN1', label: 'Principal 1', steps: [{ steps: ['PRECOMBAT_MAIN'], short: 'Princ 1', label: 'Fase principal 1', stop: 'main1' }] },
  {
    key: 'COMBAT',
    label: 'Combate',
    steps: [
      { steps: ['BEGIN_COMBAT'], short: 'Início', label: 'Início do combate', stop: 'beforeCombat' },
      { steps: ['DECLARE_ATTACKERS'], short: 'Atac', label: 'Declarar atacantes', note: 'Para sempre que houver atacantes possíveis' },
      { steps: ['DECLARE_BLOCKERS'], short: 'Bloq', label: 'Declarar bloqueadores', note: 'Para quando você pode bloquear' },
      { steps: ['FIRST_COMBAT_DAMAGE', 'COMBAT_DAMAGE'], short: 'Dano', label: 'Dano de combate' },
      { steps: ['END_COMBAT'], short: 'Fim', label: 'Fim do combate', stop: 'endOfCombat' },
    ],
  },
  { key: 'MAIN2', label: 'Principal 2', steps: [{ steps: ['POSTCOMBAT_MAIN'], short: 'Princ 2', label: 'Fase principal 2', stop: 'main2' }] },
  {
    key: 'END',
    label: 'Final',
    steps: [
      { steps: ['END_TURN'], short: 'Final', label: 'Etapa final', stop: 'endOfTurn' },
      { steps: ['CLEANUP'], short: 'Limp', label: 'Limpeza', note: 'Normalmente sem prioridade' },
    ],
  },
];

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/** sessionStorage tolerante a falhas (aba privada, armazenamento bloqueado) */
export function sessionGet(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
export function sessionSet(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* sem armazenamento: só não retoma ao recarregar */
  }
}
