/**
 * Gestão de salas, independente do Socket.IO (fácil de testar).
 *
 * Uma sala tem:
 *  - um host (o ecrã principal no PC), identificado por um hostToken secreto
 *    para poder recuperar a sala se a página for recarregada;
 *  - até MAX_PLAYERS jogadores, cada um com um sessionToken secreto que
 *    permite voltar ao mesmo lugar depois de perder a ligação.
 */
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  MAX_PLAYERS,
  NAME_MAX_LENGTH,
  PLAYER_COLORS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from '@festa/shared';
import type {
  CloseReason,
  ControllerLayout,
  ErrorCode,
  PlayerId,
  PlayerInfo,
} from '@festa/shared';

type Timer = ReturnType<typeof setTimeout>;

export interface PlayerRecord {
  id: PlayerId;
  name: string;
  color: string;
  sessionToken: string;
  socketId: string | null;
  /** Último layout enviado pelo host, reenviado quando o telemóvel volta. */
  layout: ControllerLayout | null;
  removeTimer: Timer | null;
}

export class Room {
  hostSocketId: string | null;
  hostTimer: Timer | null = null;
  locked = false;
  /** Map preserva a ordem de entrada. */
  readonly players = new Map<PlayerId, PlayerRecord>();

  constructor(
    readonly code: string,
    readonly hostToken: string,
    hostSocketId: string,
  ) {
    this.hostSocketId = hostSocketId;
  }

  get hostConnected(): boolean {
    return this.hostSocketId !== null;
  }

  snapshot(): PlayerInfo[] {
    const list = [...this.players.values()];
    // VIP = o jogador ligado há mais tempo na sala.
    const vip = list.find((p) => p.socketId !== null) ?? null;
    return list.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      connected: p.socketId !== null,
      isVip: p === vip,
    }));
  }

  findBySession(token: string): PlayerRecord | undefined {
    for (const p of this.players.values()) if (p.sessionToken === token) return p;
    return undefined;
  }

  nextColor(): string {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0];
  }

  uniqueName(name: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const suffix = ` ${n}`;
      const base = Array.from(name).slice(0, NAME_MAX_LENGTH - suffix.length).join('');
      const candidate = `${base}${suffix}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }
}

export function sanitizeName(raw: string): string | null {
  const cleaned = raw
    .normalize('NFC')
    .replace(/\p{C}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const name = Array.from(cleaned).slice(0, NAME_MAX_LENGTH).join('').trim();
  return name.length > 0 ? name : null;
}

export interface RoomHooks {
  onPlayersChanged(room: Room): void;
  onHostStatus(room: Room, connected: boolean): void;
  /** Chamado antes de a sala ser apagada, para avisar todos os sockets. */
  onRoomClosed(room: Room, reason: CloseReason): void;
}

export interface RoomManagerOptions {
  /** Quanto tempo a sala espera que o host volte antes de fechar. */
  hostGraceMs: number;
  /** No lobby, quanto tempo um jogador desligado mantém o lugar. */
  playerLobbyGraceMs: number;
  maxRooms: number;
}

type SocketBinding =
  | { role: 'host'; code: string }
  | { role: 'player'; code: string; playerId: PlayerId };

export type Fail = { ok: false; error: ErrorCode };

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly sockets = new Map<string, SocketBinding>();

  constructor(
    private readonly hooks: RoomHooks,
    private readonly opts: RoomManagerOptions,
  ) {}

  get roomCount(): number {
    return this.rooms.size;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  lookup(socketId: string): { room: Room; binding: SocketBinding } | null {
    const binding = this.sockets.get(socketId);
    if (!binding) return null;
    const room = this.rooms.get(binding.code);
    if (!room) {
      this.sockets.delete(socketId);
      return null;
    }
    return { room, binding };
  }

  // ── Host ────────────────────────────────────────────────

  createRoom(socketId: string): { ok: true; room: Room } | Fail {
    this.detach(socketId);
    if (this.rooms.size >= this.opts.maxRooms) return { ok: false, error: 'SERVER_FULL' };
    const room = new Room(this.generateCode(), randomBytes(24).toString('base64url'), socketId);
    this.rooms.set(room.code, room);
    this.sockets.set(socketId, { role: 'host', code: room.code });
    return { ok: true, room };
  }

  resumeHost(
    code: string,
    hostToken: string,
    socketId: string,
  ): { ok: true; room: Room; replacedSocketId: string | null } | Fail {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
    if (room.hostToken !== hostToken) return { ok: false, error: 'HOST_TOKEN_INVALID' };

    const binding = this.sockets.get(socketId);
    if (!(binding?.role === 'host' && binding.code === code)) this.detach(socketId);

    const replaced = room.hostSocketId !== socketId ? room.hostSocketId : null;
    if (replaced) this.sockets.delete(replaced);
    if (room.hostTimer) clearTimeout(room.hostTimer);
    room.hostTimer = null;
    const wasConnected = room.hostConnected;
    room.hostSocketId = socketId;
    this.sockets.set(socketId, { role: 'host', code });
    if (!wasConnected) this.hooks.onHostStatus(room, true);
    return { ok: true, room, replacedSocketId: replaced };
  }

  setLocked(socketId: string, locked: boolean): void {
    const found = this.lookup(socketId);
    if (found?.binding.role !== 'host') return;
    const { room } = found;
    room.locked = locked;
    // Ao destrancar (voltar ao lobby), quem estiver desligado entra em período de graça.
    for (const p of room.players.values()) {
      if (p.socketId === null) {
        if (locked) this.cancelRemoval(p);
        else this.scheduleRemoval(room, p);
      }
    }
  }

  /** Remove um jogador. Devolve o socket dele (se estiver ligado) para ser avisado. */
  kick(hostSocketId: string, playerId: PlayerId): { room: Room; socketId: string | null } | null {
    const found = this.lookup(hostSocketId);
    if (found?.binding.role !== 'host') return null;
    const player = found.room.players.get(playerId);
    if (!player) return null;
    const socketId = player.socketId;
    this.removePlayer(found.room, player);
    return { room: found.room, socketId };
  }

  // ── Jogadores ───────────────────────────────────────────

  joinPlayer(
    code: string,
    rawName: string,
    sessionToken: string | undefined,
    socketId: string,
  ):
    | { ok: true; room: Room; player: PlayerRecord; replacedSocketId: string | null }
    | Fail {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };

    // Reconexão: o mesmo telemóvel volta ao mesmo lugar (mesmo com a sala trancada).
    const existing = sessionToken ? room.findBySession(sessionToken) : undefined;
    if (existing) {
      const binding = this.sockets.get(socketId);
      if (!(binding?.role === 'player' && binding.playerId === existing.id)) this.detach(socketId);
      const replaced = existing.socketId !== socketId ? existing.socketId : null;
      if (replaced) this.sockets.delete(replaced);
      existing.socketId = socketId;
      this.cancelRemoval(existing);
      this.sockets.set(socketId, { role: 'player', code, playerId: existing.id });
      this.hooks.onPlayersChanged(room);
      return { ok: true, room, player: existing, replacedSocketId: replaced };
    }

    if (room.locked) return { ok: false, error: 'ROOM_LOCKED' };
    if (room.players.size >= MAX_PLAYERS) return { ok: false, error: 'ROOM_FULL' };
    const name = sanitizeName(rawName);
    if (!name) return { ok: false, error: 'INVALID_NAME' };

    this.detach(socketId);
    const player: PlayerRecord = {
      id: randomUUID(),
      name: room.uniqueName(name),
      color: room.nextColor(),
      sessionToken: randomBytes(24).toString('base64url'),
      socketId,
      layout: null,
      removeTimer: null,
    };
    room.players.set(player.id, player);
    this.sockets.set(socketId, { role: 'player', code, playerId: player.id });
    this.hooks.onPlayersChanged(room);
    return { ok: true, room, player, replacedSocketId: null };
  }

  // ── Ligações ────────────────────────────────────────────

  /** Chamar quando um socket se desliga. */
  disconnect(socketId: string): void {
    this.detach(socketId);
  }

  closeRoom(room: Room, reason: CloseReason): void {
    if (!this.rooms.has(room.code)) return;
    this.hooks.onRoomClosed(room, reason);
    if (room.hostTimer) clearTimeout(room.hostTimer);
    for (const p of room.players.values()) this.cancelRemoval(p);
    for (const [socketId, b] of this.sockets) if (b.code === room.code) this.sockets.delete(socketId);
    this.rooms.delete(room.code);
  }

  closeAll(reason: CloseReason): void {
    for (const room of [...this.rooms.values()]) this.closeRoom(room, reason);
  }

  /** Desassocia um socket de onde quer que esteja. */
  private detach(socketId: string): void {
    const found = this.lookup(socketId);
    if (!found) return;
    const { room, binding } = found;
    this.sockets.delete(socketId);

    if (binding.role === 'host') {
      if (room.hostSocketId !== socketId) return;
      room.hostSocketId = null;
      this.hooks.onHostStatus(room, false);
      room.hostTimer = setTimeout(() => this.closeRoom(room, 'HOST_LEFT'), this.opts.hostGraceMs);
      return;
    }

    const player = room.players.get(binding.playerId);
    if (!player || player.socketId !== socketId) return;
    player.socketId = null;
    if (!room.locked) this.scheduleRemoval(room, player);
    this.hooks.onPlayersChanged(room);
  }

  private scheduleRemoval(room: Room, player: PlayerRecord): void {
    this.cancelRemoval(player);
    player.removeTimer = setTimeout(
      () => this.removePlayer(room, player),
      this.opts.playerLobbyGraceMs,
    );
  }

  private cancelRemoval(player: PlayerRecord): void {
    if (player.removeTimer) clearTimeout(player.removeTimer);
    player.removeTimer = null;
  }

  private removePlayer(room: Room, player: PlayerRecord): void {
    this.cancelRemoval(player);
    if (player.socketId) this.sockets.delete(player.socketId);
    room.players.delete(player.id);
    this.hooks.onPlayersChanged(room);
  }

  private generateCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }
}
