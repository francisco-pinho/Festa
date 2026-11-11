import { CONTROLLER_PATH, type ServerInfo } from '@festa/shared';

let infoPromise: Promise<ServerInfo | null> | null = null;
/** Índice do IP da rede local escolhido (a tecla I no lobby troca). */
let lanIndex = 0;

/** Informação do servidor. Enquanto não houver link público, volta a perguntar (o túnel pode abrir depois). */
export function getServerInfo(): Promise<ServerInfo | null> {
  infoPromise ??= fetch('/api/info')
    .then((r) => (r.ok ? (r.json() as Promise<ServerInfo>) : null))
    .catch(() => null)
    .then((info) => {
      if (!info?.publicUrl) setTimeout(() => (infoPromise = null), 3000);
      return info;
    });
  return infoPromise;
}

/** Estamos em modo online (há um link público)? */
export async function isOnline(): Promise<boolean> {
  return !!(await getServerInfo())?.publicUrl;
}

const isLocalhost = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

/**
 * URL base que os telemóveis abrem para entrar.
 * - Online: PUBLIC_URL configurado no servidor.
 * - Local: a mesma origem desta página, trocando "localhost" pelo IP do PC na rede.
 */
export async function getJoinBaseUrl(): Promise<string> {
  const info = await getServerInfo();
  if (info?.publicUrl) return info.publicUrl;
  const url = new URL(window.location.origin);
  const lans = info?.lanAddresses ?? [];
  if (isLocalhost(url.hostname) && lans.length) url.hostname = lans[lanIndex % lans.length]!;
  return url.origin;
}

export async function getJoinUrl(roomCode: string): Promise<string> {
  return `${await getJoinBaseUrl()}${CONTROLLER_PATH}?room=${roomCode}`;
}

/** Passa para o próximo IP da rede local (para PCs com vários adaptadores). */
export async function cycleLanAddress(): Promise<boolean> {
  const info = await getServerInfo();
  if (info?.publicUrl || (info?.lanAddresses.length ?? 0) < 2) return false;
  lanIndex++;
  return true;
}
