/**
 * Interface em HTML por cima do 3D: placar, faixas ("Vez da Ana!"),
 * painéis centrais (lobby, minijogo, resultados) e dicas.
 */
import './ui.css';
import type { Engine } from '../three/Engine';
import { settings } from '../game/Settings';

export interface ScoreEntry {
  id: string;
  name: string;
  color: string;
  /** Omitidos nos desportos. */
  coins?: number;
  stars?: number;
  active: boolean;
  isBot: boolean;
  connected: boolean;
  /** Etiqueta pequena opcional (ex.: equipa). */
  tag?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Hud {
  private readonly root: HTMLElement;
  private readonly round: HTMLElement;
  private readonly board: HTMLElement;
  private readonly bannerEl: HTMLElement;
  private readonly panelEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly bigEl: HTMLElement;

  constructor(private readonly engine: Engine) {
    this.root = document.getElementById('ui')!;
    this.root.innerHTML = `
      <div class="round" hidden></div>
      <div class="scoreboard"></div>
      <div class="banner" hidden></div>
      <div class="big" hidden></div>
      <div class="panel" hidden></div>
      <div class="hint" hidden></div>
      <div class="status" hidden></div>
    `;
    const q = (s: string) => this.root.querySelector<HTMLElement>(s)!;
    this.round = q('.round');
    this.board = q('.scoreboard');
    this.bannerEl = q('.banner');
    this.panelEl = q('.panel');
    this.hintEl = q('.hint');
    this.statusEl = q('.status');
    this.bigEl = q('.big');
  }

  setRound(text: string | null): void {
    this.round.hidden = !text;
    this.round.textContent = text ?? '';
  }

  setScoreboard(entries: ScoreEntry[] | null): void {
    if (!entries) {
      this.board.innerHTML = '';
      return;
    }
    this.board.innerHTML = entries
      .map(
        (e) => `
        <div class="score ${e.active ? 'active' : ''} ${e.connected ? '' : 'away'}" style="--c:${e.color}">
          <span class="dot"></span>
          <span class="name">${esc(e.name)}${e.isBot ? ' <small>CPU</small>' : ''}${e.tag && e.coins !== undefined ? ` <small>${esc(e.tag)}</small>` : ''}</span>
          <span class="stars">${e.stars !== undefined ? `⭐ ${e.stars}` : ''}</span>
          <span class="coins">${e.coins !== undefined ? `🪙 ${e.coins}` : esc(e.tag ?? '')}</span>
        </div>`,
      )
      .join('');
  }

  /** Faixa grande a meio do ecrã durante `hold` segundos. */
  async banner(text: string, opts: { sub?: string; hold?: number; color?: string } = {}): Promise<void> {
    this.bannerEl.innerHTML = `<div class="title" style="${opts.color ? `color:${opts.color}` : ''}">${esc(text)}</div>${
      opts.sub ? `<div class="sub">${esc(opts.sub)}</div>` : ''
    }`;
    this.bannerEl.hidden = false;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    await this.engine.wait(opts.hold ?? 1.6);
    this.bannerEl.hidden = true;
  }

  /** Número/texto gigante (contagem decrescente, "FIM!"). */
  async big(text: string, hold = 0.8): Promise<void> {
    this.bigEl.textContent = text;
    this.bigEl.hidden = false;
    this.bigEl.classList.remove('pop');
    void this.bigEl.offsetWidth;
    this.bigEl.classList.add('pop');
    await this.engine.wait(hold);
    this.bigEl.hidden = true;
  }

  panel(html: string | null): void {
    this.panelEl.hidden = html === null;
    this.panelEl.innerHTML = html ?? '';
  }

  panelElement(): HTMLElement {
    return this.panelEl;
  }

  /** Dica no fundo do ecrã. As não `important` respeitam a definição "Dicas no ecrã". */
  hint(text: string | null, important = false): void {
    if (text && !important && !settings.value.hints) text = null;
    this.hintEl.hidden = !text;
    this.hintEl.textContent = text ?? '';
  }

  status(text: string | null): void {
    this.statusEl.hidden = !text;
    this.statusEl.textContent = text ?? '';
  }
}

export { esc };
