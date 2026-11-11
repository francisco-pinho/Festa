/**
 * Ligação do ecrã principal ao servidor. Cria a sala (ou recupera-a depois de
 * recarregar a página / perder a rede) e expõe eventos simples ao jogo.
 */
import type {
  AckResult,
  ControllerInput,
  HostToControllerMessage,
  PlayerId,
  PlayerInfo,
  RtcSignal,
} from '@festa/shared';
import { Emitter } from '../common/emitter';
import { ACK_TIMEOUT_MS, connectSocket, type FestaSocket } from '../common/socket';

const STORAGE_KEY = 'festa.host';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

interface HostEvents {
  status: ConnectionStatus;
  room: string;
  players: PlayerInfo[];
  input: { playerId: PlayerId; input: ControllerInput };
  viewerJoined: string;
  viewerLeft: string;
  signal: { from: string; data: RtcSignal };
}

export class HostConnection {
  readonly events = new Emitter<HostEvents>();
  private readonly socket: FestaSocket = connectSocket();
  roomCode: string | null = null;
  status: ConnectionStatus = 'connecting';

  constructor() {
    this.socket.on('connect', () => void this.ensureRoom());
    this.socket.on('disconnect', () => this.setStatus('offline'));
    this.socket.on('room:players', (players) => this.events.emit('players', players));
    this.socket.on('host:input', (e) => this.events.emit('input', e));
    this.socket.on('viewer:joined', (id) => this.events.emit('viewerJoined', id));
    this.socket.on('viewer:left', (id) => this.events.emit('viewerLeft', id));
    this.socket.on('rtc:signal', (msg) => this.events.emit('signal', msg));
    this.socket.on('room:closed', () => {
      // A sala expirou no servidor: cria uma nova.
      sessionStorage.removeItem(STORAGE_KEY);
      void this.ensureRoom();
    });
  }

  send(to: PlayerId | 'all', message: HostToControllerMessage): void {
    this.socket.emit('host:send', { to, message });
  }

  /** Sinalização WebRTC para um espectador do vídeo. */
  signal(to: string, data: RtcSignal): void {
    this.socket.emit('rtc:signal', { to, data });
  }

  setLocked(locked: boolean): void {
    this.socket.emit('host:lock', locked);
  }

  kick(playerId: PlayerId): void {
    this.socket.emit('host:kick', playerId);
  }

  private async ensureRoom(): Promise<void> {
    this.setStatus('connecting');
    const saved = loadSaved();
    try {
      if (saved) {
        const res: AckResult<'host:resume'> = await this.socket
          .timeout(ACK_TIMEOUT_MS)
          .emitWithAck('host:resume', saved);
        if (res.ok) return this.setRoom(res.roomCode);
        sessionStorage.removeItem(STORAGE_KEY);
      }
      const res: AckResult<'host:create'> = await this.socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck('host:create');
      if (!res.ok) throw new Error(res.error);
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ roomCode: res.roomCode, hostToken: res.hostToken }),
      );
      this.setRoom(res.roomCode);
    } catch (err) {
      console.error('Não foi possível criar a sala', err);
      this.setStatus('offline');
      setTimeout(() => this.socket.connected && void this.ensureRoom(), 2_000);
    }
  }

  private setRoom(code: string): void {
    this.setStatus('online');
    if (code !== this.roomCode) {
      this.roomCode = code;
      this.events.emit('room', code);
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.events.emit('status', status);
  }
}

function loadSaved(): { roomCode: string; hostToken: string } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as { roomCode: string; hostToken: string }) : null;
  } catch {
    return null;
  }
}
