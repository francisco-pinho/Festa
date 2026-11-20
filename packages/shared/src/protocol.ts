/**
 * Protocolo entre os três intervenientes:
 *
 *   Ecrã principal (host, PC)  <──Socket.IO──>  Servidor  <──Socket.IO──>  Telemóveis (controllers)
 *
 * O servidor gere salas, códigos, ligações e reconexões, e encaminha mensagens.
 * A lógica de jogo corre no host (ecrã principal), que é a autoridade do jogo.
 */
import type { z } from 'zod';
import type {
  buttonIdSchema,
  controllerInputSchema,
  controllerLayoutSchema,
  hostResumeSchema,
  hostSendSchema,
  hostToControllerSchema,
  motionActionSchema,
  playerJoinSchema,
  rtcSignalSchema,
  testerCmdSchema,
  testerScenarioSchema,
  viewerJoinSchema,
} from './schemas';

export type PlayerId = string;
export type ButtonId = z.infer<typeof buttonIdSchema>;
export type ControllerInput = z.infer<typeof controllerInputSchema>;
export type SwingInput = Extract<ControllerInput, { t: 'swing' }>;
export type MotionAction = z.infer<typeof motionActionSchema>;
export type PadLayout = Extract<ControllerLayout, { kind: 'pad' }>;
export type ControllerLayout = z.infer<typeof controllerLayoutSchema>;
export type HostToControllerMessage = z.infer<typeof hostToControllerSchema>;
export type HostSendRequest = z.infer<typeof hostSendSchema>;
export type HostResumeRequest = z.infer<typeof hostResumeSchema>;
export type PlayerJoinRequest = z.input<typeof playerJoinSchema>;
export type ViewerJoinRequest = z.input<typeof viewerJoinSchema>;
export type RtcSignal = z.infer<typeof rtcSignalSchema>;
export type TesterScenario = z.infer<typeof testerScenarioSchema>;
export type TesterCmd = z.infer<typeof testerCmdSchema>;

/** Listas para o painel de tester preencher os menus (vêm do código do jogo). */
export interface TesterCatalog {
  boards: { id: string; name: string }[];
  minigames: { id: string; name: string; modes: string[]; duel: boolean }[];
  sports: { id: string; name: string }[];
  botLevels: { id: string; label: string }[];
  items: { id: string; name: string }[];
}

/** Estado do ecrã /teste mostrado no painel. */
export interface TesterState {
  phase: 'lobby' | 'menu' | 'board' | 'minigame' | 'practice' | 'sport' | 'finale' | 'other';
  scenario: TesterScenario | null;
  timeScale: number;
  round?: number;
  totalRounds?: number;
  starSpaceId?: number;
  spaces?: { id: number; type: string }[];
  players: { id: string; name: string; isBot: boolean; coins?: number; stars?: number; items?: string[]; spaceId?: number }[];
  catalog: TesterCatalog;
}

export interface PlayerInfo {
  id: PlayerId;
  name: string;
  color: string;
  connected: boolean;
  /** O "VIP" é quem controla os menus (começar jogo, jogar outra vez...). */
  isVip: boolean;
}

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_LOCKED'
  | 'INVALID_NAME'
  | 'NAME_TAKEN'
  | 'HOST_TOKEN_INVALID'
  | 'SERVER_FULL';

export type CloseReason = 'HOST_LEFT' | 'KICKED' | 'REPLACED' | 'SERVER_SHUTDOWN';

export type Result<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: ErrorCode };

export type Ack<T extends object = object> = (res: Result<T>) => void;

export interface ClientToServerEvents {
  // ── Host (ecrã principal) ────────────────────────────────
  'host:create': (ack: Ack<{ roomCode: string; hostToken: string }>) => void;
  'host:resume': (req: HostResumeRequest, ack: Ack<{ roomCode: string }>) => void;
  'host:send': (req: HostSendRequest) => void;
  /** Sala trancada = não entram jogadores novos (reconexões continuam a funcionar). */
  'host:lock': (locked: boolean) => void;
  'host:kick': (playerId: PlayerId) => void;

  // ── Controller (telemóvel) ───────────────────────────────
  'player:join': (
    req: PlayerJoinRequest,
    ack: Ack<{ roomCode: string; player: PlayerInfo; sessionToken: string }>,
  ) => void;
  'player:input': (input: ControllerInput) => void;
  /** Só o VIP: passa a coroa a outro jogador ligado. */
  'player:setVip': (playerId: PlayerId) => void;
  /** Muda o nome deste jogador (limpo; recusado se já houver outro igual na sala). */
  'player:rename': (name: string, ack: Ack) => void;

  // ── Espectador (vídeo do ecrã, página /ver) ─────────────
  'viewer:join': (req: ViewerJoinRequest, ack: Ack<{ viewerId: string }>) => void;
  /** Host → espectador (`to` = id) ou espectador → host (`to` = 'host'). */
  'rtc:signal': (msg: { to: string; data: RtcSignal }) => void;

  // ── Painel de tester (só em `npm run dev`) ───────────────
  /** O ecrã /teste anuncia-se como o host de teste (substitui o anterior). */
  'tester:host': () => void;
  /** O painel do telemóvel liga-se (não é jogador). */
  'tester:join': () => void;
  /** Painel → ecrã /teste. */
  'tester:cmd': (cmd: TesterCmd) => void;
  /** Ecrã /teste → painéis. */
  'tester:state': (state: TesterState) => void;
}

export interface ServerToClientEvents {
  /** Lista de jogadores atualizada (host e controllers). */
  'room:players': (players: PlayerInfo[]) => void;
  /** O host esteve/está ligado? Os telemóveis mostram aviso quando cai. */
  'room:hostStatus': (connected: boolean) => void;
  'room:closed': (reason: CloseReason) => void;
  /** Só para o host: input de um telemóvel. */
  'host:input': (event: { playerId: PlayerId; input: ControllerInput }) => void;
  /** Só para controllers: mensagem vinda do host. */
  'controller:message': (message: HostToControllerMessage) => void;
  /** Só para o host: entrou/saiu um espectador do vídeo. */
  'viewer:joined': (viewerId: string) => void;
  'viewer:left': (viewerId: string) => void;
  /** Sinalização WebRTC (`from` = id do espectador, ou 'host'). */
  'rtc:signal': (msg: { from: string; data: RtcSignal }) => void;
  /** Só para o host de teste: comando do painel. */
  'tester:cmd': (cmd: TesterCmd) => void;
  /** Só para painéis: estado do ecrã /teste. */
  'tester:state': (state: TesterState) => void;
  /** Só para painéis: há um ecrã /teste ligado? */
  'tester:hostStatus': (connected: boolean) => void;
}

/** Resposta de GET /api/info — usada pelo host para gerar o URL/QR de entrada. */
export interface ServerInfo {
  /** URL público configurado (modo online). */
  publicUrl: string | null;
  /** IPs da rede local onde o servidor está acessível (modo LAN). */
  lanAddresses: string[];
  version: string;
}

/** Tipo da resposta (ack) de um evento cliente → servidor. */
export type AckResult<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]> extends [...unknown[], (res: infer R) => void] ? R : never;
