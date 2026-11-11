/**
 * O servidor da Festa como função: usado pelo `npm start` / `npm run online` (index.ts)
 * e pela app de computador (apps/desktop), que o arranca dentro do próprio processo.
 */
import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { resolve } from 'node:path';
import express from 'express';
import { generate } from 'selfsigned';
import { Server } from 'socket.io';
import type { ServerInfo } from '@festa/shared';
import { CONTROLLER_PATH } from '@festa/shared';
import { getLanAddresses } from './network';
import { registerSocketHandlers, type FestaServer } from './socketServer';

const VERSION = '0.1.0';

export interface StartOptions {
  /** Porta preferida. Com `tryNextPorts`, se estiver ocupada experimenta as seguintes. */
  port: number;
  tryNextPorts?: number;
  /** Pasta com o cliente web compilado (apps/web/dist). */
  webDist: string;
  /** HTTPS com certificado autoassinado (sensores na rede local sem túnel). */
  https?: boolean;
  publicUrl?: string | null;
  log?: (msg: string) => void;
}

export interface FestaServerHandle {
  port: number;
  scheme: 'http' | 'https';
  setPublicUrl(url: string | null): void;
  readonly publicUrl: string | null;
  close(): Promise<void>;
}

export async function startServer(opts: StartOptions): Promise<FestaServerHandle> {
  const log = opts.log ?? ((m: string) => console.log(m));
  let publicUrl = opts.publicUrl ?? null;

  const app = express();
  const httpServer: HttpServer = opts.https
    ? createHttpsServer(
        await generate([{ name: 'commonName', value: 'festa.local' }], { keySize: 2048, algorithm: 'sha256' }).then((pems) => ({
          key: pems.private,
          cert: pems.cert,
        })),
        app,
      )
    : createServer(app);
  const scheme = opts.https ? 'https' : 'http';

  const io: FestaServer = new Server(httpServer, {
    // Mensagens do jogo são pequenas; limitar protege o servidor.
    maxHttpBufferSize: 16 * 1024,
    // Deteta telemóveis que perderam a ligação em ~15s.
    pingInterval: 8_000,
    pingTimeout: 7_000,
  });

  const manager = registerSocketHandlers(io, {
    hostGraceMs: 2 * 60_000,
    playerLobbyGraceMs: 30_000,
    maxRooms: 500,
    inputRatePerSec: 120,
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: manager.roomCount });
  });

  app.get('/api/info', (_req, res) => {
    const info: ServerInfo = { publicUrl, lanAddresses: getLanAddresses(), version: VERSION };
    res.json(info);
  });

  /**
   * Servidores ICE para o vídeo WebRTC: STUN grátis sempre; TURN da Cloudflare se houver chaves
   * (CLOUDFLARE_TURN_KEY_ID e CLOUDFLARE_TURN_API_TOKEN), para quando a ligação direta falha.
   */
  let iceCache: { at: number; servers: unknown[] } | null = null;
  app.get('/api/ice', async (_req, res) => {
    const stun = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
    if (!keyId || !token) return void res.json({ iceServers: stun });
    if (iceCache && Date.now() - iceCache.at < 3_600_000) return void res.json({ iceServers: iceCache.servers });
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 4 * 3600 }),
      });
      const body = (await r.json()) as { iceServers?: unknown };
      const servers = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
      if (!r.ok || !servers.length) throw new Error(`TURN ${r.status}`);
      iceCache = { at: Date.now(), servers };
      res.json({ iceServers: servers });
    } catch (err) {
      log(`⚠ Não consegui credenciais TURN da Cloudflare; uso só STUN. ${String(err)}`);
      res.json({ iceServers: stun });
    }
  });

  // O mesmo servidor entrega o cliente web (ecrã + comando + vídeo).
  if (existsSync(opts.webDist)) {
    app.use(express.static(opts.webDist, { index: 'index.html' }));
    app.get(CONTROLLER_PATH, (_req, res) => res.sendFile(resolve(opts.webDist, 'play.html')));
    app.get('/ver', (_req, res) => res.sendFile(resolve(opts.webDist, 'ver.html')));
  } else if (process.env.NODE_ENV === 'production') {
    log(`⚠ Não encontrei ${opts.webDist}. Corre "npm run build" primeiro.`);
  }

  // Escuta na porta pedida (ou nas seguintes, se estiver ocupada).
  const tries = Math.max(1, (opts.tryNextPorts ?? 0) + 1);
  let port = opts.port;
  for (let i = 0; i < tries; i++, port++) {
    const ok = await new Promise<boolean>((done, fail) => {
      const onError = (err: NodeJS.ErrnoException) => {
        httpServer.off('listening', onListening);
        if (err.code === 'EADDRINUSE' && i < tries - 1) done(false);
        else fail(err);
      };
      const onListening = () => {
        httpServer.off('error', onError);
        done(true);
      };
      httpServer.once('error', onError);
      httpServer.once('listening', onListening);
      httpServer.listen(port, '0.0.0.0');
    });
    if (ok) break;
  }

  log(`🎉 Servidor Festa na porta ${port}`);
  if (publicUrl) log(`   URL público: ${publicUrl}`);
  for (const ip of getLanAddresses()) log(`   Rede local: ${scheme}://${ip}:${port}`);

  return {
    port,
    scheme,
    get publicUrl() {
      return publicUrl;
    },
    setPublicUrl(url) {
      publicUrl = url ? url.replace(/\/+$/, '') : null;
      if (publicUrl) log(`🌍 URL público: ${publicUrl}`);
    },
    close() {
      manager.closeAll('SERVER_SHUTDOWN');
      return new Promise<void>((done) => {
        void io.close();
        httpServer.close(() => done());
        setTimeout(done, 2_000).unref();
      });
    },
  };
}
