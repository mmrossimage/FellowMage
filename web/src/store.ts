import { create } from 'zustand';
import { loadTableBg, saveTableBg, type TableBg } from './tableBg';
import { sessionSet } from './util';
import type { ChatKind, CreateTableOptions, DeckSummary, FormatId, Game, LobbyOptions, LobbyTable, Prompt, ServerMsg, StopKey, Stops, UserRequest, DeckBuild, RoomUser, FinishedMatch, TournamentInfo, DraftState, CreateTournamentOptions } from './types';

type Status = 'offline' | 'connecting' | 'online' | 'starting' | 'playing';
/** telas dentro do app (fora da partida) */
export type View = 'home' | 'play' | 'decks' | 'editor';
/** online: servidor público (contra pessoas); local: servidor XMage nesta máquina (contra a IA) */
export type Mode = 'online' | 'local';

export type LogLine = { id: number; html: string; turnInfo?: string; kind: 'game' | 'chat' | 'system' | 'error'; user?: string };
/** mensagem dos chats do lobby (sala e mesa) */
export type ChatLine = { id: number; user?: string; html: string; type: string };

/** mesmos padrões do menu do jogador no cliente oficial (PlayAreaPanel) */
export type GamePrefs = { manaAuto: boolean; manaAutoRestricted: boolean; firstManaAbility: boolean; allowHandRequests: boolean; holdPriority: boolean };
const DEFAULT_GAME_PREFS: GamePrefs = { manaAuto: true, manaAutoRestricted: true, firstManaAbility: false, allowHandRequests: true, holdPriority: false };
const GAME_PREF_ACTIONS: Record<keyof GamePrefs, [string, string]> = {
  manaAuto: ['MANA_AUTO_PAYMENT_ON', 'MANA_AUTO_PAYMENT_OFF'],
  manaAutoRestricted: ['MANA_AUTO_PAYMENT_RESTRICTED_ON', 'MANA_AUTO_PAYMENT_RESTRICTED_OFF'],
  firstManaAbility: ['USE_FIRST_MANA_ABILITY_ON', 'USE_FIRST_MANA_ABILITY_OFF'],
  allowHandRequests: ['PERMISSION_REQUESTS_ALLOWED_ON', 'PERMISSION_REQUESTS_ALLOWED_OFF'],
  holdPriority: ['HOLD_PRIORITY', 'UNHOLD_PRIORITY'],
};

type State = {
  status: Status;
  user?: string;
  server?: string;
  /** versões do XMage no gateway e no servidor; precisam ser iguais para conectar */
  clientVersion?: string;
  serverVersion?: string;
  mode?: Mode;
  /** o gateway está ligando o servidor XMage local (pode levar minutos na primeira vez) */
  localServerStarting?: boolean;
  decks: string[];
  gameId?: string;
  playerId?: string;
  game?: Game;
  prompt?: Prompt;
  /** quando o servidor pede resposta e ainda não respondemos */
  waiting: boolean;
  log: LogLine[];
  /** id da última linha do log antes de o topo da pilha mudar (Dialogs: cartas citadas desde então) */
  stackLogMark: number;
  toast?: { text: string; tone: 'error' | 'info' };
  /** matchOver = false: fim de um jogo numa partida melhor de N (o próximo jogo vem a seguir) */
  result?: { won: boolean; title: string; info: string; extra?: string; matchOver: boolean };
  /** esconde o resultado de um jogo intermediário e aguarda o próximo */
  dismissResult: () => void;
  /** GAME_OVER: o jogo acabou no servidor (o resultado detalhado pode chegar depois, ou nunca) */
  gameOver?: string;
  hovered?: string; // id da carta sob o cursor (para o preview grande)
  /** paradas de prioridade por passo (preferência do usuário no servidor XMage) */
  stops?: Stops;

  view: View;
  /** deck aberto no editor: caminho (null = deck novo) e texto a importar ao abrir */
  editor?: { path: string | null; importText?: string };
  userDecks: DeckSummary[];
  /** consulta ao Moxfield em andamento: 'link' (vinculando) ou o caminho do deck sendo atualizado */
  moxfieldBusy?: string;
  linkMoxfield: (url: string) => void;
  syncMoxfield: (path: string) => void;
  /** deck pré-selecionado na tela "Jogar" */
  playDeck?: string;

  // ---- lobby online
  lobbyOptions?: LobbyOptions;
  tables: LobbyTable[];
  /** sala de espera: a mesa em que entramos (id já conhecido antes do primeiro tableInfo) */
  table?: { id: string; info?: LobbyTable; owner: boolean };
  chats: Record<'room' | 'table', ChatLine[]>;
  /** torneio em que estamos (tabela e rodadas chegam por polling, como no TournamentPanel) */
  tournament?: { id: string; info?: TournamentInfo; over?: string };
  /** draft em andamento: booster atual, escolhas e relógio (`since` = quando o booster chegou) */
  draft?: DraftState & { since: number };
  createTournament: (opts: CreateTournamentOptions) => void;
  roomUsers: RoomUser[];
  finishedMatches: FinishedMatch[];
  /** avisos do servidor (mensagem do dia) */
  serverMessages: string[];
  /** assistindo a um replay gravado no servidor */
  replay: boolean;
  /** um pedido de criar/entrar em mesa aguardando resposta do servidor */
  tableBusy: boolean;

  connect: (host: string, port: number, user: string, mode: Mode) => void;
  /** encerra a sessão e volta à tela de conexão, sem entrar sozinho na próxima vez */
  disconnect: () => void;
  navigate: (view: View, extra?: Partial<Pick<State, 'editor' | 'playDeck'>>) => void;
  /** comando ao gateway que espera uma resposta do tipo `t` */
  request: <T extends ServerMsg['t']>(cmd: Record<string, unknown>, t: T) => Promise<Extract<ServerMsg, { t: T }>>;
  refreshUserDecks: () => void;
  /** freeMulligans: mulligans grátis por jogador (0 a 5, MatchOptions.setFreeMulligans) */
  startGame: (format: FormatId, deck: string | undefined, opponents: (string | null)[], aiSkill: number, freeMulligans: number) => void;
  toggleStop: (turn: keyof Stops, key: StopKey) => void;
  send: (cmd: Record<string, unknown>) => void;
  respondUUID: (id: string) => void;
  respondBoolean: (value: boolean) => void;
  respondInteger: (value: number) => void;
  respondString: (value: string | null) => void;
  /** PlayerAction do XMage; data = id de jogador ou número de turnos, conforme a ação */
  action: (action: string, data?: string | number) => void;
  /** pedidos do servidor com botões (voltar turnos, ver mão...), mostrados um por vez */
  userRequests: UserRequest[];
  /** o servidor pediu para montar o deck (sideboard entre jogos ou limitado); `since` = quando chegou */
  deckBuild?: DeckBuild & { since: number };
  userReply: (id: string, action: string | null) => void;
  /** opções da partida no servidor; o XMage não as devolve, então o cliente guarda o último valor enviado */
  gamePrefs: GamePrefs;
  setGamePref: (key: keyof GamePrefs, value: boolean) => void;
  setHovered: (id?: string) => void;
  /** carta citada num texto (log, chat, pedido) sob o mouse: id do objeto e nome para buscar a imagem */
  hoveredRef?: { id: string; name: string };
  /** fundo da mesa (preferência deste navegador) */
  tableBg: TableBg;
  setTableBg: (bg: TableBg) => void;
  /** tela de escolha do fundo aberta */
  tableBgOpen: boolean;
  setTableBgOpen: (open: boolean) => void;
  setHoveredRef: (ref?: { id: string; name: string }) => void;
  dismissToast: () => void;
  leaveGame: () => void;
  createTable: (opts: CreateTableOptions) => void;
  joinTable: (tableId: string, deck: string | undefined, password: string, tournament?: boolean) => void;
  leaveTable: () => void;
  sendChat: (chat: ChatKind, text: string) => void;
};

let ws: WebSocket | undefined;
let logSeq = 0;
const MAX_LOG = 300;
const MAX_CHAT = 200;
let chatSeq = 0;
// reconexão automática: o gateway mantém a sessão XMage por ~2 min após a queda
let lastConnect: { host: string; port: number; user: string; mode: Mode } | undefined;
let reconnectAttempts = 0;
const MAX_RECONNECT = 8;

// requisições com resposta: casadas pelo tipo da mensagem (e pelo reqId quando o gateway o devolve)
type Waiter = { t: string; reqId?: string; resolve: (m: ServerMsg) => void };
let waiters: Waiter[] = [];
let reqSeq = 0;

function gatewayUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // em desenvolvimento o Vite repassa /ws para o gateway; no pacote o site é servido pelo
  // próprio gateway (HTTP) e o WebSocket fica na porta 8090
  return import.meta.env.DEV ? `${proto}://${location.host}/ws` : `${proto}://${location.hostname}:8090`;
}

export const useStore = create<State>((set, get) => {
  const pushLog = (line: Omit<LogLine, 'id'>) =>
    set((s) => ({ log: [...s.log.slice(-MAX_LOG + 1), { ...line, id: ++logSeq }] }));

  const handle = (m: ServerMsg) => {
    const reqId = 'reqId' in m ? m.reqId : undefined;
    const w = waiters.find((x) => x.t === m.t && (!x.reqId || !reqId || x.reqId === reqId));
    if (w) {
      waiters = waiters.filter((x) => x !== w);
      w.resolve(m);
    }
    switch (m.t) {
      case 'connected':
        // recarregar a página nesta aba volta direto para cá (e retoma a partida estacionada no gateway)
        if (lastConnect) sessionSet('fm.resume', JSON.stringify(lastConnect));
        // ao retomar uma sessão no meio da partida, a tela de jogo continua (o estado chega em seguida);
        // se a partida acabou (ou a sessão expirou) enquanto o navegador estava fora, volta ao lobby
        if (get().status === 'playing' && !m.inGame) {
          set({ game: undefined, prompt: undefined, waiting: false, result: undefined, gameOver: undefined, table: undefined, toast: { text: 'A partida terminou enquanto você estava desconectado.', tone: 'info' } });
        }
        set({ status: m.inGame ? 'playing' : 'online', localServerStarting: false, user: m.user, server: m.server, clientVersion: m.clientVersion, serverVersion: m.serverVersion ?? undefined, stops: m.stops });
        get().send({ t: 'listDecks' });
        get().refreshUserDecks();
        break;
      case 'userDecks':
        set({ userDecks: m.decks });
        break;
      case 'moxfieldLinked': {
        // a lista de decks chega antes desta confirmação
        const missing = get().userDecks.find((d) => d.path === m.path)?.moxfield?.missing.filter((x) => !x.substitute) ?? [];
        const text = missing.length
          ? `Deck vinculado ao Moxfield. Fora do XMage (ainda não implementadas): ${missing.map((x) => x.name).join(', ')} — clique no aviso ⚠ do deck para escolher substitutos.`
          : 'Deck vinculado ao Moxfield.';
        set({ moxfieldBusy: undefined, toast: { text, tone: 'info' } });
        break;
      }
      case 'stops':
        set({ stops: m.stops });
        break;
      case 'disconnected':
        set({ status: 'offline', game: undefined, prompt: undefined });
        break;
      case 'decks':
        set({ decks: m.decks });
        break;
      case 'tableReady':
        pushLog({ kind: 'system', html: `${m.format}: <b>${m.deck}</b> contra ${m.opponents.map((o) => `<b>${o}</b>`).join(', ')}` });
        break;
      case 'gameStarted':
        // cada jogo começa com as opções padrão no servidor
        set({ status: 'playing', gameId: m.gameId, playerId: m.playerId ?? undefined, replay: false, table: undefined, result: undefined, gameOver: undefined, log: [], gamePrefs: DEFAULT_GAME_PREFS });
        break;
      case 'replayStarted':
        set({ status: 'playing', gameId: m.gameId, playerId: undefined, replay: true, game: undefined, prompt: undefined, waiting: false, result: undefined, gameOver: undefined, log: [] });
        break;
      case 'replayEnd':
        set({ gameOver: m.message || 'Fim do replay.' });
        break;
      case 'replayDone':
        set({ status: 'online', replay: false, game: undefined, gameOver: undefined });
        break;
      case 'tournamentStarted':
        // a sala de espera da mesa do torneio dá lugar ao painel do torneio
        set({ tournament: { id: m.tournamentId, info: get().tournament?.info }, table: undefined, tableBusy: false });
        break;
      case 'tournamentInfo':
        set((s) => ({ tournament: s.tournament ? { ...s.tournament, info: m.tournament } : s.tournament }));
        break;
      case 'tournamentOver':
        set((s) => ({ tournament: s.tournament ? { ...s.tournament, over: m.message } : s.tournament }));
        break;
      case 'tournamentLeft':
        set({ tournament: undefined, draft: undefined, deckBuild: undefined });
        break;
      case 'draftStarted':
        set({ draft: { since: Date.now() } });
        break;
      case 'draft': {
        const prev = get().draft;
        const fresh = m.draft.booster !== undefined;
        set({ draft: { ...prev, ...m.draft, since: fresh ? Date.now() : (prev?.since ?? Date.now()) } });
        break;
      }
      case 'draftPicked':
        // a carta escolhida sai do booster até o próximo chegar
        set((s) => (s.draft ? { draft: { ...s.draft, picks: m.picks, booster: [] } } : {}));
        break;
      case 'draftOver':
        set({ draft: undefined });
        break;
      case 'roomUsers':
        set({ roomUsers: m.users });
        break;
      case 'finishedMatches':
        set({ finishedMatches: m.matches });
        break;
      case 'serverMessages':
        set({ serverMessages: m.messages });
        break;
      case 'game': {
        // atualização de um jogo que não é o atual (ex.: o jogo deixado ainda terminando no servidor):
        // ignora, como o cliente oficial faz com jogos sem painel aberto. Replays usam outro id.
        const current = get().gameId;
        if (m.gameId && current && m.gameId !== current && !m.method.startsWith('REPLAY_')) break;
        // GAME_UPDATE sem prompt não altera o pedido pendente
        const patch: Partial<State> = {};
        if (m.game) {
          patch.game = m.game;
          if (m.game.stack[0]?.id !== get().game?.stack[0]?.id) patch.stackLogMark = logSeq;
        }
        if (m.prompt) {
          if (m.method === 'GAME_INFORM_PERSONAL') {
            // No XMage, este aviso abre um diálogo separado e não cancela a decisão atual.
            patch.toast = { text: m.prompt.message, tone: 'info' };
          } else {
            patch.prompt = m.prompt;
            patch.waiting = m.prompt.kind !== 'inform';
          }
        }
        set(patch);
        break;
      }
      case 'chat':
        if (m.chat === 'room' || m.chat === 'table') {
          const kind = m.chat;
          set((s) => ({
            chats: { ...s.chats, [kind]: [...s.chats[kind].slice(-MAX_CHAT + 1), { id: ++chatSeq, user: m.username, html: m.message, type: m.type }] },
          }));
          // cochicho recebido longe do lobby (na partida): avisar, senão passa despercebido
          if (m.type === 'WHISPER_FROM' && get().status === 'playing') {
            set({ toast: { text: `${m.username} cochichou: ${m.message.replace(/<[^>]*>/g, '')}`, tone: 'info' } });
            pushLog({ kind: 'chat', html: `<i>(cochicho)</i> ${m.message}`, user: m.username });
          }
        } else {
          const talk = m.type === 'TALK' || m.type.startsWith('WHISPER');
          pushLog({ kind: talk ? 'chat' : 'game', html: m.message, turnInfo: m.turnInfo, user: talk ? m.username : undefined });
        }
        break;
      case 'lobbyOptions': {
        const { t: _t, ...opts } = m;
        set({ lobbyOptions: opts });
        break;
      }
      case 'tables':
        set({ tables: m.tables });
        break;
      case 'tableJoined':
        set({ table: { id: m.tableId, owner: false }, tableBusy: false, chats: { ...get().chats, table: [] } });
        break;
      case 'tableInfo':
        set({ table: { id: m.table.id, info: m.table, owner: m.owner } });
        break;
      case 'tableLeft':
        if (get().table && m.reason) set({ toast: { text: m.reason, tone: 'info' } });
        set({ table: undefined, tableBusy: false });
        break;
      case 'gameOver':
        pushLog({ kind: 'system', html: m.message });
        set({ waiting: false, prompt: undefined, gameOver: m.message });
        break;
      case 'endGame':
        set({ result: { won: m.won, title: m.title, info: m.info, extra: m.extra, matchOver: m.matchOver ?? true }, waiting: false });
        break;
      case 'localServer':
        set({ localServerStarting: m.state === 'starting' });
        break;
      case 'error':
      case 'gameError':
        set({ toast: { text: m.message, tone: 'error' }, localServerStarting: false, tableBusy: false, moxfieldBusy: undefined });
        pushLog({ kind: 'error', html: m.message });
        if (get().status === 'connecting') set({ status: 'offline' });
        if (get().status === 'starting') set({ status: 'online' });
        break;
      case 'serverMessage':
        pushLog({ kind: 'system', html: m.message });
        break;
      case 'userMessage':
        set({ toast: { text: m.lines.join(' — '), tone: 'info' }, moxfieldBusy: undefined });
        break;
      case 'deckBuild':
        set({ deckBuild: { ...m.build, since: Date.now() } });
        break;
      case 'deckBuildDone':
        set({ deckBuild: undefined });
        break;
      case 'userRequest': {
        const { t: _t, ...req } = m;
        if (req.buttons.length) set((s) => ({ userRequests: [...s.userRequests, req] }));
        else set({ toast: { text: `${m.title}: ${m.message}`, tone: 'info' } });
        break;
      }
      case 'event':
        break;
    }
  };

  /** Abre o WebSocket com os últimos dados de conexão; em quedas, tenta de novo mantendo a tela atual. */
  const openSocket = () => {
    if (!lastConnect) return;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    const { host, port, user, mode } = lastConnect;
    const socket = new WebSocket(gatewayUrl());
    ws = socket;
    socket.onopen = () => get().send({ t: 'connect', host, port, user, local: mode === 'local' });
    socket.onmessage = (ev) => {
      reconnectAttempts = 0;
      handle(JSON.parse(ev.data) as ServerMsg);
    };
    socket.onclose = () => {
      const status = get().status;
      const wasUp = status === 'playing' || status === 'online' || status === 'starting' || reconnectAttempts > 0;
      if (wasUp && reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++;
        set({ toast: { text: `Conexão perdida — reconectando (${reconnectAttempts}/${MAX_RECONNECT})…`, tone: 'info' } });
        setTimeout(openSocket, 1000 * reconnectAttempts);
        return;
      }
      reconnectAttempts = 0;
      set({ status: 'offline', localServerStarting: false, game: undefined, prompt: undefined, waiting: false });
    };
    socket.onerror = () => {
      if (reconnectAttempts === 0 && get().status === 'connecting') {
        set({ toast: { text: 'Não foi possível falar com o gateway (porta 8090). Ele está rodando?', tone: 'error' } });
      }
    };
  };

  return {
    status: 'offline',
    decks: [],
    waiting: false,
    log: [],
    stackLogMark: 0,
    view: 'home',
    userDecks: [],
    tables: [],
    chats: { room: [], table: [] },
    tableBusy: false,
    roomUsers: [],
    finishedMatches: [],
    serverMessages: [],
    replay: false,

    navigate: (view, extra) => set({ view, ...extra }),

    request: <T extends ServerMsg['t']>(cmd: Record<string, unknown>, t: T) =>
      new Promise<Extract<ServerMsg, { t: T }>>((resolve) => {
        const reqId = String(++reqSeq);
        waiters.push({ t, reqId, resolve: resolve as (m: ServerMsg) => void });
        get().send({ ...cmd, reqId });
      }),

    refreshUserDecks: () => get().send({ t: 'userDecks' }),
    linkMoxfield: (url) => {
      set({ moxfieldBusy: 'link' });
      get().send({ t: 'linkMoxfield', url });
    },
    syncMoxfield: (path) => {
      set({ moxfieldBusy: path });
      get().send({ t: 'syncMoxfield', path });
    },

    connect: (host, port, user, mode) => {
      lastConnect = { host, port, user, mode };
      reconnectAttempts = 0;
      set({ status: 'connecting', mode });
      openSocket();
    },

    disconnect: () => {
      sessionSet('fm.resume', null);
      get().send({ t: 'logout' });
      lastConnect = undefined;
      reconnectAttempts = 0;
      if (ws) {
        ws.onclose = null;
        ws.close();
        ws = undefined;
      }
      set({ status: 'offline', view: 'home', mode: undefined, localServerStarting: false, table: undefined, tables: [], chats: { room: [], table: [] }, lobbyOptions: undefined, game: undefined, prompt: undefined, waiting: false, server: undefined, clientVersion: undefined, serverVersion: undefined, deckBuild: undefined, userRequests: [], tournament: undefined, draft: undefined });
    },

    startGame: (format, deck, opponents, aiSkill, freeMulligans) => {
      set({ status: 'starting', result: undefined });
      get().send({ t: 'startGame', format, deck, opponents, aiSkill, freeMulligans });
    },

    toggleStop: (turn, key) => {
      const stops = get().stops;
      if (!stops) return;
      const next: Stops = { ...stops, [turn]: { ...stops[turn], [key]: !stops[turn][key] } };
      set({ stops: next }); // otimista; o gateway confirma com 'stops'
      get().send({ t: 'setStops', stops: next });
    },

    send: (cmd) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(cmd));
    },

    respondUUID: (id) => {
      set({ waiting: false });
      get().send({ t: 'sendUUID', id });
    },
    respondBoolean: (value) => {
      set({ waiting: false });
      get().send({ t: 'sendBoolean', value });
    },
    respondInteger: (value) => {
      set({ waiting: false });
      get().send({ t: 'sendInteger', value });
    },
    respondString: (value) => {
      set({ waiting: false });
      get().send({ t: 'sendString', value });
    },
    action: (action, data) => get().send({ t: 'action', action, data }),
    userRequests: [],
    userReply: (id, action) => {
      set((s) => ({ userRequests: s.userRequests.filter((r) => r.id !== id) }));
      get().send({ t: 'userReply', id, action });
    },
    gamePrefs: DEFAULT_GAME_PREFS,
    setGamePref: (key, value) => {
      set((s) => ({ gamePrefs: { ...s.gamePrefs, [key]: value } }));
      get().action(GAME_PREF_ACTIONS[key][value ? 0 : 1]);
    },

    setHovered: (id) => set({ hovered: id }),
    // o id também vai para `hovered`: se o objeto está na mesa, a prévia normal (e as setas) o mostram
    setHoveredRef: (ref) => set({ hoveredRef: ref, hovered: ref?.id }),
    tableBg: loadTableBg(),
    setTableBg: (bg) => {
      saveTableBg(bg);
      set({ tableBg: bg });
    },
    tableBgOpen: false,
    setTableBgOpen: (open) => set({ tableBgOpen: open }),
    dismissToast: () => set({ toast: undefined }),
    dismissResult: () => set({ result: undefined, gameOver: undefined }),
    leaveGame: () => {
      // o gateway sai da partida (ou só da mesa, se ela já acabou); sem isso ele reabriria o jogo ao reconectar
      get().send({ t: 'quit' });
      set({ status: 'online', view: 'home', game: undefined, prompt: undefined, result: undefined, gameOver: undefined, waiting: false, table: undefined, deckBuild: undefined, replay: false });
    },

    createTable: (opts) => {
      set({ tableBusy: true });
      get().send({ t: 'createTable', ...opts });
    },
    createTournament: (opts) => {
      set({ tableBusy: true });
      get().send({ t: 'createTournament', ...opts });
    },
    joinTable: (tableId, deck, password, tournament) => {
      set({ tableBusy: true });
      get().send({ t: 'joinTable', tableId, deck, password, tournament });
    },
    leaveTable: () => {
      get().send({ t: 'leaveTable' });
      set({ table: undefined });
    },
    sendChat: (chat, text) => get().send({ t: 'sendChat', chat, text }),
  };
});
