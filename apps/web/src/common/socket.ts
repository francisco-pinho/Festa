import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@festa/shared';

export type FestaSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Liga ao servidor na mesma origem da página (em dev passa pelo proxy do Vite). */
export function connectSocket(): FestaSocket {
  return io({
    // WebSocket primeiro (menor latência); long-polling como recurso.
    transports: ['websocket', 'polling'],
    reconnectionDelay: 500,
    reconnectionDelayMax: 3_000,
  });
}

export const ACK_TIMEOUT_MS = 5_000;
