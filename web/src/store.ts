import { create } from 'zustand';
import type { FormatId, Game, Prompt, ServerMsg, StopKey, Stops } from './types';

type Status = 'offline' | 'connecting' | 'online' | 'starting' | 'playing';

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

  connect: (host: string, port: number, user: string) => void;
  startGame: (format: FormatId, deck: string | undefined, opponents: (string | null)[]) => void;
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

function gatewayUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export const useStore = create<State>((set, get) => {
  const pushLog = (line: Omit<LogLine, 'id'>) =>
    set((s) => ({ log: [...s.log.slice(-MAX_LOG + 1), { ...line, id: ++logSeq }] }));

  const handle = (m: ServerMsg) => {
    switch (m.t) {
      case 'connected':
        set({ status: 'online', user: m.user, server: m.server, stops: m.stops });
        get().send({ t: 'listDecks' });
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
          patch.prompt = m.prompt;
          patch.waiting = m.prompt.kind !== 'inform';
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

  return {
    status: 'offline',
    decks: [],
    waiting: false,
    log: [],

    connect: (host, port, user) => {
      ws?.close();
      set({ status: 'connecting' });
      ws = new WebSocket(gatewayUrl());
      ws.onopen = () => get().send({ t: 'connect', host, port, user });
      ws.onmessage = (ev) => handle(JSON.parse(ev.data) as ServerMsg);
      ws.onclose = () => set({ status: 'offline', game: undefined, prompt: undefined, waiting: false });
      ws.onerror = () =>
        set({ toast: { text: 'Não foi possível falar com o gateway (porta 8090). Ele está rodando?', tone: 'error' } });
    },

    startGame: (format, deck, opponents) => {
      set({ status: 'starting', result: undefined });
      get().send({ t: 'startGame', format, deck, opponents });
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
    leaveGame: () => set({ status: 'online', game: undefined, prompt: undefined, result: undefined, waiting: false }),
  };
});
