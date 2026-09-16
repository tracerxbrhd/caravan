import {
  PROTOCOL_VERSION,
  parseServerMessage,
  type CommandRejectionCode,
  type MatchId,
  type MatchSnapshot,
  type ServerMessage,
  type WireGameAction,
} from '@caravan/protocol';

export type MatchConnectionState = 'CONNECTING' | 'ONLINE' | 'RECONNECTING' | 'STOPPED';

export interface MatchRealtimeHandlers {
  onConnectionState(state: MatchConnectionState): void;
  onSnapshot(snapshot: MatchSnapshot): void;
  onRejected?(code: CommandRejectionCode): void;
  onProtocolError?(): void;
}

export interface MatchRealtimeOptions {
  readonly url?: string;
  readonly reconnectBaseMs?: number;
  readonly reconnectMaxMs?: number;
}

export interface MatchRealtimeConnection {
  close(): void;
  requestControl(): boolean;
  sendAction(action: WireGameAction): boolean;
  surrender(): boolean;
  currentSnapshot(): MatchSnapshot | null;
}

function defaultWebSocketUrl(): string {
  return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
}

export function connectMatch(
  matchId: MatchId,
  handlers: MatchRealtimeHandlers,
  options: MatchRealtimeOptions = {},
): MatchRealtimeConnection {
  let socket: WebSocket | undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reconnectDelay = options.reconnectBaseMs ?? 500;
  const maxReconnectDelay = options.reconnectMaxMs ?? 10_000;
  let latestSnapshot: MatchSnapshot | null = null;
  const url = options.url ?? defaultWebSocketUrl();

  const send = (message: object): boolean => {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  };

  const requestControl = (): boolean =>
    send({
      protocolVersion: PROTOCOL_VERSION,
      type: 'RESYNC',
      matchId,
      commandId: crypto.randomUUID(),
      knownStateVersion: latestSnapshot?.stateVersion ?? null,
    });

  const receive = (message: ServerMessage): void => {
    if (message.type === 'SNAPSHOT') {
      latestSnapshot = message.snapshot;
      handlers.onSnapshot(message.snapshot);
      return;
    }
    if (message.type === 'COMMAND_REJECTED') {
      if (message.snapshot !== undefined) {
        latestSnapshot = message.snapshot;
        handlers.onSnapshot(message.snapshot);
      }
      handlers.onRejected?.(message.code);
      return;
    }
    handlers.onProtocolError?.();
  };

  const open = (): void => {
    if (stopped) return;
    handlers.onConnectionState(latestSnapshot === null ? 'CONNECTING' : 'RECONNECTING');
    socket = new WebSocket(url);
    socket.onopen = () => {
      reconnectDelay = options.reconnectBaseMs ?? 500;
      handlers.onConnectionState('ONLINE');
      requestControl();
    };
    socket.onmessage = (event) => {
      try {
        const input = JSON.parse(String(event.data)) as unknown;
        receive(parseServerMessage(input));
      } catch {
        handlers.onProtocolError?.();
        socket?.close();
      }
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      if (stopped) return;
      handlers.onConnectionState('RECONNECTING');
      timer = setTimeout(open, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
    };
  };

  open();

  return {
    close: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      socket?.close();
      handlers.onConnectionState('STOPPED');
    },
    requestControl,
    sendAction: (action) => {
      if (latestSnapshot === null || latestSnapshot.status !== 'ACTIVE') return false;
      return send({
        protocolVersion: PROTOCOL_VERSION,
        type: 'GAME_ACTION',
        matchId,
        commandId: crypto.randomUUID(),
        expectedStateVersion: latestSnapshot.stateVersion,
        action,
      });
    },
    surrender: () => {
      if (latestSnapshot === null || latestSnapshot.status !== 'ACTIVE') return false;
      return send({
        protocolVersion: PROTOCOL_VERSION,
        type: 'SURRENDER',
        matchId,
        commandId: crypto.randomUUID(),
        expectedStateVersion: latestSnapshot.stateVersion,
      });
    },
    currentSnapshot: () => latestSnapshot,
  };
}
