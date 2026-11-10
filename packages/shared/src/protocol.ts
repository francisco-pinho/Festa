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
  playerJoinSchema,
} from './schemas';

export type PlayerId = string;
export type ButtonId = z.infer<typeof buttonIdSchema>;
export type ControllerInput = z.infer<typeof controllerInputSchema>;
export type ControllerLayout = z.infer<typeof controllerLayoutSchema>;
export type HostToControllerMessage = z.infer<typeof hostToControllerSchema>;
export type HostSendRequest = z.infer<typeof hostSendSchema>;
export type HostResumeRequest = z.infer<typeof hostResumeSchema>;
export type PlayerJoinRequest = z.input<typeof playerJoinSchema>;

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
