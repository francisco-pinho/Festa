import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { generate } from 'selfsigned';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type { ServerInfo } from '@festa/shared';
import { CONTROLLER_PATH } from '@festa/shared';
import { getLanAddresses } from './network';
import { registerSocketHandlers, type FestaServer } from './socketServer';

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_URL = process.env.PUBLIC_URL?.trim().replace(/\/+$/, '') || null;
const VERSION = '0.1.0';

/**
 * HTTPS=1 usa um certificado autoassinado gerado no arranque. É preciso para os
 * sensores de movimento dos telemóveis (modo Desportos) numa rede local.
 * O telemóvel mostra um aviso de segurança da primeira vez: é só aceitar.
 */
const HTTPS = process.env.HTTPS === '1';

const app = express();
const httpServer = HTTPS
  ? createHttpsServer(
      await generate([{ name: 'commonName', value: 'festa.local' }], { keySize: 2048, algorithm: 'sha256' }).then(
        (pems) => ({ key: pems.private, cert: pems.cert }),
      ),
      app,
    )
  : createServer(app);
const scheme = HTTPS ? 'https' : 'http';

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
  const info: ServerInfo = { publicUrl: PUBLIC_URL, lanAddresses: getLanAddresses(), version: VERSION };
  res.json(info);
});

// Em produção, o mesmo servidor entrega o cliente web (ecrã + comando).
const webDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist, { index: 'index.html' }));
  app.get(CONTROLLER_PATH, (_req, res) => res.sendFile(resolve(webDist, 'play.html')));
} else if (process.env.NODE_ENV === 'production') {
  console.warn(`⚠ Não encontrei ${webDist}. Corre "npm run build" primeiro.`);
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🎉 Servidor Festa na porta ${PORT}`);
  if (PUBLIC_URL) console.log(`   URL público: ${PUBLIC_URL}`);
  for (const ip of getLanAddresses()) console.log(`   Rede local: ${scheme}://${ip}:${PORT}`);
});

const shutdown = () => {
  manager.closeAll('SERVER_SHUTDOWN');
  void io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
