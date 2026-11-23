/** Ponte entre a janela do jogo e a app: só o que o jogo precisa. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('festaDesktop', {
  /** Abre o túnel da Cloudflare; devolve o link público ou uma mensagem de erro. */
  goOnline: (): Promise<{ url?: string; error?: string }> => ipcRenderer.invoke('festa:goOnline'),
  /** Fecha a app (opção «Sair do jogo» do menu principal). */
  quit: (): Promise<void> => ipcRenderer.invoke('festa:quit'),
  /** Informação da app (ex.: se é a versão portátil, que tem o modo de testes). */
  info: (): Promise<{ portable: boolean }> => ipcRenderer.invoke('festa:info'),
  /** Ecrã inteiro da janela da app (não o do HTML): alternar, saber e ser avisado quando muda (ex.: F11). */
  toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke('festa:toggleFullscreen'),
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('festa:isFullscreen'),
  onFullscreen: (fn: (on: boolean) => void): void => void ipcRenderer.on('festa:fullscreen', (_e, on: boolean) => fn(on)),
});
