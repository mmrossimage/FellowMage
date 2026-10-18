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
  /** permanente com o verso para cima (cartas que transformam) */
  transformed?: boolean;
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
  bufferLeft: number;
  timerActive: boolean;
  /** ações que podem ser desfeitas (UNDO) */
  statesSaved: number;
  wins: number;
  winsNeeded: number;
  passing: { turn: boolean; endOfTurn: boolean; nextMain: boolean; allTurns: boolean; stack: boolean; endStepBeforeMyTurn: boolean };
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

/** botão de um pedido do servidor (USER_REQUEST_DIALOG); action = PlayerAction do XMage */
export type UserRequestButton = { text: string; action: string | null };
export type UserRequest = { id: string; title: string; message: string; buttons: UserRequestButton[] };

/** carta da montagem de deck (sideboard / limitado) */
export type BuildCard = { id: string; set: string; num: string; name?: string; type?: string; types?: string[]; cost?: string; mv?: number; colors?: string[] };
/** sideboard: entre os jogos; constructSideboard: sideboard de torneio limitado; construct: montar o deck do pool */
export type DeckBuild = { tableId: string; mode: 'sideboard' | 'constructSideboard' | 'construct'; time: number; name: string; main: BuildCard[]; side: BuildCard[]; basics: boolean };

/** carta conhecida só por set/número (mãos reveladas por permissão) */
export type SimpleCard = { id: string; set: string; num: string };

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
  /** segundos de prioridade por jogador (0 = mesa sem limite de tempo) */
  priorityTime: number;
  bufferTime: number;
  rollbackAllowed: boolean;
  /** mãos de outros jogadores que podemos ver (por nome) */
  visibleHands: Record<string, SimpleCard[]>;
  /** assistindo como espectador */
  watching: boolean;
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

/** Mesa do lobby online, como o servidor XMage a descreve. */
export type LobbySeat = { name: string; type: string | null; flag?: string };
export type LobbyTable = {
  id: string;
  name: string;
  owner: string;
  gameType: string;
  deckType: string;
  /** WAITING, READY_TO_START, STARTING, DUELING, SIDEBOARDING, FINISHED… */
  state: string | null;
  stateText: string;
  info?: string;
  created: number | null;
  passworded: boolean;
  rated: boolean;
  tournament: boolean;
  limited: boolean;
  spectators: boolean;
  skill: string | null;
  quitRatio: string;
  minRating: string;
  seats: LobbySeat[];
};
export type GameTypeOption = { name: string; minPlayers: number; maxPlayers: number; useRange: boolean; useAttackOption: boolean };
export type LobbyOptions = {
  gameTypes: GameTypeOption[];
  deckTypes: string[];
  timeLimits: { id: string; minutes: number }[];
  skillLevels: string[];
};
/** chat geral da sala, da mesa (sala de espera) ou da partida */
export type ChatKind = 'room' | 'table' | 'game';
export type CreateTableOptions = {
  name: string;
  gameType: string;
  deckType: string;
  players: number;
  timeLimit: string;
  skill: string;
  wins: number;
  password: string;
  spectators: boolean;
  deck: string;
  /** vagas preenchidas por IA (ficam no fim da mesa) */
  ai?: number;
  aiSkill?: number;
  aiDeck?: string;
};

export type RoomUser = { name: string; flag: string; games: string; ping: string; history: string; quitRatio: number; rating: number };
export type FinishedMatch = {
  id: string;
  name: string;
  gameType: string;
  deckType: string;
  players: string;
  result: string;
  start?: number;
  end?: number;
  tournament: boolean;
  replay: boolean;
  games: string[];
};

export type ServerMsg =
  | { t: 'connected'; user: string; server: string; clientVersion?: string; serverVersion?: string | null; stops: Stops; resumed?: boolean; inGame?: boolean }
  | { t: 'disconnected' }
  | { t: 'decks'; decks: string[] }
  | { t: 'stops'; stops: Stops }
  | { t: 'tableReady'; format: string; deck: string; opponents: string[] }
  | { t: 'gameStarted'; gameId: string; playerId: string | null; watching?: boolean }
  | { t: 'game'; method: string; game?: Game; prompt?: Prompt }
  | { t: 'gameOver'; message: string }
  | { t: 'endGame'; won: boolean; title: string; info: string; extra?: string; matchOver?: boolean; wins?: number; winsNeeded?: number }
  | { t: 'chat'; chat?: ChatKind; message: string; turnInfo?: string; username?: string; type: string }
  | ({ t: 'lobbyOptions' } & LobbyOptions)
  | { t: 'tables'; tables: LobbyTable[] }
  | { t: 'tableJoined'; tableId: string }
  | { t: 'tableInfo'; table: LobbyTable; owner: boolean }
  | { t: 'tableLeft'; reason?: string }
  | { t: 'error'; message: string }
  | { t: 'localServer'; state: 'starting' }
  | { t: 'gameError'; message: string }
  | { t: 'serverMessage'; message: string }
  | { t: 'userMessage'; lines: string[] }
  | { t: 'roomUsers'; users: RoomUser[]; activeGames: number }
  | { t: 'finishedMatches'; matches: FinishedMatch[] }
  | { t: 'serverMessages'; messages: string[] }
  | { t: 'replayStarted'; gameId: string }
  | { t: 'replayEnd'; message: string }
  | { t: 'replayDone' }
  | { t: 'deckBuild'; build: DeckBuild }
  | { t: 'deckBuildDone' }
  | { t: 'userRequest'; id: string; title: string; message: string; buttons: UserRequestButton[] }
  | { t: 'event'; method: string }
  | { t: 'cards'; reqId?: string; status: string; result: { total: number; offset: number; cards: CatalogCard[] } }
  | { t: 'userDecks'; decks: DeckSummary[] }
  | { t: 'deck'; deck: EditorDeck }
  | { t: 'deckSaved'; path: string }
  | { t: 'decklist'; result: DecklistImport }
  | { t: 'printings'; result: { name: string; printings: { set: string; num: string }[] } };
