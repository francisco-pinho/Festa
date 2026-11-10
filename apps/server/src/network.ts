import { networkInterfaces } from 'node:os';

/** Interfaces virtuais que não servem para os telemóveis chegarem ao PC. */
const VIRTUAL = /(vethernet|virtualbox|vmware|wsl|hyper-v|docker|loopback|vbox|tailscale|zerotier|bluetooth)/i;

/**
 * IPs IPv4 da rede local, ordenados do mais provável (Wi-Fi/Ethernet em
 * 192.168.x / 10.x) para o menos provável.
 */
export function getLanAddresses(): string[] {
  const result: { address: string; score: number }[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (addr.address.startsWith('169.254.')) continue; // link-local
      let score = 0;
      if (VIRTUAL.test(name)) score -= 10;
      // Sub-redes por omissão do VirtualBox host-only / docker-machine, mesmo com nomes genéricos.
      if (/^192\.168\.(56|99)\./.test(addr.address)) score -= 6;
      // CGNAT (Tailscale e afins): só funciona para quem está nessa VPN.
      if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(addr.address)) score -= 6;
      if (/wi-?fi|wlan|wireless/i.test(name)) score += 1;
      if (/wi-?fi|wlan|wireless|ethernet|en\d|eth\d/i.test(name)) score += 2;
      if (addr.address.startsWith('192.168.')) score += 3;
      else if (addr.address.startsWith('10.')) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(addr.address)) score += 1;
      result.push({ address: addr.address, score });
    }
  }
  return result.sort((a, b) => b.score - a.score).map((r) => r.address);
}
