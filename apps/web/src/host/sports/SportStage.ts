/**
 * Base dos desportos: cena com céu e luz, personagens dos jogadores,
 * câmara com movimento suave e placar. Cada desporto implementa `play()`.
 */
import * as THREE from 'three';
import { getCharacter } from '@festa/game';
import { CharacterModel } from '../three/CharacterModel';
import { disposeObject } from '../three/materials';
import { damp } from '../three/tweens';
import { setupSky } from '../stages/environment';
import type { HostLayout, Seat } from '../game/Seats';
import type { SportContext, SportRun, SportStanding } from './types';

export abstract class SportStage implements SportRun {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 600);
  protected readonly models = new Map<string, CharacterModel>();
  protected readonly sun: THREE.DirectionalLight;

  private readonly camPos = new THREE.Vector3(0, 6, 12);
  private readonly camLook = new THREE.Vector3(0, 1, 0);
  private readonly camPosTarget = new THREE.Vector3(0, 6, 12);
  private readonly camLookTarget = new THREE.Vector3(0, 1, 0);
  private camSpeed = 3;

  constructor(protected readonly ctx: SportContext) {
    this.sun = setupSky(this.scene);
  }

  abstract play(): Promise<SportStanding[]>;
  /** Lógica por frame do desporto (opcional). */
  protected tick(_dt: number, _time: number): void {}

  get players(): Seat[] {
    return this.ctx.players;
  }

  protected model(id: string): CharacterModel {
    let m = this.models.get(id);
    if (!m) {
      const seat = this.players.find((p) => p.id === id)!;
      m = new CharacterModel(getCharacter(seat.characterId));
      this.models.set(id, m);
      this.scene.add(m.root);
    }
    return m;
  }

  protected wait(seconds: number): Promise<void> {
    return this.ctx.engine.wait(seconds);
  }

  protected tween(duration: number, fn: (t: number) => void, ease?: (t: number) => number): Promise<void> {
    return this.ctx.engine.tween(duration, fn, ease);
  }

  /** Move a câmara suavemente (ou instantaneamente) para uma posição a olhar para um ponto. */
  protected cameraTo(pos: THREE.Vector3Like, look: THREE.Vector3Like, opts: { instant?: boolean; speed?: number } = {}): void {
    this.camPosTarget.set(pos.x, pos.y, pos.z);
    this.camLookTarget.set(look.x, look.y, look.z);
    this.camSpeed = opts.speed ?? 3;
    if (opts.instant) {
      this.camPos.copy(this.camPosTarget);
      this.camLook.copy(this.camLookTarget);
    }
  }

  protected setLayout(seat: Seat, layout: HostLayout): void {
    this.ctx.seats.setLayout(seat, layout);
  }

  protected waitAll(message: string, except?: string): void {
    for (const p of this.players) if (p.id !== except) this.setLayout(p, { kind: 'wait', message });
  }

  /** Placar à direita: uma linha por jogador com um texto de pontuação. */
  protected scoreboard(rows: { id: string; text: string; active?: boolean }[]): void {
    this.ctx.hud.setScoreboard(
      rows.map((r) => {
        const seat = this.players.find((p) => p.id === r.id)!;
        return {
          id: r.id,
          name: seat.name,
          color: getCharacter(seat.characterId).color,
          active: !!r.active,
          isBot: seat.isBot,
          connected: seat.isBot || !this.ctx.seats.isAuto(seat),
          tag: r.text,
        };
      }),
    );
  }

  update(dt: number, time: number): void {
    this.tick(dt, time);
    for (const m of this.models.values()) m.update(dt);
    const k = damp(this.camSpeed, dt);
    this.camPos.lerp(this.camPosTarget, k);
    this.camLook.lerp(this.camLookTarget, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  dispose(): void {
    for (const m of this.models.values()) m.dispose();
    disposeObject(this.scene);
  }
}
