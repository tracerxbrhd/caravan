import { randomUUID } from 'node:crypto';
import websocket from '@fastify/websocket';
import {
  PROTOCOL_VERSION,
  clientCommandSchema,
  commandRejectedMessageSchema,
  protocolErrorMessageSchema,
  snapshotMessageSchema,
  type ClientCommand,
  type MatchId,
  type ServerMessage,
} from '@caravan/protocol';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { WebSocket } from 'ws';
import { SESSION_COOKIE_NAME, sessionAccount } from './accounts.js';
import type { Config } from './config.js';
import type { MatchService } from './match-service.js';

const MESSAGE_WINDOW_MS = 10_000;
const MAX_MESSAGES_PER_WINDOW = 30;
const HEARTBEAT_INTERVAL_MS = 10_000;
const DEADLINE_SWEEP_INTERVAL_MS = 1_000;
const CONTROL_REPLACED_CLOSE_CODE = 4001;

interface AuthenticatedUpgrade {
  readonly accountId: string;
  readonly sessionToken: string;
}

interface RealtimeConnection {
  readonly id: string;
  readonly socket: WebSocket;
  readonly accountId: string;
  readonly sessionToken: string;
  matchId: MatchId | null;
  alive: boolean;
}

function controlKey(accountId: string, matchId: MatchId): string {
  return `${accountId}:${matchId}`;
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
}

function protocolError(code: 'INVALID_MESSAGE' | 'UNSUPPORTED_PROTOCOL_VERSION'): ServerMessage {
  return protocolErrorMessageSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    type: 'PROTOCOL_ERROR',
    serverTimeMs: Date.now(),
    code,
  });
}

function parseCommandPayload(raw: string):
  | { readonly ok: true; readonly command: ClientCommand }
  | {
      readonly ok: false;
      readonly code: 'INVALID_MESSAGE' | 'UNSUPPORTED_PROTOCOL_VERSION';
    } {
  let input: unknown;
  try {
    input = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, code: 'INVALID_MESSAGE' };
  }

  if (
    typeof input === 'object' &&
    input !== null &&
    'protocolVersion' in input &&
    input.protocolVersion !== PROTOCOL_VERSION
  ) {
    return { ok: false, code: 'UNSUPPORTED_PROTOCOL_VERSION' };
  }

  const parsed = clientCommandSchema.safeParse(input);
  return parsed.success
    ? { ok: true, command: parsed.data }
    : { ok: false, code: 'INVALID_MESSAGE' };
}

function messageStateVersion(message: ServerMessage): number | null {
  if (message.type === 'SNAPSHOT') return message.snapshot.stateVersion;
  if (message.type === 'COMMAND_REJECTED') return message.stateVersion;
  return null;
}

export async function installRealtimeRuntime(
  app: FastifyInstance,
  pool: pg.Pool,
  config: Config,
  service: MatchService,
): Promise<void> {
  const connections = new Map<string, RealtimeConnection>();
  const controls = new Map<string, string>();
  const upgrades = new WeakMap<FastifyRequest, AuthenticatedUpgrade>();
  let shuttingDown = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let deadlineSweep: ReturnType<typeof setInterval> | null = null;

  await app.register(websocket, {
    options: { maxPayload: 16_384 },
    preClose: async () => {
      shuttingDown = true;
      if (heartbeat !== null) clearInterval(heartbeat);
      if (deadlineSweep !== null) clearInterval(deadlineSweep);
      controls.clear();

      for (const connection of connections.values()) {
        connection.socket.close(1012, 'SERVICE_RESTART');
      }

      await new Promise<void>((resolve, reject) => {
        app.websocketServer.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      });
    },
  });

  const stillAuthorized = async (connection: RealtimeConnection): Promise<boolean> => {
    try {
      const accountId = await sessionAccount(pool, connection.sessionToken);
      return accountId === connection.accountId;
    } catch {
      return false;
    }
  };

  const broadcastMatch = async (matchId: MatchId, exceptConnectionId?: string): Promise<void> => {
    for (const connection of connections.values()) {
      if (connection.id === exceptConnectionId || connection.matchId !== matchId) continue;
      if (controls.get(controlKey(connection.accountId, matchId)) !== connection.id) continue;
      if (!(await stillAuthorized(connection))) {
        connection.socket.close(1008, 'SESSION_EXPIRED');
        continue;
      }

      const snapshot = await service.getSnapshot(matchId, connection.accountId);
      if (snapshot === null) continue;
      send(
        connection.socket,
        snapshotMessageSchema.parse({
          protocolVersion: PROTOCOL_VERSION,
          type: 'SNAPSHOT',
          serverTimeMs: Date.now(),
          commandId: null,
          snapshot,
        }),
      );
    }
  };

  const releaseControl = async (
    connection: RealtimeConnection,
    persistDisconnect: boolean,
  ): Promise<void> => {
    const matchId = connection.matchId;
    if (matchId === null) return;

    const key = controlKey(connection.accountId, matchId);
    const ownsControl = controls.get(key) === connection.id;
    if (ownsControl) controls.delete(key);
    connection.matchId = null;

    if (!ownsControl || !persistDisconnect) return;
    await service.disconnectPlayer(matchId, connection.accountId);
    await broadcastMatch(matchId);
  };

  const rejectWithoutControl = async (
    connection: RealtimeConnection,
    command: Exclude<ClientCommand, { readonly type: 'RESYNC' }>,
  ): Promise<void> => {
    const snapshot = await service.getSnapshot(command.matchId, connection.accountId);
    const base = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'COMMAND_REJECTED' as const,
      serverTimeMs: Date.now(),
      matchId: command.matchId,
      commandId: command.commandId,
      stateVersion: snapshot?.stateVersion ?? 0,
      code: 'CONNECTION_NOT_OWNER' as const,
      retryable: true,
      gameErrorCode: null,
    };
    send(
      connection.socket,
      commandRejectedMessageSchema.parse(
        snapshot === null
          ? base
          : {
              ...base,
              snapshot,
            },
      ),
    );
  };

  const handleResync = async (
    connection: RealtimeConnection,
    command: Extract<ClientCommand, { readonly type: 'RESYNC' }>,
  ): Promise<void> => {
    const visible = await service.getSnapshot(command.matchId, connection.accountId);
    if (visible === null) {
      send(connection.socket, await service.handleCommand(connection.accountId, command));
      return;
    }

    if (connection.matchId !== null && connection.matchId !== command.matchId) {
      await releaseControl(connection, true);
    }

    const connected = await service.connectPlayer(command.matchId, connection.accountId);
    if (connected === null) {
      send(connection.socket, await service.handleCommand(connection.accountId, command));
      return;
    }

    const key = controlKey(connection.accountId, command.matchId);
    const previousController = controls.get(key);
    controls.set(key, connection.id);
    connection.matchId = command.matchId;

    if (previousController !== undefined && previousController !== connection.id) {
      connections
        .get(previousController)
        ?.socket.close(CONTROL_REPLACED_CLOSE_CODE, 'CONTROL_REPLACED');
    }

    const response = await service.handleCommand(connection.accountId, command);
    send(connection.socket, response);
    await broadcastMatch(command.matchId, connection.id);
  };

  const handleStateChangingCommand = async (
    connection: RealtimeConnection,
    command: Exclude<ClientCommand, { readonly type: 'RESYNC' }>,
  ): Promise<void> => {
    if (
      connection.matchId !== command.matchId ||
      controls.get(controlKey(connection.accountId, command.matchId)) !== connection.id
    ) {
      await rejectWithoutControl(connection, command);
      return;
    }

    const before = await service.getSnapshot(command.matchId, connection.accountId);
    if (before === null) {
      await rejectWithoutControl(connection, command);
      return;
    }
    if (before.status === 'ACTIVE' && before.turnDeadlineAtMs === null) {
      send(
        connection.socket,
        commandRejectedMessageSchema.parse({
          protocolVersion: PROTOCOL_VERSION,
          type: 'COMMAND_REJECTED',
          serverTimeMs: Date.now(),
          matchId: command.matchId,
          commandId: command.commandId,
          stateVersion: before.stateVersion,
          code: 'MATCH_NOT_READY',
          retryable: true,
          gameErrorCode: null,
          snapshot: before,
        }),
      );
      return;
    }

    const response = await service.handleCommand(connection.accountId, command);
    send(connection.socket, response);

    const afterVersion = messageStateVersion(response);
    if (afterVersion !== null && afterVersion !== before.stateVersion) {
      await broadcastMatch(command.matchId, connection.id);
    }
  };

  await service.recoverConnectionsAfterRestart();

  app.get(
    '/ws',
    {
      websocket: true,
      preValidation: async (request) => {
        if (request.headers.origin !== config.PUBLIC_ORIGIN) throw new Error('INVALID_ORIGIN');
        const sessionToken = request.cookies[SESSION_COOKIE_NAME];
        const accountId = await sessionAccount(pool, sessionToken);
        if (sessionToken === undefined) throw new Error('UNAUTHENTICATED');
        upgrades.set(request, { accountId, sessionToken });
      },
    },
    (socket, request) => {
      const upgrade = upgrades.get(request);
      upgrades.delete(request);
      if (upgrade === undefined) {
        socket.close(1011, 'AUTH_CONTEXT_MISSING');
        return;
      }

      const connection: RealtimeConnection = {
        id: randomUUID(),
        socket,
        accountId: upgrade.accountId,
        sessionToken: upgrade.sessionToken,
        matchId: null,
        alive: true,
      };
      connections.set(connection.id, connection);

      let messagesInWindow = 0;
      let windowStartedAt = Date.now();
      let pending = Promise.resolve();

      socket.on('message', (data) => {
        pending = pending
          .then(async () => {
            if (!(await stillAuthorized(connection))) {
              socket.close(1008, 'SESSION_EXPIRED');
              return;
            }

            const now = Date.now();
            if (now - windowStartedAt >= MESSAGE_WINDOW_MS) {
              windowStartedAt = now;
              messagesInWindow = 0;
            }
            messagesInWindow += 1;
            if (messagesInWindow > MAX_MESSAGES_PER_WINDOW) {
              socket.close(1008, 'RATE_LIMIT');
              return;
            }

            const parsed = parseCommandPayload(data.toString());
            if (!parsed.ok) {
              send(socket, protocolError(parsed.code));
              return;
            }

            if (parsed.command.type === 'RESYNC') {
              await handleResync(connection, parsed.command);
              return;
            }
            await handleStateChangingCommand(connection, parsed.command);
          })
          .catch((error: unknown) => {
            const code =
              error instanceof Error && /^[A-Z_]+$/.test(error.message)
                ? error.message
                : 'INTERNAL_ERROR';
            app.log.warn({ code, connectionId: connection.id }, 'Realtime command failed');
            if (code === 'UNAUTHENTICATED' || code === 'ACCOUNT_DISABLED') {
              socket.close(1008, 'SESSION_EXPIRED');
            } else {
              socket.close(1011, 'INTERNAL_ERROR');
            }
          });
      });

      socket.on('pong', () => {
        connection.alive = true;
      });

      socket.on('close', () => {
        void pending
          .then(async () => {
            connections.delete(connection.id);
            await releaseControl(connection, !shuttingDown);
          })
          .catch((error: unknown) => {
            app.log.error(
              { err: error, connectionId: connection.id },
              'Realtime disconnect failed',
            );
          });
      });
    },
  );

  let heartbeatRunning = false;
  heartbeat = setInterval(() => {
    if (heartbeatRunning) return;
    heartbeatRunning = true;
    void (async () => {
      try {
        for (const connection of connections.values()) {
          if (!(await stillAuthorized(connection))) {
            connection.socket.close(1008, 'SESSION_EXPIRED');
            continue;
          }
          if (!connection.alive) {
            connection.socket.terminate();
            continue;
          }
          connection.alive = false;
          connection.socket.ping();
        }
      } finally {
        heartbeatRunning = false;
      }
    })().catch((error: unknown) => {
      app.log.error({ err: error }, 'Realtime heartbeat failed');
    });
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  let deadlineSweepRunning = false;
  deadlineSweep = setInterval(() => {
    if (deadlineSweepRunning) return;
    deadlineSweepRunning = true;
    void (async () => {
      try {
        for (const matchId of await service.expireAllDue()) {
          await broadcastMatch(matchId);
        }
      } finally {
        deadlineSweepRunning = false;
      }
    })().catch((error: unknown) => {
      app.log.error({ err: error }, 'Realtime deadline sweep failed');
    });
  }, DEADLINE_SWEEP_INTERVAL_MS);
  deadlineSweep.unref();
}
