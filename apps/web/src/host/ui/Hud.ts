/**
 * Interface em HTML por cima do 3D: placar, faixas ("Vez da Ana!"),
 * painéis centrais (lobby, minijogo, resultados) e dicas.
 */
import { sound } from '../audio/Sound';
import './ui.css';
import type { Engine } from '../three/Engine';
import { settings } from '../game/Settings';
import { portrait } from '../three/portraits';

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
  /** Personagem (para o retrato da cara ao lado do nome). */
  characterId?: string;
  /** Lugar atual (1.º, 2.º…), mostrado à esquerda. */
  rank?: number;
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
      <div class="star-dist" hidden></div>
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

  /** Quanto falta para a estrela (antes de lançar os dados). `null` esconde. */
  setStarDistance(steps: number | null): void {
    const el = this.root.querySelector<HTMLElement>('.star-dist')!;
    if (steps === null) {
      el.hidden = true;
      return;
    }
    el.innerHTML = steps === 0 ? '<b>⭐</b> Estás na estrela!' : `<b>${steps}</b> ${steps === 1 ? 'casa' : 'casas'} até à ⭐`;
    el.hidden = false;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
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
    // Animação FLIP: guarda onde estava cada linha para a fazer deslizar até ao novo lugar.
    const before = new Map<string, number>();
    for (const el of this.board.querySelectorAll<HTMLElement>('.score')) before.set(el.dataset.id!, el.getBoundingClientRect().top);
    this.board.innerHTML = entries
      .map((e) => {
        const face = e.characterId ? portrait(e.characterId) : '';
        return `
        <div class="score ${e.active ? 'active' : ''} ${e.connected ? '' : 'away'} ${e.rank === 1 ? 'first' : ''}" data-id="${esc(e.id)}" style="--c:${e.color}">
          ${e.rank ? `<span class="rank r${e.rank}">${e.rank}.º</span>` : ''}
          ${face ? `<img class="face" src="${face}" alt="">` : '<span class="dot"></span>'}
          <span class="name">${esc(e.name)}${e.isBot ? ' <small>CPU</small>' : ''}${e.tag && e.coins !== undefined ? ` <small>${esc(e.tag)}</small>` : ''}</span>
          <span class="stars">${e.stars !== undefined ? `⭐ ${e.stars}` : ''}</span>
          <span class="coins">${e.coins !== undefined ? `🪙 ${e.coins}` : esc(e.tag ?? '')}</span>
        </div>`;
      })
      .join('');
    for (const el of this.board.querySelectorAll<HTMLElement>('.score')) {
      const old = before.get(el.dataset.id!);
      if (old === undefined) continue;
      const dy = old - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      el.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }

  /** Faixa grande a meio do ecrã durante `hold` segundos. */
  async banner(text: string, opts: { sub?: string; hold?: number; color?: string } = {}): Promise<void> {
    sound.play(opts.color === '#ffd23f' ? 'win' : 'banner');
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

  /**
   * Título fixo no topo do ecrã (não tapa as personagens), até ser trocado ou escondido com `null`.
   * Usado na cerimónia das estrelas bónus.
   */
  headline(text: string | null, opts: { sub?: string; color?: string } = {}): void {
    let el = this.root.querySelector<HTMLElement>('.headline');
    if (!el) {
      el = document.createElement('div');
      el.className = 'headline';
      this.root.appendChild(el);
    }
    if (text === null) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `<div class="title" style="${opts.color ? `color:${opts.color}` : ''}">${esc(text)}</div>${opts.sub ? `<div class="sub">${esc(opts.sub)}</div>` : ''}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /** Número/texto gigante (contagem decrescente, "FIM!"). */
  async big(text: string, hold = 0.8): Promise<void> {
    sound.play(/^\d+$/.test(text) ? 'beep' : text === 'FIM!' ? 'whistle' : 'go');
    this.bigEl.textContent = text;
    this.bigEl.hidden = false;
    this.bigEl.classList.remove('pop');
    void this.bigEl.offsetWidth;
    this.bigEl.classList.add('pop');
    await this.engine.wait(hold);
    this.bigEl.hidden = true;
  }

  /**
   * Roleta: as opções vão passando cada vez mais devagar até parar em `result`.
   */
  async roulette(title: string, options: string[], result: number, hold = 1.6): Promise<void> {
    const render = (sel: number, done: boolean) =>
      this.panel(`<h1>${esc(title)}</h1><div class="roulette">${options
        .map((o, i) => `<div class="roul-item ${i === sel ? (done ? 'won' : 'sel') : ''}">${esc(o)}</div>`)
        .join('')}</div>`);
    const total = options.length * 3 + result;
    for (let i = 0; i <= total; i++) {
      render(i % options.length, i === total);
      sound.play(i === total ? 'coin' : 'tick');
      await this.engine.wait(0.05 + (i / total) ** 3 * 0.35);
    }
    await this.engine.wait(hold);
    this.panel(null);
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
