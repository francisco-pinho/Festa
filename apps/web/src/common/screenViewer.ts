/**
 * Recebe o vídeo do ecrã grande (WebRTC). Usado pela página /ver e pelo botão 📺 do comando.
 * Liga-se ao servidor como espectador (não ocupa lugar de jogador).
 */
import type { RtcSignal } from '@festa/shared';
import { getIceServers } from './ice';
import { connectSocket, type FestaSocket } from './socket';

export type ViewerStatus = 'connecting' | 'waiting' | 'live' | 'error';

export class ScreenViewer {
  private socket: FestaSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private roomCode = '';
  private pendingIce: RTCIceCandidateInit[] = [];

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onStatus: (status: ViewerStatus, detail?: string) => void,
  ) {}

  start(roomCode: string): void {
    this.stop();
    this.roomCode = roomCode.trim().toUpperCase();
    this.onStatus('connecting');
    const socket = connectSocket();
    this.socket = socket;
    socket.on('connect', () => void this.join());
    socket.on('rtc:signal', ({ data }) => void this.onSignal(data));
    socket.on('disconnect', () => this.onStatus('connecting'));
  }

  stop(): void {
    this.pc?.close();
    this.pc = null;
    this.socket?.disconnect();
    this.socket = null;
    this.video.srcObject = null;
  }

  /**
   * Atraso estimado do vídeo (segundos): metade da ida-e-volta da rede + o que o leitor
   * guarda em memória + ~60 ms de captura e codificação no PC.
   */
  async delay(): Promise<number | null> {
    if (!this.pc || this.pc.connectionState !== 'connected') return null;
    const stats = await this.pc.getStats();
    let rtt = 0;
    let jitter = 0;
    stats.forEach((r: RTCStats & Record<string, unknown>) => {
      if (r.type === 'candidate-pair' && r.state === 'succeeded' && typeof r.currentRoundTripTime === 'number') rtt = r.currentRoundTripTime;
      if (r.type === 'inbound-rtp' && r.kind === 'video' && typeof r.jitterBufferDelay === 'number' && typeof r.jitterBufferEmittedCount === 'number' && r.jitterBufferEmittedCount > 0) {
        jitter = r.jitterBufferDelay / r.jitterBufferEmittedCount;
      }
    });
    return Math.min(3, rtt / 2 + jitter + 0.06);
  }

  private async join(): Promise<void> {
    const res = await this.socket!.timeout(5000).emitWithAck('viewer:join', { roomCode: this.roomCode }).catch(() => null);
    if (!res) return this.onStatus('error', 'O servidor não respondeu.');
    if (!res.ok) return this.onStatus('error', res.error === 'ROOM_NOT_FOUND' ? 'Não existe nenhuma sala com esse código.' : res.error === 'ROOM_FULL' ? 'Já há espectadores a mais nesta sala.' : 'Não deu para entrar.');
  }

  private send(data: RtcSignal): void {
    this.socket?.emit('rtc:signal', { to: 'host', data });
  }

  private async onSignal(data: RtcSignal): Promise<void> {
    if (data.kind === 'waiting') {
      this.pc?.close();
      this.pc = null;
      this.video.srcObject = null;
      this.onStatus('waiting');
      return;
    }
    if (data.kind === 'offer') {
      this.pc?.close();
      const pc = new RTCPeerConnection({ iceServers: await getIceServers() });
      this.pc = pc;
      this.pendingIce = [];
      pc.ontrack = (e) => {
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        if (this.video.srcObject !== stream) this.video.srcObject = stream;
        void this.video.play().catch(() => undefined);
        this.onStatus('live');
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) this.send({ kind: 'ice', candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') this.send({ kind: 'request' });
      };
      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => undefined);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send({ kind: 'answer', sdp: answer.sdp ?? '' });
      return;
    }
    if (data.kind === 'ice') {
      const c: RTCIceCandidateInit = { candidate: data.candidate, sdpMid: data.sdpMid ?? null, sdpMLineIndex: data.sdpMLineIndex ?? null };
      if (this.pc?.remoteDescription) await this.pc.addIceCandidate(c).catch(() => undefined);
      else this.pendingIce.push(c);
    }
  }
}
