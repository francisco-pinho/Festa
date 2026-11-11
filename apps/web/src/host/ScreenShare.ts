/**
 * Vídeo do ecrã para quem joga fora de casa.
 *
 * O ecrã grande partilha o próprio separador (`getDisplayMedia`, um clique de autorização) e envia-o
 * por WebRTC a cada espectador (página /ver ou o botão 📺 do comando). O servidor só passa a
 * sinalização; o vídeo vai direto (ou por TURN, se a ligação direta falhar).
 */
import type { RtcSignal } from '@festa/shared';
import { Emitter } from '../common/emitter';
import { getIceServers } from '../common/ice';
import type { HostConnection } from './HostConnection';

interface ShareEvents {
  changed: { sharing: boolean; viewers: number };
}

export class ScreenShare {
  readonly events = new Emitter<ShareEvents>();
  private stream: MediaStream | null = null;
  private readonly peers = new Map<string, RTCPeerConnection>();
  /** Espectadores ligados ao servidor (com ou sem vídeo ainda). */
  private readonly viewers = new Set<string>();

  constructor(private readonly conn: HostConnection) {
    conn.events.on('viewerJoined', (id) => {
      this.viewers.add(id);
      void this.connect(id);
      this.changed();
    });
    conn.events.on('viewerLeft', (id) => {
      this.viewers.delete(id);
      this.closePeer(id);
      this.changed();
    });
    conn.events.on('signal', ({ from, data }) => void this.onSignal(from, data));
  }

  get sharing(): boolean {
    return !!this.stream;
  }

  get viewerCount(): number {
    return this.viewers.size;
  }

  /** Liga/desliga a partilha (tem de vir de um clique ou tecla: o browser pede autorização). */
  async toggle(): Promise<void> {
    if (this.stream) return this.stop();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
        // Sugere logo este separador (Chrome/Edge).
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
      } as DisplayMediaStreamOptions);
      const video = stream.getVideoTracks()[0];
      if (video) {
        video.contentHint = 'motion';
        video.addEventListener('ended', () => this.stop());
      }
      this.stream = stream;
      for (const id of this.viewers) void this.connect(id);
      this.changed();
    } catch (err) {
      console.warn('Partilha do ecrã cancelada', err);
    }
  }

  stop(): void {
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    for (const id of this.viewers) this.conn.signal(id, { kind: 'waiting' });
    this.changed();
  }

  private changed(): void {
    this.events.emit('changed', { sharing: this.sharing, viewers: this.viewers.size });
  }

  private closePeer(id: string): void {
    this.peers.get(id)?.close();
    this.peers.delete(id);
  }

  /** Cria a ligação a um espectador e envia a oferta (ou diz-lhe para esperar). */
  private async connect(id: string): Promise<void> {
    this.closePeer(id);
    if (!this.stream) {
      this.conn.signal(id, { kind: 'waiting' });
      return;
    }
    const pc = new RTCPeerConnection({ iceServers: await getIceServers() });
    this.peers.set(id, pc);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.conn.signal(id, { kind: 'ice', candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') void this.connect(id);
    };
    for (const track of this.stream.getTracks()) {
      const sender = pc.addTrack(track, this.stream);
      if (track.kind === 'video') {
        const params = sender.getParameters();
        params.degradationPreference = 'maintain-framerate';
        params.encodings = [{ ...(params.encodings?.[0] ?? {}), maxBitrate: 2_500_000 }];
        void sender.setParameters(params).catch(() => undefined);
      }
    }
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.conn.signal(id, { kind: 'offer', sdp: offer.sdp ?? '' });
  }

  private async onSignal(from: string, data: RtcSignal): Promise<void> {
    if (data.kind === 'request') {
      this.viewers.add(from);
      void this.connect(from);
      return;
    }
    const pc = this.peers.get(from);
    if (!pc) return;
    try {
      if (data.kind === 'answer') await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      else if (data.kind === 'ice') {
        const c = { candidate: data.candidate, sdpMid: data.sdpMid ?? null, sdpMLineIndex: data.sdpMLineIndex ?? null };
        // Se chegar antes da resposta, espera por ela.
        if (!pc.remoteDescription) setTimeout(() => void pc.addIceCandidate(c).catch(() => undefined), 500);
        else await pc.addIceCandidate(c);
      }
    } catch (err) {
      console.warn('Sinalização WebRTC inválida', err);
    }
  }
}
