/**
 * Ponto único onde o jogo lê jogadores e input, venham eles de um telemóvel
 * ou do teclado do PC (útil para desenvolver sem pegar no telemóvel).
 *
 * Os minijogos só falam com o PlayerHub: nunca com o socket diretamente.
 */
import type {
  ButtonId,
  ControllerInput,
  ControllerLayout,
  HostToControllerMessage,
  PlayerId,
  PlayerInfo,
  SwingInput,
} from '@festa/shared';
import { Emitter } from '../common/emitter';
import type { HostConnection } from './HostConnection';

export type InputSource = 'phone' | 'keyboard';

export class HubPlayer {
  name: string;
  color: string;
  connected: boolean;
  isVip: boolean;
  /** Joystick normalizado: x→direita, y→baixo, magnitude ≤ 1. */
  readonly stick = { x: 0, y: 0 };
  readonly held: Record<ButtonId, boolean> = emptyButtons();
  /** A defender (boxe). */
  guarding = false;
  /** Pontaria por inclinação do telemóvel (-1…1). */
  aim = 0;
  private readonly presses = new Set<ButtonId>();
  /** Direção do joystick já convertida em carregadela da cruz (para os menus). */
  stickDir: 'up' | 'down' | 'left' | 'right' | null = null;

  constructor(
    readonly id: PlayerId,
    readonly source: InputSource,
    info: Omit<PlayerInfo, 'id'>,
  ) {
    this.name = info.name;
    this.color = info.color;
    this.connected = info.connected;
    this.isVip = info.isVip;
  }

  /** true uma única vez por cada vez que o botão foi carregado. */
  consumePress(button: ButtonId): boolean {
    return this.presses.delete(button);
  }

  setButton(button: ButtonId, pressed: boolean): void {
    if (pressed && !this.held[button]) this.presses.add(button);
    this.held[button] = pressed;
  }

  resetInput(): void {
    this.stick.x = 0;
    this.stick.y = 0;
    for (const k of Object.keys(this.held) as ButtonId[]) this.held[k] = false;
    this.stickDir = null;
    this.guarding = false;
    this.aim = 0;
    this.presses.clear();
  }

  /** Limpa toques pendentes (ex.: ao mudar de cena). */
  clearPresses(): void {
    this.presses.clear();
  }
}

interface HubEvents {
  changed: HubPlayer[];
  choice: { player: HubPlayer; id: string };
  press: { player: HubPlayer; button: ButtonId };
  /** Gesto de desporto (telemóvel, ou teclado: segurar e largar o botão). */
  swing: { player: HubPlayer; swing: SwingInput };
  guard: { player: HubPlayer; up: boolean };
}

interface KeyboardProfile {
  id: string;
  name: string;
  color: string;
  toggleKey: string;
  up: string;
  down: string;
  left: string;
  right: string;
  a: string;
  b: string;
  x: string;
  y: string;
  plus: string;
  minus: string;
}

const KEYBOARD_PROFILES: KeyboardProfile[] = [
  {
    id: 'kb1', name: 'Teclado 1', color: '#dddddd', toggleKey: 'Digit1',
    up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', a: 'Space', b: 'ShiftLeft', x: 'KeyE', y: 'KeyQ', plus: 'KeyR', minus: 'KeyF',
  },
  {
    id: 'kb2', name: 'Teclado 2', color: '#8a8a8a', toggleKey: 'Digit2',
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: 'Period', b: 'Comma', x: 'Slash', y: 'KeyL', plus: 'KeyP', minus: 'KeyO',
  },
];

export class PlayerHub {
  readonly events = new Emitter<HubEvents>();
  private phonePlayers: HubPlayer[] = [];
  private keyboardPlayers: HubPlayer[] = [];
  private readonly lastLayout = new Map<PlayerId, string>();
  /** Último layout "a sério" de cada telemóvel (para repor depois da pausa). */
  private readonly layouts = new Map<PlayerId, ControllerLayout>();
  private suspended: ControllerLayout | null = null;
  private readonly keysDown = new Set<string>();
  /** Quando começou a segurar cada botão (para a força do gesto no teclado). */
  private readonly chargeStart = new Map<string, number>();

  constructor(private readonly conn: HostConnection) {
    conn.events.on('players', (list) => this.syncPhones(list));
    conn.events.on('input', ({ playerId, input }) => this.applyPhoneInput(playerId, input));
    conn.events.on('room', () => this.lastLayout.clear());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keysDown.clear();
      for (const p of this.keyboardPlayers) p.resetInput();
    });
  }

  get players(): HubPlayer[] {
    return [...this.phonePlayers, ...this.keyboardPlayers];
  }

  get vip(): HubPlayer | undefined {
    return this.phonePlayers.find((p) => p.isVip);
  }

  get(id: PlayerId): HubPlayer | undefined {
    return this.players.find((p) => p.id === id);
  }

  /** Define o que aparece no ecrã dos telemóveis. Só envia se mudou. */
  setLayout(layout: ControllerLayout, target: HubPlayer | 'all' = 'all'): void {
    const targets = target === 'all' ? this.phonePlayers : target.source === 'phone' ? [target] : [];
    const json = JSON.stringify(layout);
    for (const p of targets) {
      this.layouts.set(p.id, layout);
      if (this.suspended) continue; // em pausa: guarda-se para repor depois
      if (this.lastLayout.get(p.id) === json) continue;
      this.lastLayout.set(p.id, json);
      this.conn.send(p.id, { t: 'layout', layout });
    }
  }

  /** Pausa: todos os telemóveis mostram `layout`, sem esquecer o que tinham. */
  suspendLayouts(layout: ControllerLayout): void {
    this.suspended = layout;
    for (const p of this.phonePlayers) this.sendRaw(p, layout);
  }

  /** Fim da pausa: cada telemóvel volta ao que tinha. */
  restoreLayouts(): void {
    this.suspended = null;
    for (const p of this.phonePlayers) {
      const l = this.layouts.get(p.id);
      if (l) this.sendRaw(p, l);
    }
  }

  /** Mostra um layout num telemóvel sem o guardar como "o atual" (menus temporários). */
  sendTemporaryLayout(player: HubPlayer, layout: ControllerLayout): void {
    if (player.source === 'phone') this.sendRaw(player, layout);
  }

  private sendRaw(p: HubPlayer, layout: ControllerLayout): void {
    if (p.source !== 'phone') return;
    this.lastLayout.set(p.id, JSON.stringify(layout));
    this.conn.send(p.id, { t: 'layout', layout });
  }

  vibrate(player: HubPlayer, pattern: number | number[]): void {
    this.sendTo(player, { t: 'vibrate', pattern });
  }

  toast(player: HubPlayer, text: string): void {
    this.sendTo(player, { t: 'toast', text });
  }

  clearPresses(): void {
    for (const p of this.players) p.clearPresses();
  }

  private sendTo(player: HubPlayer, message: HostToControllerMessage): void {
    if (player.source === 'phone') this.conn.send(player.id, message);
  }

  // ── Telemóveis ──────────────────────────────────────────

  private syncPhones(list: PlayerInfo[]): void {
    const byId = new Map(this.phonePlayers.map((p) => [p.id, p]));
    this.phonePlayers = list.map((info) => {
      const existing = byId.get(info.id);
      if (!existing) return new HubPlayer(info.id, 'phone', info);
      if (existing.connected && !info.connected) existing.resetInput();
      // Ao reconectar o servidor já reenviou o último layout; não é preciso repetir.
      Object.assign(existing, { name: info.name, color: info.color, connected: info.connected, isVip: info.isVip });
      return existing;
    });
    for (const id of this.lastLayout.keys()) {
      if (!list.some((p) => p.id === id)) this.lastLayout.delete(id);
    }
    this.events.emit('changed', this.players);
  }

  private applyPhoneInput(playerId: PlayerId, input: ControllerInput): void {
    const player = this.phonePlayers.find((p) => p.id === playerId);
    if (!player) return;
    switch (input.t) {
      case 'stick': {
        const len = Math.hypot(input.x, input.y);
        const k = len > 1 ? 1 / len : 1;
        player.stick.x = input.x * k;
        player.stick.y = input.y * k;
        this.stickToDpad(player);
        break;
      }
      case 'button':
        player.setButton(input.button, input.pressed);
        if (input.pressed) this.events.emit('press', { player, button: input.button });
        break;
      case 'choice':
        this.events.emit('choice', { player, id: input.id });
        break;
      case 'swing':
        this.events.emit('swing', { player, swing: input });
        break;
      case 'aim':
        player.aim = input.angle;
        break;
      case 'guard':
        player.guarding = input.up;
        this.events.emit('guard', { player, up: input.up });
        break;
    }
  }

  /** O joystick também navega nos menus: inclinar bem para um lado = carregar na cruz. */
  private stickToDpad(player: HubPlayer): void {
    const { x, y } = player.stick;
    const len = Math.hypot(x, y);
    if (len < 0.35) {
      player.stickDir = null;
      return;
    }
    if (len < 0.7) return;
    const dir = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
    if (dir === player.stickDir) return;
    player.stickDir = dir;
    this.events.emit('press', { player, button: dir });
  }

  // ── Teclado (desenvolvimento / jogar no PC) ─────────────

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.repeat) return;
    const profile = KEYBOARD_PROFILES.find((p) => p.toggleKey === e.code);
    if (profile && down) return this.toggleKeyboardPlayer(profile);

    if (down) this.keysDown.add(e.code);
    else this.keysDown.delete(e.code);

    for (const prof of KEYBOARD_PROFILES) {
      const player = this.keyboardPlayers.find((p) => p.id === prof.id);
      if (!player) continue;
      const k = (code: string) => (this.keysDown.has(code) ? 1 : 0);
      const x = k(prof.right) - k(prof.left);
      const y = k(prof.down) - k(prof.up);
      const len = Math.hypot(x, y) || 1;
      player.stick.x = x / len;
      player.stick.y = y / len;
      this.stickToDpad(player);
      for (const button of ['x', 'y', 'plus', 'minus'] as const) {
        if (e.code !== prof[button]) continue;
        player.setButton(button, down);
        if (down) this.events.emit('press', { player, button });
        e.preventDefault();
      }
      for (const button of ['a', 'b'] as const) {
        if (e.code !== prof[button]) continue;
        player.setButton(button, down);
        if (down) this.events.emit('press', { player, button });
        // Gesto de desporto: segurar carrega a força, largar lança (A = mão direita, B = esquerda).
        const key = `${prof.id}:${button}`;
        if (down) this.chargeStart.set(key, performance.now());
        else {
          const start = this.chargeStart.get(key);
          this.chargeStart.delete(key);
          if (start !== undefined) {
            const power = Math.min(1, (performance.now() - start) / 900);
            this.events.emit('swing', {
              player,
              swing: { t: 'swing', power: Math.max(0.15, power), dir: player.stick.x * 0.8, spin: 0, hand: button === 'a' ? 'right' : 'left', source: 'key' },
            });
          }
        }
        e.preventDefault();
      }
    }
  }

  private toggleKeyboardPlayer(profile: KeyboardProfile): void {
    const idx = this.keyboardPlayers.findIndex((p) => p.id === profile.id);
    if (idx >= 0) this.keyboardPlayers.splice(idx, 1);
    else {
      this.keyboardPlayers.push(
        new HubPlayer(profile.id, 'keyboard', {
          name: profile.name,
          color: profile.color,
          connected: true,
          isVip: false,
        }),
      );
    }
    this.events.emit('changed', this.players);
  }
}

export function emptyButtons(): Record<ButtonId, boolean> {
  return { a: false, b: false, x: false, y: false, plus: false, minus: false, up: false, down: false, left: false, right: false };
}
