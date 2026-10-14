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
      for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name);
      if (color && /^#?[\w]+$/.test(color)) child.setAttribute('style', `color:${color}`);
      walk(child);
    }
  };
  const root = doc.body.firstElementChild!;
  walk(root);
  return root.innerHTML;
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

/** Substitui {T}, {R} etc. no texto das regras por <img> dos símbolos. */
export function rulesToHtml(rule: string): string {
  return sanitizeHtml(rule).replace(
    /\{([^}]+)\}/g,
    (_, s: string) => `<img src="${symbolUrl(s.replace('/', '').toUpperCase())}" alt="{${s}}" class="inline h-[1em] w-[1em] align-[-0.12em] mx-[1px]" />`,
  );
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

export const PHASE_TRACK: { key: string; short: string; steps: string[] }[] = [
  { key: 'BEGINNING', short: 'Início', steps: ['UNTAP', 'UPKEEP', 'DRAW'] },
  { key: 'PRECOMBAT_MAIN', short: 'Principal 1', steps: ['PRECOMBAT_MAIN'] },
  { key: 'COMBAT', short: 'Combate', steps: ['BEGIN_COMBAT', 'DECLARE_ATTACKERS', 'DECLARE_BLOCKERS', 'FIRST_COMBAT_DAMAGE', 'COMBAT_DAMAGE', 'END_COMBAT'] },
  { key: 'POSTCOMBAT_MAIN', short: 'Principal 2', steps: ['POSTCOMBAT_MAIN'] },
  { key: 'END', short: 'Final', steps: ['END_TURN', 'CLEANUP'] },
];

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}
