import { rulesToHtml } from './util';

/**
 * Traduções das mensagens mais frequentes do servidor XMage (que vêm em inglês).
 * O que não estiver aqui aparece no original.
 */
const RULES: [RegExp, string][] = [
  [/^Play spells and abilities\.?$/i, 'Jogue mágicas e habilidades'],
  [/^Play instants and activated abilities\.?$/i, 'Jogue mágicas instantâneas e habilidades ativadas'],
  [/^Select attackers\.?$/i, 'Escolha os atacantes'],
  [/^Select blockers\.?$/i, 'Escolha os bloqueadores'],
  [/^Select a starting player\.?$/i, 'Escolha quem começa'],
  [/^Select a card to discard\.?$/i, 'Escolha uma carta para descartar'],
  [/^Mulligan down to (\d+) cards\?$/i, 'Fazer mulligan para $1 cartas?'],
  [/^Choose spell or ability to play/i, 'Escolha a mágica ou habilidade para jogar'],
  [/^Select a nonland permanent/i, 'Escolha uma permanente que não seja terreno'],
  [/^Select target (.+)$/i, 'Escolha o alvo: $1'],
  [/^Select (.+) to attack$/i, 'Escolha quem atacar: $1'],
  [/^Pay (.+)$/i, 'Pagar $1'],
  [/^(.+) - Waiting for (.+)$/i, '$1 — aguardando $2'],
  [/^Select a (.+) you control\.?$/i, 'Escolha: $1 que você controla'],
  // fim de jogo
  [/^You lost the game on turn (\d+)\.?$/i, 'Você perdeu no turno $1.'],
  [/^You won the game on turn (\d+)\.?$/i, 'Você venceu no turno $1.'],
  [/^(.+) won the match!?$/i, '$1 venceu a partida!'],
  [/^You won the match!?$/i, 'Você venceu a partida!'],
];

const STEP_NAMES: [RegExp, string][] = [
  [/\bUntap\b/, 'Desvirar'],
  [/\bUpkeep\b/, 'Manutenção'],
  [/\bDraw\b/, 'Compra'],
  [/\bPrecombat Main\b/, 'Principal 1'],
  [/\bBegin Combat\b/, 'Início do combate'],
  [/\bDeclare Attackers\b/, 'Declarar atacantes'],
  [/\bDeclare Blockers\b/, 'Declarar bloqueadores'],
  [/\bCombat Damage\b/, 'Dano de combate'],
  [/\bEnd Combat\b/, 'Fim do combate'],
  [/\bPostcombat Main\b/, 'Principal 2'],
  [/\bEnd Turn\b/, 'Etapa final'],
  [/\bCleanup\b/, 'Limpeza'],
];

/** Mensagem do servidor -> HTML seguro, traduzido, com símbolos de mana e sem ids internos ("[7ae]"). */
export function promptHtml(message: string | undefined | null): string {
  if (!message) return '';
  let text = message.replace(/\s*\[[0-9a-f]{2,5}\]/gi, '');
  const plain = text.replace(/<[^>]+>/g, '').trim();
  for (const [re, pt] of RULES) {
    if (re.test(plain)) {
      // traduz sobre o texto sem tags; mantém o HTML original quando não há tradução
      text = plain.replace(re, pt);
      break;
    }
  }
  for (const [re, pt] of STEP_NAMES) text = text.replace(re, pt);
  // "Pagar {2}{W}Nome" -> separa o custo do nome
  text = text.replace(/(\})([A-Za-z])/, '$1 — $2');
  return rulesToHtml(text);
}
