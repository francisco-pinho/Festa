/**
 * Arranque do servidor pela linha de comandos (`npm start`, `npm run online`).
 * A app de computador usa `startServer` diretamente (ver app.ts).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app';

const server = await startServer({
  port: Number(process.env.PORT ?? 3000),
  webDist: resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist'),
  /**
   * HTTPS=1 usa um certificado autoassinado gerado no arranque. É preciso para os
   * sensores de movimento dos telemóveis (modo Desportos) numa rede local.
   * O telemóvel mostra um aviso de segurança da primeira vez: é só aceitar.
   */
  https: process.env.HTTPS === '1',
  publicUrl: process.env.PUBLIC_URL?.trim() || null,
});

/** Túnel aberto pelo `npm run online` (fecha-se com o servidor). */
let tunnelPid: number | null = null;
// O `npm run online` envia o link público quando o túnel abre.
process.on('message', (msg: unknown) => {
  const pid = (msg as { tunnelPid?: unknown } | null)?.tunnelPid;
  if (typeof pid === 'number' && Number.isInteger(pid) && pid > 0) tunnelPid = pid;
  const url = (msg as { publicUrl?: unknown } | null)?.publicUrl;
  if (typeof url === 'string' && /^https:\/\//.test(url)) server.setPublicUrl(url);
});

const shutdown = () => {
  if (tunnelPid) {
    try {
      process.kill(tunnelPid);
    } catch {
      // já tinha fechado
    }
    tunnelPid = null;
  }
  void server.close().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// Lançado pelo `npm run online`: se o lançador morrer, o servidor também fecha.
if (process.send) process.on('disconnect', shutdown);
