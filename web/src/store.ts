import { create } from 'zustand';
import type { DeckSummary, FormatId, Game, Prompt, ServerMsg, StopKey, Stops } from './types';

type Status = 'offline' | 'connecting' | 'online' | 'starting' | 'playing';
/** telas dentro do app (fora da partida) */
export type View = 'home' | 'play' | 'decks' | 'editor';

export type LogLine = { id: number; html: string; turnInfo?: string; kind: 'game' | 'chat' | 'system' | 'error' };

type State = {
  status: Status;
  user?: string;
  server?: string;
  decks: string[];
  gameId?: string;
  playerId?: string;
  game?: Game;
  prompt?: Prompt;
  /** quando o servidor pede resposta e ainda não respondemos */
  waiting: boolean;
  log: LogLine[];
  toast?: { text: string; tone: 'error' | 'info' };
  result?: { won: boolean; title: string; info: string };
  hovered?: string; // id da carta sob o cursor (para o preview grande)
  /** paradas de prioridade por passo (preferência do usuário no servidor XMage) */
  stops?: Stops;

  view: View;
  /** deck aberto no editor: caminho (null = deck novo) e texto a importar ao abrir */
  editor?: { path: string | null; importText?: string };
  userDecks: DeckSummary[];
  /** deck pré-selecionado na tela "Jogar" */
  playDeck?: string;

  connect: (host: string, port: number, user: string) => void;
  navigate: (view: View, extra?: Partial<Pick<State, 'editor' | 'playDeck'>>) => void;
  /** comando ao gateway que espera uma resposta do tipo `t` */
  request: <T extends ServerMsg['t']>(cmd: Record<string, unknown>, t: T) => Promise<Extract<ServerMsg, { t: T }>>;
  refreshUserDecks: () => void;
  startGame: (format: FormatId, deck: string | undefined, opponents: (string | null)[], aiSkill: number) => void;
  toggleStop: (turn: keyof Stops, key: StopKey) => void;
  send: (cmd: Record<string, unknown>) => void;
  respondUUID: (id: string) => void;
  respondBoolean: (value: boolean) => void;
  respondInteger: (value: number) => void;
  respondString: (value: string | null) => void;
  action: (action: string) => void;
  setHovered: (id?: string) => void;
  dismissToast: () => void;
  leaveGame: () => void;
};

let ws: WebSocket | undefined;
let logSeq = 0;
const MAX_LOG = 300;
// reconexão automática: o gateway mantém a sessão XMage por ~2 min após a queda
let lastConnect: { host: string; port: number; user: string } | undefined;
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
        // ao retomar uma sessão no meio da partida, a tela de jogo continua (o estado chega em seguida)
        set({ status: get().status === 'playing' ? 'playing' : 'online', user: m.user, server: m.server, stops: m.stops });
        get().send({ t: 'listDecks' });
        get().refreshUserDecks();
        break;
      case 'userDecks':
        set({ userDecks: m.decks });
        break;
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
        set({ status: 'playing', gameId: m.gameId, playerId: m.playerId, result: undefined, log: [] });
        break;
      case 'game': {
        // GAME_UPDATE sem prompt não altera o pedido pendente
        const patch: Partial<State> = {};
        if (m.game) patch.game = m.game;
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
        pushLog({ kind: m.type === 'TALK' ? 'chat' : 'game', html: m.message, turnInfo: m.turnInfo });
        break;
      case 'gameOver':
        pushLog({ kind: 'system', html: m.message });
        set({ waiting: false });
        break;
      case 'endGame':
        set({ result: { won: m.won, title: m.title, info: m.info }, waiting: false });
        break;
      case 'error':
      case 'gameError':
        set({ toast: { text: m.message, tone: 'error' } });
        pushLog({ kind: 'error', html: m.message });
        if (get().status === 'connecting') set({ status: 'offline' });
        if (get().status === 'starting') set({ status: 'online' });
        break;
      case 'serverMessage':
        pushLog({ kind: 'system', html: m.message });
        break;
      case 'userMessage':
        set({ toast: { text: m.lines.join(' — '), tone: 'info' } });
        break;
      case 'userRequest':
        set({ toast: { text: `${m.title}: ${m.message}`, tone: 'info' } });
        break;
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
    const { host, port, user } = lastConnect;
    const socket = new WebSocket(gatewayUrl());
    ws = socket;
    socket.onopen = () => get().send({ t: 'connect', host, port, user });
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
      set({ status: 'offline', game: undefined, prompt: undefined, waiting: false });
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
    view: 'home',
    userDecks: [],

    navigate: (view, extra) => set({ view, ...extra }),

    request: <T extends ServerMsg['t']>(cmd: Record<string, unknown>, t: T) =>
      new Promise<Extract<ServerMsg, { t: T }>>((resolve) => {
        const reqId = String(++reqSeq);
        waiters.push({ t, reqId, resolve: resolve as (m: ServerMsg) => void });
        get().send({ ...cmd, reqId });
      }),

    refreshUserDecks: () => get().send({ t: 'userDecks' }),

    connect: (host, port, user) => {
      lastConnect = { host, port, user };
      reconnectAttempts = 0;
      set({ status: 'connecting' });
      openSocket();
    },

    startGame: (format, deck, opponents, aiSkill) => {
      set({ status: 'starting', result: undefined });
      get().send({ t: 'startGame', format, deck, opponents, aiSkill });
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
    action: (action) => get().send({ t: 'action', action }),

    setHovered: (id) => set({ hovered: id }),
    dismissToast: () => set({ toast: undefined }),
    leaveGame: () => set({ status: 'online', view: 'home', game: undefined, prompt: undefined, result: undefined, waiting: false }),
  };
});
