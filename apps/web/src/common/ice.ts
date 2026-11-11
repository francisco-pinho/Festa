/** Servidores ICE (STUN, e TURN se o servidor tiver chaves da Cloudflare). */
let cached: Promise<RTCIceServer[]> | null = null;

export function getIceServers(): Promise<RTCIceServer[]> {
  cached ??= fetch('/api/ice')
    .then((r) => (r.ok ? (r.json() as Promise<{ iceServers: RTCIceServer[] }>) : { iceServers: [] }))
    .then((j) => (j.iceServers.length ? j.iceServers : [{ urls: 'stun:stun.cloudflare.com:3478' }]))
    .catch(() => [{ urls: 'stun:stun.cloudflare.com:3478' }]);
  return cached;
}
