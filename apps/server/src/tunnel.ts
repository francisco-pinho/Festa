/**
 * Túnel rápido da Cloudflare (grátis, sem conta): dá um link público https://….trycloudflare.com
 * para o servidor local. Usado pelo `npm run online` e pela app de computador.
 * O `cloudflared` não é descarregado aqui: tem de estar instalado (ou ir dentro da app).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Procura o `cloudflared`: primeiro nos caminhos dados (ex.: o que vai dentro da app), depois os habituais. */
export function findCloudflared(extra: string[] = []): string | null {
  const paths = [
    ...extra,
    process.env.CLOUDFLARED ?? '',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    `${process.env.LOCALAPPDATA ?? ''}\\Microsoft\\WinGet\\Links\\cloudflared.exe`,
    '/opt/homebrew/bin/cloudflared',
    '/usr/local/bin/cloudflared',
    '/usr/bin/cloudflared',
  ].filter(Boolean);
  for (const p of paths) if (existsSync(p)) return p;
  // No PATH?
  const r = spawnSync('cloudflared --version', { stdio: 'ignore', shell: true });
  return r.status === 0 ? 'cloudflared' : null;
}

export interface Tunnel {
  process: ChildProcess;
  /** Resolve com o link público (ou rejeita se o túnel não abrir em `timeoutMs`). */
  url: Promise<string>;
  close(): void;
}

export function openTunnel(bin: string, localUrl: string, timeoutMs = 30_000): Tunnel {
  // Servidor local em HTTPS com certificado próprio: o túnel não o pode verificar (é o nosso PC).
  const args = ['tunnel', '--no-autoupdate', '--url', localUrl, ...(localUrl.startsWith('https:') ? ['--no-tls-verify'] : [])];
  const child = spawn(bin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: bin === 'cloudflared',
  });
  const url = new Promise<string>((done, fail) => {
    const timer = setTimeout(() => fail(new Error('O túnel está a demorar demasiado.')), timeoutMs);
    const onData = (chunk: Buffer) => {
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString());
      if (!m) return;
      clearTimeout(timer);
      done(m[0]);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', (err) => {
      clearTimeout(timer);
      fail(err);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      fail(new Error(`O túnel fechou (código ${code}).`));
    });
  });
  url.catch(() => undefined); // quem quiser trata o erro
  return {
    process: child,
    url,
    close() {
      if (!child.killed) child.kill();
    },
  };
}
