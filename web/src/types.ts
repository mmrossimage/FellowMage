// Espelha o JSON produzido por gateway/ViewMapper.java e ClientBridge.java

export type Counter = { name: string; count: number };

export type Card = {
  id: string;
  name: string;
  set?: string;
  num?: string;
  cost: string;
  mv: number;
  type: string;
  types: string[];
  colors: string[];
  rarity?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  rules: string[];
  counters: Counter[];
  token: boolean;
  faceDown: boolean;
  ability: boolean;
  sourceName?: string;
  targets?: string[];
  playable?: boolean;
  playableCount?: number;
  choosable?: boolean;
  selected?: boolean;
  /** presente quando a carta é um comandante */
  commander?: CommanderInfo;
  /** objeto da zona de comando que não é carta (emblema, dungeon...) */
  emblem?: boolean;
};

export type CommanderInfo = {
  casts: number;
  tax: number;
  /** dano de combate causado por este comandante, por nome do jogador atingido */
  damage: Record<string, number>;
};

/** Carta do catálogo do XMage (editor de decks). */
export type CatalogCard = {
  name: string;
  set?: string;
  num?: string;
  cost: string;
  mv: number;
  type: string;
  types: string[];
  supertypes?: string[];
  colors: string[];
  identity: string[];
  rarity?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  rules: string[];
  canBeCommander?: boolean;
  basic?: boolean;
  printings?: number;
  /** o XMage não conhece esta carta */
  unknown?: boolean;
  qty?: number;
};

export type DeckSummary = {
  path: string;
  name: string;
  count?: number;
  commanders?: { name: string; set: string; num: string }[];
  identity?: string[];
  error?: string;
};

export type EditorDeck = {
  path?: string | null;
  readOnly?: boolean;
  name: string;
  commanders: CatalogCard[];
  cards: CatalogCard[];
};

export type CardQuery = {
  text?: string;
  searchRules?: boolean;
  types?: string[];
  identity?: string[] | null;
  colors?: string[];
  mvMin?: number | null;
  mvMax?: number | null;
  commandersOnly?: boolean;
  sort?: 'name' | 'mv';
  offset?: number;
  limit?: number;
};

export type DecklistImport = {
  commanders: CatalogCard[];
  cards: CatalogCard[];
  sideboard: CatalogCard[];
  unresolved: string[];
};

export type StopKey = 'upkeep' | 'draw' | 'main1' | 'beforeCombat' | 'endOfCombat' | 'main2' | 'endOfTurn';
export type Stops = { yourTurn: Record<StopKey, boolean>; opponentTurn: Record<StopKey, boolean> };
export type FormatId = 'commander' | 'duel';

export type Permanent = Card & {
  tapped: boolean;
  damage: number;
  sick: boolean;
  attachedTo?: string;
  attachments?: string[];
  controller?: string;
  copy: boolean;
  canAttack: boolean;
  canBlock: boolean;
};

export type ManaPool = { W: number; U: number; B: number; R: number; G: number; C: number };

export type Player = {
  id: string;
  name: string;
  me: boolean;
  human: boolean;
  life: number;
  library: number;
  handCount: number;
  active: boolean;
  priority: boolean;
  left: boolean;
  timeLeft: number;
  monarch: boolean;
  initiative: boolean;
  counters: Counter[];
  mana: ManaPool;
  graveyard: Card[];
  exile: Card[];
  command: Card[];
  battlefield: Permanent[];
  topCard?: Card | null;
};

export type CombatGroup = {
  defenderId: string;
  defenderName: string;
  blocked: boolean;
  attackers: string[];
  blockers: string[];
};

export type Game = {
  turn: number;
  phase: string | null;
  step: string | null;
  activePlayerId: string;
  activePlayerName: string;
  priorityPlayerName: string;
  special: boolean;
  players: Player[];
  hand: Card[];
  stack: Card[];
  combat: CombatGroup[];
  exiles: { id: string; name: string; cards: Card[] }[];
  revealed: { name: string; cards: Card[] }[];
  lookedAt: { name: string; count: number }[];
  playable: string[];
};

export type PromptKind =
  | 'inform'
  | 'select'
  | 'target'
  | 'ask'
  | 'choice'
  | 'pile'
  | 'playMana'
  | 'playXMana'
  | 'amount'
  | 'multiAmount'
  | 'ability';

export type Prompt = {
  kind: PromptKind;
  message: string;
  flag?: boolean;
  min?: number;
  max?: number;
  targets?: string[];
  options?: Record<string, unknown>;
  cards1?: Card[];
  cards2?: Card[];
  choice?: {
    message: string;
    subMessage?: string;
    required: boolean;
    choices?: string[];
    keyChoices?: Record<string, string>;
  };
  multiAmount?: { message: string; min: number; max: number; default: number }[];
  abilities?: Record<string, string>;
};

export type ServerMsg =
  | { t: 'connected'; user: string; server: string; clientVersion?: string; serverVersion?: string | null; stops: Stops }
  | { t: 'disconnected' }
  | { t: 'decks'; decks: string[] }
  | { t: 'stops'; stops: Stops }
  | { t: 'tableReady'; format: string; deck: string; opponents: string[] }
  | { t: 'gameStarted'; gameId: string; playerId: string }
  | { t: 'game'; method: string; game?: Game; prompt?: Prompt }
  | { t: 'gameOver'; message: string }
  | { t: 'endGame'; won: boolean; title: string; info: string }
  | { t: 'chat'; message: string; turnInfo?: string; username?: string; type: string }
  | { t: 'error'; message: string }
  | { t: 'gameError'; message: string }
  | { t: 'serverMessage'; message: string }
  | { t: 'userMessage'; lines: string[] }
  | { t: 'userRequest'; title: string; message: string }
  | { t: 'event'; method: string }
  | { t: 'cards'; reqId?: string; status: string; result: { total: number; offset: number; cards: CatalogCard[] } }
  | { t: 'userDecks'; decks: DeckSummary[] }
  | { t: 'deck'; deck: EditorDeck }
  | { t: 'deckSaved'; path: string }
  | { t: 'decklist'; result: DecklistImport }
  | { t: 'printings'; result: { name: string; printings: { set: string; num: string }[] } };
