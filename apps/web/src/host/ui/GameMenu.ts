/**
 * Menu de pausa e definições.
 *
 * - Durante um jogo (`mode = 'game'`): Esc no PC ou + em qualquer comando abre a pausa.
 *   O tempo do jogo para (Engine.paused) e os telemóveis mostram "Pausa".
 * - No lobby (`mode = 'lobby'`): Esc abre só as definições.
 * - Noutros ecrãs (`mode = 'off'`): o menu não abre.
 *
 * "Sair para o lobby" recarrega o ecrã principal: a sala mantém-se e os
 * telemóveis voltam sozinhos.
 */
import type { Engine } from '../three/Engine';
import type { HubPlayer, PlayerHub } from '../PlayerHub';
import { GRAPHICS_LEVELS, settings } from '../game/Settings';
import { sound } from '../audio/Sound';
import { esc } from './Hud';

type Screen = 'main' | 'settings' | 'confirm' | 'quit';

/** Na app de computador: fecha a janela (o mesmo que «Sair do jogo» do menu principal). */
const desktopApp = (window as unknown as { festaDesktop?: { quit(): Promise<void>; goOnline(): Promise<{ url?: string; error?: string }> } }).festaDesktop;
export type MenuMode = 'off' | 'lobby' | 'game';

interface Item {
  label: string;
  run: () => void;
  /** Slider 0–1: ◀ ▶ (ou setas) mudam o valor. */
  slider?: { value: number; set: (v: number) => void };
}

/** Passo dos sliders de volume (5 %). */
const STEP = 0.05;

export class GameMenu {
  mode: MenuMode = 'off';
  private open = false;
  private screen: Screen = 'main';
  private selected = 0;
  /** Quem abriu o menu (só esse comando navega). */
  private controller: HubPlayer | null = null;
  private readonly el: HTMLElement;

  constructor(
    private readonly engine: Engine,
    private readonly hub: PlayerHub,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'game-menu';
    this.el.hidden = true;
    document.getElementById('ui')!.appendChild(this.el);

    // Captura antes dos outros atalhos do jogo, para não "passarem" para trás do menu.
    window.addEventListener('keydown', (e) => this.onKey(e), { capture: true });
    // Comando: + abre/fecha; com o menu aberto, a cruz, A e B de quem o abriu navegam.
    hub.events.on('press', ({ player, button }) => {
      if (button === 'plus') {
        // No lobby o + não abre nada (as definições gerais são o Ⓑ do VIP).
        if (this.mode === 'lobby') return;
        if (!this.open) this.controller = player;
        this.toggle();
        return;
      }
      if (!this.open || (this.controller && player !== this.controller)) return;
      const items = this.items();
      if (button === 'down') this.selected = (this.selected + 1) % items.length;
      else if (button === 'up') this.selected = (this.selected + items.length - 1) % items.length;
      else if (button === 'a') return items[this.selected]?.run();
      else if (button === 'left' || button === 'right') this.adjust(items[this.selected], button === 'right' ? 1 : -1);
      else if (button === 'b') {
        if (this.screen === 'main' || this.mode === 'lobby') this.close();
        else this.goto('main');
        return;
      } else return;
      this.render();
    });
    settings.events.on('changed', () => {
      if (this.open) this.render();
    });
  }

  private adjust(item: Item | undefined, dir: number): void {
    if (!item?.slider) return;
    item.slider.set(Math.round(Math.min(1, Math.max(0, item.slider.value + dir * STEP)) * 100) / 100);
  }

  private closedAt = 0;
  /** «Jogar online» (túnel da Cloudflare): estado mostrado no item do menu. */
  private online: 'off' | 'opening' | 'on' | 'failed' = 'off';
  private lobbySuspended = false;

  /** Abre o menu para um jogador (Ⓑ no lobby). Não reabre logo a seguir a fechar com o mesmo Ⓑ. */
  openFor(player: HubPlayer): void {
    if (this.open || performance.now() - this.closedAt < 250) return;
    this.controller = player;
    this.show(this.mode === 'lobby' ? 'settings' : 'main');
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show(this.mode === 'lobby' ? 'settings' : 'main');
  }

  show(screen: Screen = 'main'): void {
    if (this.mode === 'off') return;
    this.open = true;
    this.screen = screen;
    this.selected = 0;
    if (this.mode === 'game') {
      this.engine.paused = true;
      this.hub.suspendLayouts({ kind: 'pad', title: 'Pausa', sub: 'Menu no ecrã grande', stick: 'dpad', buttons: { a: 'Escolher', b: 'Voltar', plus: 'Continuar' } });
    } else if (this.mode === 'lobby') {
      // No lobby o telemóvel mostra o carrossel (sem cruz): enquanto o menu está aberto, volta a cruz.
      this.lobbySuspended = true;
      this.hub.suspendLayouts({ kind: 'pad', title: 'Definições', sub: 'Menu no ecrã grande · ◀ ▶ ajusta o volume', stick: 'dpad', buttons: { a: 'Escolher', b: 'Fechar' } });
    }
    this.el.hidden = false;
    this.render();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.closedAt = performance.now();
    if (this.lobbySuspended) {
      this.lobbySuspended = false;
      this.hub.restoreLayouts();
    }
    if (this.mode === 'game' || this.engine.paused) {
      this.engine.paused = false;
      this.hub.restoreLayouts();
    }
  }

  // ── Conteúdo ────────────────────────────────────────────

  private items(): Item[] {
    const s = settings.value;
    if (this.screen === 'quit') {
      return [
        { label: 'Sim, fechar o jogo', run: () => void desktopApp?.quit() },
        { label: 'Não', run: () => this.goto(this.mode === 'lobby' ? 'settings' : 'main') },
      ];
    }
    if (this.screen === 'confirm') {
      return [
        { label: 'Sim, sair para o lobby', run: () => location.reload() },
        { label: 'Não, continuar a jogar', run: () => this.goto('main') },
      ];
    }
    if (this.screen === 'settings') {
      return [
        { label: `Dicas no ecrã: ${s.hints ? 'Sim' : 'Não'}`, run: () => settings.set('hints', !s.hints) },
        { label: 'Efeitos', run: () => undefined, slider: { value: s.sfxVolume, set: (v) => (settings.set('sfxVolume', v), sound.play('coin')) } },
        { label: 'Música', run: () => undefined, slider: { value: s.musicVolume, set: (v) => settings.set('musicVolume', v) } },
        { label: `Narrador: ${s.narrator ? 'Sim' : 'Não'}`, run: () => settings.set('narrator', !s.narrator) },
        {
          label: `Gráficos: ${GRAPHICS_LEVELS.find((g) => g.id === s.graphics)?.label ?? 'Alto'}`,
          run: () => {
            const i = GRAPHICS_LEVELS.findIndex((g) => g.id === s.graphics);
            settings.set('graphics', GRAPHICS_LEVELS[(i + 1) % GRAPHICS_LEVELS.length]!.id);
          },
        },
        ...(desktopApp && this.mode === 'lobby'
          ? [
              { label: ONLINE_LABEL[this.online], run: () => void this.goOnline() },
              { label: 'Fechar o jogo', run: () => this.goto('quit') },
            ]
          : []),
      ];
    }
    return [
      { label: 'Continuar', run: () => this.close() },
      { label: 'Definições', run: () => this.goto('settings') },
      { label: 'Sair para o lobby', run: () => this.goto('confirm') },
    ];
  }

  /** Abre o túnel; o QR do lobby muda sozinho quando o link público chega. */
  private async goOnline(): Promise<void> {
    if (!desktopApp || this.online === 'opening' || this.online === 'on') return;
    this.online = 'opening';
    this.render();
    const res = await desktopApp.goOnline();
    this.online = res.url ? 'on' : 'failed';
    if (this.open) this.render();
  }

  private goto(screen: Screen): void {
    this.screen = screen;
    this.selected = 0;
    this.render();
  }

  private render(): void {
    const title = this.screen === 'settings' ? 'Definições' : this.screen === 'confirm' ? 'Sair do jogo?' : this.screen === 'quit' ? 'Fechar o jogo?' : 'Pausa';
    const sub =
      this.screen === 'confirm'
        ? 'O jogo atual acaba. Os jogadores continuam na sala.'
        : this.screen === 'settings'
          ? 'Opções para toda a sessão'
          : 'Esc ou + no comando para continuar';
    // No mesmo ecrã do menu, só atualiza a seleção e os textos (sem refazer o cartão,
    // que voltava a fazer a animação de abrir a cada mudança).
    const items = this.items();
    const buttons = this.el.querySelectorAll<HTMLButtonElement>('.menu-item');
    if (this.el.dataset.screen === this.screen && buttons.length === items.length) {
      buttons.forEach((btn, i) => {
        btn.classList.toggle('sel', i === this.selected);
        const key = itemKey(items[i]!);
        if (btn.dataset.label !== key) {
          btn.dataset.label = key;
          btn.innerHTML = itemHtml(items[i]!);
        }
      });
      return;
    }
    this.el.dataset.screen = this.screen;
    this.el.innerHTML = `
      <div class="menu-card">
        <h1>${title}</h1>
        <p class="menu-sub">${esc(sub)}</p>
        <div class="menu-items">
          ${this.items()
            .map((it, i) => `<button class="menu-item ${i === this.selected ? 'sel' : ''}" data-i="${i}" data-label="${esc(itemKey(it))}">${itemHtml(it)}</button>`)
            .join('')}
        </div>
        <p class="menu-keys">✚ escolher · ◀ ▶ ajustar · Ⓐ confirmar · Ⓑ fechar (no PC: setas, Enter, Esc)</p>
      </div>`;
    this.el.querySelectorAll<HTMLButtonElement>('.menu-item').forEach((b) =>
      b.addEventListener('click', () => this.items()[Number(b.dataset.i)]?.run()),
    );
  }

  /** Há um menu no ecrã a usar o teclado (o Esc é dele). */
  keyboardBusy: () => boolean = () => false;

  private onKey(e: KeyboardEvent): void {
    if (!this.open) {
      if (this.keyboardBusy()) return;
      if (e.code === 'Escape' && this.mode !== 'off') {
        e.stopImmediatePropagation();
        e.preventDefault();
        this.toggle();
      }
      return;
    }
    // Com o menu aberto, nenhuma tecla chega ao jogo.
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.type !== 'keydown' || e.repeat) return;
    const items = this.items();
    if (e.code === 'ArrowDown') this.selected = (this.selected + 1) % items.length;
    else if (e.code === 'ArrowUp') this.selected = (this.selected + items.length - 1) % items.length;
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') this.adjust(items[this.selected], e.code === 'ArrowRight' ? 1 : -1);
    else if (e.code === 'Enter' || e.code === 'Space') items[this.selected]?.run();
    else if (e.code === 'Escape') {
      if (this.screen === 'main' || this.mode === 'lobby') this.close();
      else this.goto('main');
      return;
    } else return;
    this.render();
  }
}

const ONLINE_LABEL = {
  off: 'Jogar online',
  opening: 'Jogar online: a abrir o túnel…',
  on: 'Jogar online: ligado',
  failed: 'Jogar online: falhou, tentar outra vez',
} as const;

function itemKey(it: Item): string {
  return it.slider ? `${it.label}:${it.slider.value}` : it.label;
}

function itemHtml(it: Item): string {
  if (!it.slider) return esc(it.label);
  const pct = Math.round(it.slider.value * 100);
  return `<span class="menu-slider-label">${esc(it.label)}</span><span class="menu-slider"><i style="width:${pct}%"></i></span><span class="menu-slider-val">${pct}</span>`;
}
