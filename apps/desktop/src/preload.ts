/** Ponte entre a janela do jogo e a app: só o que o jogo precisa. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('festaDesktop', {
  /** Abre o túnel da Cloudflare; devolve o link público ou uma mensagem de erro. */
  goOnline: (): Promise<{ url?: string; error?: string }> => ipcRenderer.invoke('festa:goOnline'),
});
