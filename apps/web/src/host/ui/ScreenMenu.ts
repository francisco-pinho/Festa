/**
 * Menus no ecrã grande, navegados com o comando (como na Switch): a cruz ou o joystick
 * movem o cursor, A confirma e B volta. Vários jogadores podem ter um menu aberto ao mesmo
 * tempo (cada um com a sua cor). Linhas com `values` mudam com ◀ ▶.
 */
import type { ButtonId } from '@festa/shared';
import type { Engine } from '../three/Engine';
import type { HubPlayer, PlayerHub } from '../PlayerHub';
import { sound } from '../audio/Sound';
import { esc } from './Hud';

export interface MenuOption {
  id: string;
  label: string;
  /** Texto pequeno por baixo. */
  sub?: string;
  color?: string;
  disabled?: boolean;
  /** Linha com valores: ◀ ▶ (e A) mudam o valor em vez de confirmar. */
  values?: string[];
  value?: number;
}

export interface MenuRequest {
  /** Quem navega (null = só o teclado do PC). */
  player: HubPlayer | null;
  title: string;
  /** Nome e cor de quem escolhe (aparece no cartão). */
  name?: string;
  color?: string;
  options: MenuOption[];
  columns?: number;
  /** Id devolvido ao carregar em B (sem isto, B não faz nada). */
  cancel?: string;
  /** As setas/Enter/Esc do teclado do PC também controlam este menu. */
  keyboard?: boolean;
  /** Escolha automática (bots e desligados): o cursor vai até lá e confirma. */
  bot?: { pick: () => string; delay: number };
  /** Enquanto isto for verdade, escolhe o `bot` (por omissão: nunca). */
  isAuto?: () => boolean;
  /** Chamado quando o cursor muda (ex.: realçar a seta do caminho no tabuleiro). */
  onFocus?: (id: string) => void;
  onChange?: (id: string, value: number) => void;
  initial?: string;
  /** Mostrar grande, a meio (menus principais). */
  big?: boolean;
  /** Encostado ao canto inferior direito (para não tapar um painel ao centro). */
  corner?: boolean;
  /** Não desenha nada: a navegação continua, mas quem mostra a escolha é outro painel (via `onFocus`). */
  hidden?: boolean;
}

interface OpenMenu {
  req: MenuRequest;
  sel: number;
  el: HTMLElement;
  finish: (id: string) => void;
}

/** O menu de cima, para quem o desenha noutro sítio (ex.: no ecrã da televisão da sala). */
export type MenuSink = (view: { req: MenuRequest; sel: number } | null) => void;

export class ScreenMenus {
  private readonly root: HTMLElement;
  private readonly open: OpenMenu[] = [];
  /** Enquanto houver, os menus não aparecem no ecrã: vão para aqui (ex.: a televisão da sala). */
  private sink: MenuSink | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly hub: PlayerHub,
    /** Enquanto for verdade (ex.: pausa aberta), os menus ignoram o comando. */
    private readonly isBlocked: () => boolean = () => false,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'screen-menus';
    document.getElementById('ui')!.appendChild(this.root);
    hub.events.on('press', ({ player, button }) => {
      if (this.isBlocked()) return;
      const m = [...this.open].reverse().find((o) => o.req.player === player);
      if (m) this.input(m, button);
    });
    window.addEventListener('keydown', (e) => {
      const m = [...this.open].reverse().find((o) => o.req.keyboard);
      if (!m || this.isBlocked()) return;
      const map: Record<string, ButtonId> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'a', Escape: 'b' };
      const b = map[e.code];
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      this.input(m, b);
    }, { capture: true });
  }

  get blocked(): boolean {
    return this.isBlocked();
  }

  get keyboardOpen(): boolean {
    return this.open.some((m) => m.req.keyboard);
  }

  get anyOpen(): boolean {
    return this.open.length > 0;
  }

  /** Passa a desenhar os menus noutro sítio (null = volta ao ecrã normal). */
  setSink(sink: MenuSink | null): void {
    this.sink = sink;
    for (const m of this.open) this.render(m);
    this.pushSink();
  }

  private pushSink(): void {
    if (!this.sink) return;
    const top = [...this.open].reverse().find((m) => !m.req.hidden);
    this.sink(top ? { req: top.req, sel: top.sel } : null);
  }

  ask(req: MenuRequest): Promise<string> {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = `smenu ${req.big ? 'smenu-big' : ''} ${req.corner ? 'smenu-corner' : ''}`;
      if (req.color) el.style.setProperty('--c', req.color);
      this.root.appendChild(el);
      let sel = Math.max(0, req.options.findIndex((o) => o.id === req.initial));
      if (req.initial === undefined) sel = Math.max(0, req.options.findIndex((o) => !o.disabled));
      const menu: OpenMenu = {
        req,
        sel,
        el,
        finish: (id) => {
          const i = this.open.indexOf(menu);
          if (i < 0) return;
          this.open.splice(i, 1);
          el.classList.add('closing');
          setTimeout(() => el.remove(), 180);
          this.layout();
          this.pushSink();
          resolve(id);
        },
      };
      this.open.push(menu);
      this.layout();
      this.render(menu);
      req.onFocus?.(req.options[menu.sel]!.id);
      if (req.bot) void this.watchAuto(menu, req.bot);
    });
  }

  /** Fecha um menu aberto por fora (devolve `id` a quem o abriu). */
  cancel(req: MenuRequest, id = '__cancel'): void {
    this.open.find((m) => m.req === req)?.finish(id);
  }

  /** Fecha todos os menus de um jogador (ex.: o jogo mudou de ecrã). */
  cancelAll(id = '__cancel'): void {
    for (const m of [...this.open]) m.finish(id);
  }

  /** Bots (ou quem se desligou): espera um pouco e escolhe. */
  private async watchAuto(menu: OpenMenu, auto: { pick: () => string; delay: number }): Promise<void> {
    let waited = 0;
    while (this.open.includes(menu)) {
      await this.engine.wait(0.1);
      waited = menu.req.isAuto?.() ? waited + 0.1 : 0;
      if (waited >= auto.delay) return this.runAuto(menu, auto);
    }
  }

  private async runAuto(menu: OpenMenu, auto: { pick: () => string; delay: number }): Promise<void> {
    if (!this.open.includes(menu)) return;
    const id = auto.pick();
    const target = menu.req.options.findIndex((o) => o.id === id);
    // O cursor anda até à escolha, uma casa de cada vez.
    while (target >= 0 && menu.sel !== target && this.open.includes(menu)) {
      menu.sel += Math.sign(target - menu.sel);
      this.render(menu);
      sound.play('tick', { vol: 0.5 });
      await this.engine.wait(0.12);
    }
    await this.engine.wait(0.25);
    if (this.open.includes(menu)) {
      sound.play('click');
      menu.finish(id);
    }
  }

  private input(m: OpenMenu, b: ButtonId): void {
    const opts = m.req.options;
    const cols = Math.max(1, m.req.columns ?? 1);
    const cur = opts[m.sel]!;
    const move = (d: number) => {
      const n = opts.length;
      m.sel = (m.sel + d + n) % n;
      sound.play('tick', { vol: 0.6 });
      m.req.onFocus?.(opts[m.sel]!.id);
      this.render(m);
    };
    const change = (d: number) => {
      const vals = cur.values!;
      cur.value = ((cur.value ?? 0) + d + vals.length) % vals.length;
      sound.play('tick');
      m.req.onChange?.(cur.id, cur.value);
      this.render(m);
    };
    switch (b) {
      case 'up':
        move(-cols);
        break;
      case 'down':
        move(cols);
        break;
      case 'left':
        if (cur.values) change(-1);
        else if (cols > 1) move(-1);
        else move(-1);
        break;
      case 'right':
        if (cur.values) change(1);
        else if (cols > 1) move(1);
        else move(1);
        break;
      case 'a':
        if (cur.values) return change(1);
        if (cur.disabled) {
          sound.play('block', { vol: 0.5 });
          m.el.classList.remove('nope');
          void m.el.offsetWidth;
          m.el.classList.add('nope');
          return;
        }
        sound.play('click');
        m.finish(cur.id);
        break;
      case 'b':
        if (m.req.cancel !== undefined) {
          sound.play('click', { pitch: 0.7 });
          m.finish(m.req.cancel);
        }
        break;
    }
  }

  private layout(): void {
    this.root.classList.toggle('many', this.open.length > 1);
  }

  private render(m: OpenMenu): void {
    const r = m.req;
    m.el.hidden = !!r.hidden || !!this.sink;
    if (r.hidden) return;
    if (this.sink) return this.pushSink();
    const cols = Math.max(1, r.columns ?? 1);
    m.el.innerHTML = `
      <div class="smenu-head">${r.name ? `<span class="dot"></span><b>${esc(r.name)}</b> · ` : ''}${esc(r.title)}</div>
      <div class="smenu-opts" style="grid-template-columns:repeat(${cols}, 1fr)">
        ${r.options
          .map((o, i) => {
            const val = o.values ? ` <span class="val">◀ ${esc(o.values[o.value ?? 0] ?? '')} ▶</span>` : '';
            return `<div class="sopt ${i === m.sel ? 'sel' : ''} ${o.disabled ? 'dis' : ''}" ${o.color ? `style="--oc:${o.color}"` : ''}>
              ${o.color ? '<span class="swatch"></span>' : ''}<span class="lbl">${esc(o.label)}${val}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div>`;
          })
          .join('')}
      </div>
      <div class="smenu-keys">Ⓐ ${r.options[m.sel]?.values ? 'mudar' : 'escolher'} · ✚ mover${r.cancel !== undefined ? ' · Ⓑ voltar' : ''}</div>`;
  }
}
