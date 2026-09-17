import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectMatch } from '../src/realtime.js';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  send(value: string): void {
    this.sent.push(value);
  }

  close(code = 1000, reason = ''): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('crypto', { randomUUID: () => '22222222-2222-4222-8222-222222222222' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('match realtime connection', () => {
  it('claims control with RESYNC and does not send gameplay before a snapshot', () => {
    const states: string[] = [];
    const connection = connectMatch(
      MATCH_ID,
      { onConnectionState: (state) => states.push(state), onSnapshot: () => undefined },
      { url: 'ws://example/ws' },
    );
    const socket = FakeWebSocket.instances[0]!;
    socket.open();

    expect(JSON.parse(socket.sent[0]!)).toEqual({
      protocolVersion: 1,
      type: 'RESYNC',
      matchId: MATCH_ID,
      commandId: '22222222-2222-4222-8222-222222222222',
      knownStateVersion: null,
    });
    expect(connection.sendAction({ type: 'DISCARD_HAND_CARD', cardId: 'card-1' })).toBe(false);
    expect(states).toEqual(['CONNECTING', 'ONLINE']);
    connection.close();
  });

  it('reconnects with bounded backoff after ordinary socket loss', () => {
    const states: string[] = [];
    const connection = connectMatch(
      MATCH_ID,
      { onConnectionState: (state) => states.push(state), onSnapshot: () => undefined },
      { url: 'ws://example/ws', reconnectBaseMs: 500, reconnectMaxMs: 1000 },
    );
    const first = FakeWebSocket.instances[0]!;
    first.open();
    first.close(1006);
    expect(states.at(-1)).toBe('RECONNECTING');

    vi.advanceTimersByTime(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    connection.close();
  });

  it('pauses after control replacement and only reconnects when the player explicitly reclaims control', () => {
    const states: string[] = [];
    const stops: string[] = [];
    const connection = connectMatch(
      MATCH_ID,
      {
        onConnectionState: (state) => states.push(state),
        onSnapshot: () => undefined,
        onConnectionStopped: (reason) => stops.push(reason),
      },
      { url: 'ws://example/ws', reconnectBaseMs: 500 },
    );
    const first = FakeWebSocket.instances[0]!;
    first.open();
    first.close(4001, 'CONTROL_REPLACED');

    vi.advanceTimersByTime(5_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(states.at(-1)).toBe('STOPPED');
    expect(stops).toEqual(['CONTROL_REPLACED']);

    expect(connection.requestControl()).toBe(true);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1]!.open();
    expect(JSON.parse(FakeWebSocket.instances[1]!.sent[0]!)).toMatchObject({ type: 'RESYNC' });
    connection.close();
  });

  it('stops permanently when the authenticated session expires', () => {
    const states: string[] = [];
    const stops: string[] = [];
    const connection = connectMatch(
      MATCH_ID,
      {
        onConnectionState: (state) => states.push(state),
        onSnapshot: () => undefined,
        onConnectionStopped: (reason) => stops.push(reason),
      },
      { url: 'ws://example/ws', reconnectBaseMs: 500 },
    );
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.close(1008, 'SESSION_EXPIRED');

    vi.advanceTimersByTime(5_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(states.at(-1)).toBe('STOPPED');
    expect(stops).toEqual(['SESSION_EXPIRED']);
    expect(connection.requestControl()).toBe(false);
  });
});
