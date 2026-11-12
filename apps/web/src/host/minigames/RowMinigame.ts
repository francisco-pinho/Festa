/**
 * Base dos minijogos «em fila»: todos lado a lado de frente para a câmara (saltar à corda,
 * memória, encher balões…). Trata do cenário, das personagens, de texto a flutuar,
 * das carregadelas e do fim do jogo (quem ganha festeja, quem perde fica triste).
 */
import * as THREE from 'three';
import { getCharacter } from '@festa/game';
import type { ButtonId } from '@festa/shared';
import { CharacterModel } from '../three/CharacterModel';
import { disposeObject, mesh, textSprite, toon } from '../three/materials';
import { setupSky } from '../stages/environment';
import { TEAM_COLORS } from './ArenaMinigame';
import { ringDecor } from './scenery';
import type { MinigameContext, MinigameRun, MinigameScore, MinigameSeat } from './types';

export interface Rower {
  seat: MinigameSeat;
  model: CharacterModel;
  /** Posição x na fila. */
  x: number;
  alive: boolean;
  /** Quando saiu (para desempatar: se ninguém sobrar, ganha o último a sair). */
  outAt?: number;
}

export abstract class RowMinigame implements MinigameRun {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 300);
  readonly row: Rower[] = [];
  protected running = false;
  protected elapsed = 0;
  protected ended = false;
  protected abstract readonly duration: number;
  private readonly floaters: { sprite: THREE.Sprite; life: number }[] = [];

  constructor(
    protected readonly ctx: MinigameContext,
    opts: { ground?: string | null; spacing?: number; decor?: boolean } = {},
  ) {
    setupSky(this.scene, { fog: [60, 170] });
    if (opts.ground !== null) {
      const ground = mesh(new THREE.CircleGeometry(70, 48), toon(opts.ground ?? '#8fd16a'), { cast: false, receive: true });
      ground.rotation.x = -Math.PI / 2;
      this.scene.add(ground);
    }
    const spacing = opts.spacing ?? 2.2;
    const n = ctx.seats.length;
    ctx.seats.forEach((seat, i) => {
      const model = new CharacterModel(getCharacter(seat.characterId));
      // Como no tabuleiro: contorno e anel no chão com a cor de cada jogador (em equipas, o anel é o da equipa).
      model.setHighlight(getCharacter(seat.characterId).color, 0.5, !(seat.team && this.ctx.mode !== 'ffa'));
      const x = (i - (n - 1) / 2) * spacing;
      model.root.position.set(x, 0, 0);
      model.faceYaw(0, true);
      const label = textSprite(seat.name, { height: 0.42, color: '#ffffff', stroke: '#1d1433' });
      label.position.y = 2.6;
      model.root.add(label);
      if (seat.team && ctx.mode !== 'ffa') {
        const ring = mesh(new THREE.TorusGeometry(0.7, 0.08, 8, 28), toon(TEAM_COLORS[seat.team]), { cast: false });
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.05;
        model.root.add(ring);
      }
      this.scene.add(model.root);
      this.row.push({ seat, model, x, alive: true });
    });
    if (opts.decor !== false) ringDecor(this.scene, ctx.rng, Math.max(10, (n * spacing) / 2 + 6));
    const width = n * spacing;
    this.camera.position.set(0, 4.2, Math.max(9, width * 0.95));
    this.camera.lookAt(0, 1.3, 0);
  }

  start(): void {
    this.running = true;
  }

  get finished(): boolean {
    return this.ended;
  }

  timeLeft(): number {
    return Math.max(0, this.duration - this.elapsed);
  }

  abstract scores(): MinigameScore[];
  abstract winners(): string[];
  protected abstract step(dt: number, time: number): void;

  protected isBot(r: Rower): boolean {
    return this.ctx.isBot(r.seat.id);
  }

  protected pressed(r: Rower, button: ButtonId): boolean {
    return this.ctx.pad(r.seat.id).consumePress(button);
  }

  protected botPress(r: Rower, button: ButtonId): void {
    this.ctx.botPad(r.seat.id).press(button);
  }

  /** Tira um jogador do jogo (guarda quando saiu). */
  protected knockOut(r: Rower): void {
    r.alive = false;
    r.outAt = this.elapsed;
  }

  /** Os vivos ganham (equipas: a equipa com mais vivos). Ninguém vivo: o(s) último(s) a sair. */
  protected survivorsWin(): string[] {
    let alive = this.row.filter((r) => r.alive);
    if (!alive.length) {
      const last = Math.max(...this.row.map((r) => r.outAt ?? 0));
      alive = this.row.filter((r) => (r.outAt ?? 0) >= last - 0.05);
      if (alive.length === this.row.length) return [];
    }
    if (this.ctx.mode === 'ffa') return alive.length === this.row.length ? [] : alive.map((r) => r.seat.id);
    const count = (t: 'blue' | 'red') => alive.filter((r) => r.seat.team === t).length;
    if (count('blue') === count('red')) return [];
    const team = count('blue') > count('red') ? 'blue' : 'red';
    return this.row.filter((r) => r.seat.team === team).map((r) => r.seat.id);
  }

  /** Acaba quando só resta um (ou uma equipa). */
  protected endIfDecided(): void {
    const alive = this.row.filter((r) => r.alive);
    const sides = new Set(alive.map((r) => (this.ctx.mode === 'ffa' ? r.seat.id : r.seat.team)));
    if (sides.size <= 1) this.endGame();
  }

  /** Texto que sobe e desaparece. */
  protected float(text: string, x: number, y: number, color = '#ffd23f', height = 0.7, z = 0.6): void {
    const sprite = textSprite(text, { height, color, stroke: '#1d1433' });
    sprite.position.set(x, y, z);
    this.scene.add(sprite);
    this.floaters.push({ sprite, life: 1.2 });
  }

  protected endGame(): void {
    if (this.ended) return;
    this.ended = true;
    this.running = false;
    const won = new Set(this.winners());
    for (const r of this.row) r.model.setAnim(won.size === 0 ? 'idle' : won.has(r.seat.id) ? 'cheer' : 'sad');
  }

  /** Chamado a cada imagem (mesmo antes de começar), para animações próprias. */
  protected animate(_dt: number, _time: number): void {}

  update(dt: number, time: number): void {
    if (this.running) {
      this.elapsed += dt;
      this.step(dt, time);
      if (this.elapsed >= this.duration) this.endGame();
    } else if (!this.ended) {
      for (const r of this.row) {
        this.pressed(r, 'a');
        this.pressed(r, 'b');
      }
    }
    this.animate(dt, time);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]!;
      f.life -= dt;
      f.sprite.position.y += dt * 1.2;
      (f.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, f.life * 2);
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        disposeObject(f.sprite);
        this.floaters.splice(i, 1);
      }
    }
    for (const r of this.row) r.model.update(dt);
  }

  dispose(): void {
    for (const r of this.row) r.model.dispose();
    disposeObject(this.scene);
  }
}
