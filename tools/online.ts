/**
 * `npm run online` — joga com amigos fora de casa (e em casa ao mesmo tempo).
 *
 *  1. Compila o jogo (salta com `--sem-build`).
 *  2. Arranca o servidor numa só porta (jogo + comando + ligações).
 *  3. Abre um túnel rápido da Cloudflare (grátis, sem conta) → link público https://….trycloudflare.com
 *  4. Passa o link ao servidor: o QR do lobby passa a usá-lo (funciona em casa e fora).
 *  5. Abre o ecrã do jogo no browser deste PC.
 *
 * Precisa do `cloudflared` instalado (não é descarregado automaticamente):
 *   Windows:  winget install --id Cloudflare.cloudflared
 *   macOS:    brew install cloudflared
 *   Linux:    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
 * Sem ele, o jogo arranca só para a rede de casa.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3000);
const args = new Set(process.argv.slice(2));
const children: ChildProcess[] = [];

function openBrowser(url: string): void {
  if (args.has('--sem-browser')) return;
  const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
}

function findCloudflared(): string | null {
  const candidates = [
    process.env.CLOUDFLARED,
    'cloudflared',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    `${process.env.LOCALAPPDATA ?? ''}\\Microsoft\\WinGet\\Links\\cloudflared.exe`,
    '/opt/homebrew/bin/cloudflared',
    '/usr/local/bin/cloudflared',
  ].filter((c): c is string => !!c);
  for (const c of candidates) {
    if (c.includes('\\') || c.startsWith('/')) {
      if (existsSync(c)) return c;
      continue;
    }
    const r = spawnSync(`${c} --version`, { stdio: 'ignore', shell: true });
    if (r.status === 0) return c;
  }
  return null;
}

function shutdown(code = 0): void {
  for (const c of children) if (!c.killed) c.kill();
  setTimeout(() => process.exit(code), 500).unref();
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// 1. Compilar
if (!args.has('--sem-build')) {
  console.log('🔨 A compilar o jogo…');
  const r = spawnSync('npm run build', { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error('❌ A compilação falhou.');
    process.exit(1);
  }
}

// 2. Servidor (com canal IPC para lhe passar o link público)
const server = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
  cwd: root,
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) },
});
children.push(server);
server.on('exit', (code) => {
  console.log('O servidor parou.');
  shutdown(code ?? 0);
});

const local = `http://localhost:${PORT}`;

// 3. Túnel
const bin = findCloudflared();
if (!bin) {
  console.log(`
⚠ Não encontrei o "cloudflared", por isso o jogo fica só para a rede de casa.
  Para jogar com quem está fora, instala-o (uma vez) e volta a correr "npm run online":
    Windows:  winget install --id Cloudflare.cloudflared
    macOS:    brew install cloudflared
    Linux:    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
`);
  setTimeout(() => openBrowser(local), 1500);
} else {
  console.log('🌍 A abrir o túnel da Cloudflare…');
  const tunnel = spawn(bin, ['tunnel', '--no-autoupdate', '--url', local], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(tunnel);
  let found = false;
  const onData = (chunk: Buffer) => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString());
    if (!m || found) return;
    found = true;
    const url = m[0];
    // O servidor também fica com o PID do túnel: se este lançador for morto à força, é ele que o fecha.
    server.send({ publicUrl: url, tunnelPid: tunnel.pid });
    console.log(`
════════════════════════════════════════════════════════════
  🎉 Festa online!
  Link para os telemóveis (em casa ou fora):  ${url}/play
  Ecrã do jogo neste PC:                       ${local}
  Quem está fora vê o ecrã em:                 ${url}/ver
  (o QR do lobby já usa o link público)
════════════════════════════════════════════════════════════
`);
    // Dá uns segundos ao túnel para ficar acessível antes de abrir o jogo.
    setTimeout(() => openBrowser(local), 2500);
  };
  tunnel.stdout?.on('data', onData);
  tunnel.stderr?.on('data', onData);
  tunnel.on('exit', (code) => {
    if (!found) console.error(`❌ O túnel não abriu (código ${code}). O jogo continua na rede de casa: ${local}`);
    else console.log('O túnel fechou.');
  });
  setTimeout(() => {
    if (!found) {
      console.warn('⚠ O túnel está a demorar. Abro o jogo na rede de casa; o QR muda quando o link aparecer.');
      openBrowser(local);
    }
  }, 30_000).unref();
}
