/**
 * Base dos minijogos de duelo (1 contra 1): duas personagens frente a frente,
 * câmara fixa de lado e só botões (sem joystick).
 */
import * as THREE from 'three';
import { getCharacter } from '@festa/game';
import { CharacterModel } from '../three/CharacterModel';
import { disposeObject, mesh, textSprite, toon } from '../three/materials';
import { setupSky } from '../stages/environment';
import type { MinigameContext, MinigameRun, MinigameScore, MinigameSeat } from './types';

export interface Duelist {
  seat: MinigameSeat;
  model: CharacterModel;
  /** -1 = esquerda, 1 = direita. */
  side: -1 | 1;
}

export abstract class DuelMinigame implements MinigameRun {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 300);
  readonly duelists: Duelist[] = [];
  protected running = false;
  protected elapsed = 0;
  protected ended = false;
  protected abstract readonly duration: number;
  private readonly floaters: { sprite: THREE.Sprite; life: number }[] = [];

  constructor(
    protected readonly ctx: MinigameContext,
    opts: { ground: string; spacing?: number; faceCamera?: boolean } = { ground: '#8fd16a' },
  ) {
    setupSky(this.scene, { fog: [60, 160] });
    const ground = mesh(new THREE.CircleGeometry(60, 48), toon(opts.ground), { cast: false, receive: true });
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const spacing = opts.spacing ?? 3;
    ctx.seats.slice(0, 2).forEach((seat, i) => {
      const side = (i === 0 ? -1 : 1) as -1 | 1;
      const model = new CharacterModel(getCharacter(seat.characterId));
      // Como no tabuleiro: contorno e anel no chão com a cor de cada jogador (em equipas, o anel é o da equipa).
      model.setHighlight(getCharacter(seat.characterId).color, 0.5, !(seat.team && this.ctx.mode !== 'ffa'));
      model.root.position.set(side * spacing, 0, 0);
      model.faceYaw(opts.faceCamera ? 0 : side === -1 ? Math.PI / 2 : -Math.PI / 2, true);
      const label = textSprite(seat.name, { height: 0.45, color: '#ffffff', stroke: '#1d1433' });
      label.position.y = 2.6;
      model.root.add(label);
      this.scene.add(model.root);
      this.duelists.push({ seat, model, side });
    });
    this.camera.position.set(0, 4.2, 12);
    this.camera.lookAt(0, 1.5, 0);
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

  protected isBot(d: Duelist): boolean {
    return this.ctx.isBot(d.seat.id);
  }

  protected pressed(d: Duelist, button: 'a' | 'b'): boolean {
    return this.ctx.pad(d.seat.id).consumePress(button);
  }

  protected botPress(d: Duelist, button: 'a' | 'b'): void {
    this.ctx.botPad(d.seat.id).press(button);
  }

  protected other(d: Duelist): Duelist {
    return this.duelists.find((o) => o !== d)!;
  }

  /** Texto que sobe e desaparece. */
  protected float(text: string, x: number, y: number, color = '#ffd23f', height = 0.8): void {
    const sprite = textSprite(text, { height, color, stroke: '#1d1433' });
    sprite.position.set(x, y, 0.5);
    this.scene.add(sprite);
    this.floaters.push({ sprite, life: 1.2 });
  }

  protected endGame(): void {
    if (this.ended) return;
    this.ended = true;
    this.running = false;
    const won = new Set(this.winners());
    for (const d of this.duelists) d.model.setAnim(won.size === 0 ? 'idle' : won.has(d.seat.id) ? 'cheer' : 'sad');
  }

  update(dt: number, time: number): void {
    if (this.running) {
      this.elapsed += dt;
      this.step(dt, time);
      if (this.elapsed >= this.duration) this.endGame();
    } else if (!this.ended) {
      // Antes de começar, ignora carregadelas antecipadas.
      for (const d of this.duelists) {
        this.pressed(d, 'a');
        this.pressed(d, 'b');
      }
    }
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
    for (const d of this.duelists) d.model.update(dt);
  }

  dispose(): void {
    for (const d of this.duelists) d.model.dispose();
    disposeObject(this.scene);
  }
}
