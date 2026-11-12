/**
 * Festa como app de computador (Electron).
 *
 * - Arranca o servidor dentro da app (jogo + comando + vídeo numa só porta, 3000 ou a seguinte livre).
 * - Abre o ecrã do jogo numa janela própria, em ecrã inteiro (F11 alterna).
 * - «Jogar online» (botão no lobby) abre o túnel da Cloudflare com o `cloudflared` que vai dentro da app
 *   (ou o que estiver instalado).
 * - A tecla V partilha a própria janela com quem está fora, sem a caixa de escolha do browser.
 *
 * Os telemóveis continuam a usar o browser (QR no lobby): não precisam de instalar nada.
 */
import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron';
import { join } from 'node:path';
import { appendFileSync } from 'node:fs';
import { startServer, type FestaServerHandle } from '../../server/src/app';
import { findCloudflared, openTunnel, type Tunnel } from '../../server/src/tunnel';

const webDist = app.isPackaged ? join(process.resourcesPath, 'web') : join(__dirname, '../../web/dist');
const bundledCloudflared = app.isPackaged
  ? join(process.resourcesPath, 'bin', 'cloudflared.exe')
  : join(__dirname, '../resources/bin/cloudflared.exe');

let server: FestaServerHandle | null = null;
let tunnel: Tunnel | null = null;
let win: BrowserWindow | null = null;

// Só uma Festa aberta de cada vez: abrir outra vez traz a janela para a frente.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

function createWindow(port: number): BrowserWindow {
  const w = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    title: 'Festa',
    backgroundColor: '#140b2b',
    // FESTA_JANELA=1 abre numa janela normal (útil para testar).
    fullscreen: process.env.FESTA_JANELA !== '1' && process.env.FESTA_OCULTA !== '1',
    // FESTA_OCULTA=1: a janela desenha mas não aparece (testes automáticos).
    show: process.env.FESTA_OCULTA !== '1',
    paintWhenInitiallyHidden: true,
    autoHideMenuBar: true,
    icon: join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      // O jogo continua a correr (música, bots, temporizadores) mesmo sem foco.
      backgroundThrottling: false,
    },
  });
  w.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      w.setFullScreen(!w.isFullScreen());
      event.preventDefault();
    }
    // F5: recomeça o jogo (recarrega a página), como no browser.
    if (input.type === 'keyDown' && input.key === 'F5') {
      w.webContents.reload();
      event.preventDefault();
    }
  });
  // Erros do jogo ficam guardados em festa-erros.log (na pasta de dados da app), para os poder enviar.
  w.webContents.on('console-message', (event) => {
    const e = event as unknown as { level: number | string; message: string; sourceId?: string; lineNumber?: number };
    if (e.level !== 3 && e.level !== 'error') return;
    try {
      appendFileSync(join(app.getPath('userData'), 'festa-erros.log'), `[${new Date().toISOString()}] ${e.message} (${e.sourceId ?? ''}:${e.lineNumber ?? ''})\n`);
    } catch {
      /* sem disco: ignora */
    }
  });
  // Links externos abrem no browser normal.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // FESTA_URL (desenvolvimento): abre outro endereço, ex. o servidor do Vite com uma rota de teste.
  void w.loadURL(process.env.FESTA_URL || `https://localhost:${port}/`);
  return w;
}

// O certificado do servidor é gerado pela própria app: a janela confia nele só para o localhost.
app.on('certificate-error', (event, _wc, url, _error, _cert, callback) => {
  if (server && url.startsWith(`https://localhost:${server.port}/`)) {
    event.preventDefault();
    callback(true);
  } else callback(false);
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  // O certificado do servidor é gerado pela própria app: aceita-o só para o localhost
  // (também nos WebSockets, que o evento 'certificate-error' não cobre). O resto usa a verificação normal.
  session.defaultSession.setCertificateVerifyProc((req, callback) => callback(req.hostname === 'localhost' ? 0 : -3));

  // Partilha do ecrã (tecla V): partilha logo esta janela, com o som do jogo.
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      if (request.frame) callback({ video: request.frame, audio: 'loopback' });
      else callback({});
    },
    { useSystemPicker: false },
  );

  try {
    // HTTPS (certificado próprio): os telemóveis só dão acesso aos sensores de movimento em HTTPS.
    server = await startServer({ port: 3000, tryNextPorts: 20, webDist, https: true, log: (m) => console.log(m) });
  } catch (err) {
    const { dialog } = await import('electron');
    dialog.showErrorBox('Festa', `Não consegui arrancar o servidor do jogo.\n\n${String(err)}`);
    app.quit();
    return;
  }
  win = createWindow(server.port);
  win.on('closed', () => (win = null));
});

// «Jogar online»: abre o túnel (uma vez) e passa o link público ao servidor (o QR do lobby muda sozinho).
ipcMain.handle('festa:goOnline', async (): Promise<{ url?: string; error?: string }> => {
  if (!server) return { error: 'O servidor ainda não arrancou.' };
  if (server.publicUrl) return { url: server.publicUrl };
  const bin = findCloudflared([bundledCloudflared]);
  if (!bin) return { error: 'Não encontrei o cloudflared. Instala-o com: winget install --id Cloudflare.cloudflared' };
  tunnel?.close();
  tunnel = openTunnel(bin, `https://localhost:${server.port}`);
  try {
    const url = await tunnel.url;
    server.setPublicUrl(url);
    tunnel.process.on('exit', () => {
      server?.setPublicUrl(null);
      tunnel = null;
    });
    return { url };
  } catch (err) {
    tunnel?.close();
    tunnel = null;
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('festa:quit', () => {
  app.quit();
});

let quitting = false;
app.on('before-quit', (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  tunnel?.close();
  void (server?.close() ?? Promise.resolve()).finally(() => app.exit(0));
});

app.on('window-all-closed', () => app.quit());
