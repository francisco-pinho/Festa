/**
 * Liga o RoomManager ao Socket.IO: valida mensagens, junta sockets às salas
 * e encaminha input (telemóvel → host) e mensagens (host → telemóvel).
 */
import type { Server, Socket } from 'socket.io';
import {
  controllerInputSchema,
  hostResumeSchema,
  hostSendSchema,
  playerIdSchema,
  playerJoinSchema,
  rtcSendSchema,
  viewerJoinSchema,
} from '@festa/shared/schemas';
import type {
  ClientToServerEvents,
  HostToControllerMessage,
  ServerToClientEvents,
} from '@festa/shared';
import { RoomManager, type Room, type RoomManagerOptions } from './rooms';

export type FestaServer = Server<ClientToServerEvents, ServerToClientEvents>;
type FestaSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface SocketServerOptions extends RoomManagerOptions {
  /** Máximo de mensagens de input por segundo, por telemóvel. */
  inputRatePerSec: number;
  /** Máximo de espectadores do vídeo por sala. */
  maxViewersPerRoom?: number;
}

export function registerSocketHandlers(io: FestaServer, opts: SocketServerOptions): RoomManager {
  const manager = new RoomManager(
    {
      onPlayersChanged: (room) => io.to(room.code).emit('room:players', room.snapshot()),
      onHostStatus: (room, connected) => io.to(room.code).emit('room:hostStatus', connected),
      onRoomClosed: (room, reason) => {
        io.to(room.code).emit('room:closed', reason);
        io.in(room.code).socketsLeave(room.code);
      },
    },
    opts,
  );

  /** Tira o socket da sala Socket.IO em que estava (se mudar de sala). */
  const leaveCurrentRoom = (socket: FestaSocket) => {
    const current = manager.lookup(socket.id);
    if (current) void socket.leave(current.room.code);
  };

  const replaceSocket = (oldId: string | null) => {
    if (!oldId) return;
    const old = io.sockets.sockets.get(oldId);
    if (!old) return;
    old.emit('room:closed', 'REPLACED');
    old.disconnect(true);
  };

  const deliver = (room: Room, to: string, message: HostToControllerMessage) => {
    const targets = to === 'all' ? [...room.players.values()] : [room.players.get(to)];
    for (const player of targets) {
      if (!player) continue;
      if (message.t === 'layout') player.layout = message.layout;
      if (player.socketId) io.to(player.socketId).emit('controller:message', message);
    }
  };

  /** Espectadores do vídeo: socket → código da sala. Não ocupam lugar de jogador. */
  const viewers = new Map<string, string>();
  const viewersOf = (code: string) => [...viewers].filter(([, c]) => c === code).map(([id]) => id);
  /** O host (re)ligou-se: avisa-o dos espectadores que já estavam à espera. */
  const announceViewers = (socket: FestaSocket, code: string) => {
    for (const id of viewersOf(code)) socket.emit('viewer:joined', id);
  };

  io.on('connection', (socket: FestaSocket) => {
    const allowInput = createRateLimiter(opts.inputRatePerSec);
    const allowSignal = createRateLimiter(60);

    // ── Host ──────────────────────────────────────────────
    socket.on('host:create', (ack) => {
      if (typeof ack !== 'function') return;
      leaveCurrentRoom(socket);
      const res = manager.createRoom(socket.id);
      if (!res.ok) return ack(res);
      void socket.join(res.room.code);
      ack({ ok: true, roomCode: res.room.code, hostToken: res.room.hostToken });
      socket.emit('room:players', res.room.snapshot());
      announceViewers(socket, res.room.code);
    });

    socket.on('host:resume', (req, ack) => {
      if (typeof ack !== 'function') return;
      const parsed = hostResumeSchema.safeParse(req);
      if (!parsed.success) return ack({ ok: false, error: 'INVALID_REQUEST' });
      const previous = manager.lookup(socket.id);
      const res = manager.resumeHost(parsed.data.roomCode, parsed.data.hostToken, socket.id);
      if (!res.ok) return ack(res);
      if (previous && previous.room.code !== res.room.code) void socket.leave(previous.room.code);
      replaceSocket(res.replacedSocketId);
      void socket.join(res.room.code);
      ack({ ok: true, roomCode: res.room.code });
      socket.emit('room:players', res.room.snapshot());
      announceViewers(socket, res.room.code);
    });

    socket.on('host:send', (req) => {
      const found = manager.lookup(socket.id);
      if (found?.binding.role !== 'host') return;
      const parsed = hostSendSchema.safeParse(req);
      if (!parsed.success) return;
      deliver(found.room, parsed.data.to, parsed.data.message);
    });

    socket.on('host:lock', (locked) => {
      if (typeof locked !== 'boolean') return;
      manager.setLocked(socket.id, locked);
    });

    socket.on('host:kick', (playerId) => {
      if (!playerIdSchema.safeParse(playerId).success) return;
      const res = manager.kick(socket.id, playerId);
      if (!res?.socketId) return;
      const kicked = io.sockets.sockets.get(res.socketId);
      if (!kicked) return;
      kicked.emit('room:closed', 'KICKED');
      void kicked.leave(res.room.code);
    });

    // ── Telemóvel ─────────────────────────────────────────
    socket.on('player:join', (req, ack) => {
      if (typeof ack !== 'function') return;
      const parsed = playerJoinSchema.safeParse(req);
      if (!parsed.success) return ack({ ok: false, error: 'INVALID_REQUEST' });
      const { roomCode, name, sessionToken } = parsed.data;

      const previous = manager.lookup(socket.id);
      const res = manager.joinPlayer(roomCode, name, sessionToken, socket.id);
      if (!res.ok) return ack(res);
      if (previous && previous.room.code !== res.room.code) void socket.leave(previous.room.code);
      replaceSocket(res.replacedSocketId);
      void socket.join(res.room.code);

      const info = res.room.snapshot().find((p) => p.id === res.player.id)!;
      ack({ ok: true, roomCode: res.room.code, player: info, sessionToken: res.player.sessionToken });
      socket.emit('room:players', res.room.snapshot());
      if (!res.room.hostConnected) socket.emit('room:hostStatus', false);
      if (res.player.layout) {
        socket.emit('controller:message', { t: 'layout', layout: res.player.layout });
      }
    });

    socket.on('player:input', (input) => {
      if (!allowInput()) return;
      const found = manager.lookup(socket.id);
      if (found?.binding.role !== 'player' || !found.room.hostSocketId) return;
      const parsed = controllerInputSchema.safeParse(input);
      if (!parsed.success) return;
      io.to(found.room.hostSocketId).emit('host:input', {
        playerId: found.binding.playerId,
        input: parsed.data,
      });
    });

    // ── Espectador (vídeo do ecrã) ────────────────────────
    socket.on('viewer:join', (req, ack) => {
      if (typeof ack !== 'function') return;
      const parsed = viewerJoinSchema.safeParse(req);
      if (!parsed.success) return ack({ ok: false, error: 'INVALID_REQUEST' });
      const room = manager.getRoom(parsed.data.roomCode);
      if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });
      if (!viewers.has(socket.id) && viewersOf(room.code).length >= (opts.maxViewersPerRoom ?? 8)) return ack({ ok: false, error: 'ROOM_FULL' });
      viewers.set(socket.id, room.code);
      ack({ ok: true, viewerId: socket.id });
      if (room.hostSocketId) io.to(room.hostSocketId).emit('viewer:joined', socket.id);
    });

    socket.on('rtc:signal', (msg) => {
      if (!allowSignal()) return;
      const parsed = rtcSendSchema.safeParse(msg);
      if (!parsed.success) return;
      const { to, data } = parsed.data;
      const viewerRoom = viewers.get(socket.id);
      if (viewerRoom) {
        // Espectador → host da sua sala
        const room = manager.getRoom(viewerRoom);
        if (to === 'host' && room?.hostSocketId) io.to(room.hostSocketId).emit('rtc:signal', { from: socket.id, data });
        return;
      }
      // Host → um espectador da sua sala
      const found = manager.lookup(socket.id);
      if (found?.binding.role !== 'host') return;
      if (viewers.get(to) === found.room.code) io.to(to).emit('rtc:signal', { from: 'host', data });
    });

    socket.on('disconnect', () => {
      const viewerRoom = viewers.get(socket.id);
      if (viewerRoom) {
        viewers.delete(socket.id);
        const host = manager.getRoom(viewerRoom)?.hostSocketId;
        if (host) io.to(host).emit('viewer:left', socket.id);
        return;
      }
      manager.disconnect(socket.id);
    });
  });

  return manager;
}

/** Token bucket simples: permite rajadas curtas mas limita a média. */
function createRateLimiter(perSecond: number): () => boolean {
  let tokens = perSecond;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(perSecond, tokens + ((now - last) / 1000) * perSecond);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}
