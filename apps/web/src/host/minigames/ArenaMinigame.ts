/**
 * Base dos minijogos de arena: cenário, personagens, movimento com joystick,
 * dash no botão A, colisões entre personagens e câmara fixa.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { getCharacter } from '@festa/game';
import { CharacterModel } from '../three/CharacterModel';
import { disposeObject, mesh, toon } from '../three/materials';
import { damp } from '../three/tweens';
import { Water, setupSky } from '../stages/environment';
import type { MinigameContext, MinigameRun, MinigameScore, MinigameSeat } from './types';

export interface Actor {
  seat: MinigameSeat;
  model: CharacterModel;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  mass: number;
  speed: number;
  alive: boolean;
  stunned: number;
  dashTime: number;
  dashCooldown: number;
  facing: number;
}

export const TEAM_COLORS = { blue: '#2f7dff', red: '#ff3b5c' } as const;

export abstract class ArenaMinigame implements MinigameRun {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 400);
  readonly actors: Actor[] = [];
  protected readonly water = new Water(300);
  protected running = false;
  protected elapsed = 0;
  protected ended = false;
  protected abstract readonly duration: number;

  /** Dash: multiplicador de velocidade e tempos. */
  protected dashBoost = 2.4;
  protected dashLength = 0.2;
  protected dashCooldownTime = 1.1;
  /** Suavidade da aceleração (maior = mais responsivo). */
  protected grip = 12;

  constructor(protected readonly ctx: MinigameContext) {
    setupSky(this.scene, { fog: [70, 200] });
    this.scene.add(this.water.mesh);
    this.camera.position.set(0, 22, 20);
    this.camera.lookAt(0, 0, 1.5);
  }

  /** Cria as personagens em círculo. */
  protected spawnActors(radius: number, opts: (seat: MinigameSeat, i: number) => Partial<Actor> = () => ({})): void {
    const n = this.ctx.seats.length;
    this.ctx.seats.forEach((seat, i) => {
      const model = new CharacterModel(getCharacter(seat.characterId));
      // Como no tabuleiro: contorno e anel no chão com a cor de cada jogador (em equipas, o anel é o da equipa).
      model.setHighlight(getCharacter(seat.characterId).color, 0.5, !(seat.team && this.ctx.mode !== 'ffa'));
      const a = (i / n) * Math.PI * 2;
      const actor: Actor = {
        seat,
        model,
        pos: new THREE.Vector3(Math.sin(a) * radius, 0, Math.cos(a) * radius),
        vel: new THREE.Vector3(),
        radius: 0.6,
        mass: 1,
        speed: 7,
        alive: true,
        stunned: 0,
        dashTime: 0,
        dashCooldown: 0,
        facing: a + Math.PI,
        ...opts(seat, i),
      };
      model.faceYaw(actor.facing, true);
      if (seat.team && this.ctx.mode !== 'ffa') {
        const ring = mesh(new THREE.TorusGeometry(0.75, 0.09, 8, 28), toon(TEAM_COLORS[seat.team]), { cast: false });
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.05;
        model.root.add(ring);
      }
      this.scene.add(model.root);
      this.actors.push(actor);
    });
  }

  actor(id: string): Actor | undefined {
    return this.actors.find((a) => a.seat.id === id);
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

  /** IA dos bots: preenche o BotPad. */
  protected abstract think(actor: Actor, dt: number): void;
  /** Regras específicas, chamadas a cada frame enquanto o jogo corre. */
  protected abstract step(dt: number, time: number): void;
  /** Limites do movimento (paredes, obstáculos). */
  protected constrain(_actor: Actor): void {}

  protected endGame(): void {
    if (this.ended) return;
    this.ended = true;
    this.running = false;
    for (const a of this.actors) a.model.setAnim('idle');
  }

  /** Quem caiu da plataforma: continua a cair (mesmo depois de o jogo acabar) até desaparecer na água/lava. */
  private readonly sinking = new Set<Actor>();

  /**
   * Tira a personagem do jogo e fá-la cair da plataforma para a água (ou lava): salta um bocadinho
   * para fora, cai, faz «splash» e desaparece.
   */
  protected sink(a: Actor, push = 3): void {
    if (this.sinking.has(a)) return;
    a.alive = false;
    const out = new THREE.Vector3(a.pos.x, 0, a.pos.z);
    if (out.lengthSq() < 0.01) out.set(1, 0, 0);
    out.normalize();
    a.vel.set(a.vel.x * 0.5 + out.x * push, 4, a.vel.z * 0.5 + out.z * push);
    a.model.setAnim('fall');
    this.ctx.vibrate(a.seat.id, 300);
    this.sinking.add(a);
  }

  private updateSinking(dt: number): void {
    const waterY = this.water.mesh.position.y;
    for (const a of this.sinking) {
      const wasAbove = a.pos.y > waterY;
      a.vel.y -= 22 * dt;
      // Dentro de água/lava trava muito.
      if (!wasAbove) a.vel.multiplyScalar(1 - Math.min(1, dt * 4));
      a.pos.addScaledVector(a.vel, dt);
      if (wasAbove && a.pos.y <= waterY) {
        sound.play('splash', { vol: 0.7 });
        this.splash(a.pos.x, waterY, a.pos.z);
      }
      if (a.pos.y < waterY - 2.2) {
        a.model.root.visible = false;
        this.sinking.delete(a);
      }
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i]!;
      s.t += dt;
      const k = s.t / 0.6;
      s.mesh.scale.setScalar(0.5 + k * 2.2);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - k));
      if (k >= 1) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        (s.mesh.material as THREE.Material).dispose();
        this.splashes.splice(i, 1);
      }
    }
  }

  private readonly splashes: { mesh: THREE.Mesh; t: number }[] = [];

  /** Anel de espuma onde alguém caiu. */
  private splash(x: number, y: number, z: number): void {
    const geo = new THREE.RingGeometry(0.4, 0.75, 28);
    geo.rotateX(-Math.PI / 2);
    const lava = (this.water.mesh.material as THREE.MeshStandardMaterial).color.r > 0.6;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: lava ? '#ffb347' : '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }));
    m.position.set(x, y + 0.35, z);
    this.scene.add(m);
    this.splashes.push({ mesh: m, t: 0 });
  }

  update(dt: number, time: number): void {
    this.water.update(time);
    this.updateSinking(dt);
    if (this.running) {
      this.elapsed += dt;
      for (const a of this.actors) {
        if (!a.alive) continue;
        if (this.ctx.isBot(a.seat.id)) {
          this.think(a, dt);
          this.applySkill(a, dt);
        }
        this.move(a, dt);
      }
      this.collide();
      this.step(dt, time);
      if (this.elapsed >= this.duration) this.endGame();
    }
    for (const a of this.actors) {
      a.model.root.position.copy(a.pos);
      a.model.update(dt);
    }
  }

  private readonly wobble = new Map<string, number>();

  /**
   * Dificuldade: bots fracos são mais lentos a reagir e menos certeiros
   * (o stick é atenuado e desviado); bots "Mestre" ficam como a IA os pensou.
   */
  private applySkill(a: Actor, dt: number): void {
    const skill = this.ctx.botSkill;
    const pad = this.ctx.botPad(a.seat.id);
    const w = (this.wobble.get(a.seat.id) ?? Math.random() * 10) + dt * (1.5 + (1 - skill) * 2);
    this.wobble.set(a.seat.id, w);
    const err = (1 - skill) * 0.9 * Math.sin(w * 2.3);
    const speed = 0.6 + 0.4 * skill;
    const { x, y } = pad.stick;
    pad.stick.x = (x * Math.cos(err) - y * Math.sin(err)) * speed;
    pad.stick.y = (x * Math.sin(err) + y * Math.cos(err)) * speed;
  }

  protected move(a: Actor, dt: number): void {
    const pad = this.ctx.pad(a.seat.id);
    a.dashCooldown -= dt;
    a.dashTime -= dt;
    if (a.stunned > 0) {
      a.stunned -= dt;
      a.vel.multiplyScalar(1 - damp(6, dt));
      a.model.setAnim('dizzy');
      pad.consumePress('a');
    } else {
      if (pad.consumePress('a') && a.dashCooldown <= 0) {
        a.dashTime = this.dashLength;
        a.dashCooldown = this.dashCooldownTime;
        this.onDash(a);
        sound.play('whoosh', { vol: 0.4 });
      }
      const boost = a.dashTime > 0 ? this.dashBoost : 1;
      let sx = pad.stick.x;
      let sz = pad.stick.y;
      if (a.dashTime > 0 && Math.hypot(sx, sz) < 0.2) {
        sx = Math.sin(a.facing);
        sz = Math.cos(a.facing);
      }
      const desired = new THREE.Vector3(sx, 0, sz).multiplyScalar(a.speed * boost);
      a.vel.lerp(desired, damp(a.dashTime > 0 ? 30 : this.grip, dt));
      const sp = Math.hypot(a.vel.x, a.vel.z);
      if (sp > 0.5) {
        a.facing = Math.atan2(a.vel.x, a.vel.z);
        a.model.faceYaw(a.facing);
      }
      a.model.setAnim(sp > a.speed * 0.7 ? 'run' : sp > 0.6 ? 'walk' : 'idle');
    }
    a.pos.addScaledVector(a.vel, dt);
    this.constrain(a);
  }

  protected onDash(_a: Actor): void {}

  /** Empurra personagens sobrepostas (colisão de círculos com massa). */
  protected collide(): void {
    for (let i = 0; i < this.actors.length; i++) {
      for (let j = i + 1; j < this.actors.length; j++) {
        const a = this.actors[i]!;
        const b = this.actors[j]!;
        if (!a.alive || !b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const dist = Math.hypot(dx, dz);
        const min = a.radius + b.radius;
        if (dist >= min || dist === 0) continue;
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = min - dist;
        const total = a.mass + b.mass;
        a.pos.x -= nx * overlap * (b.mass / total);
        a.pos.z -= nz * overlap * (b.mass / total);
        b.pos.x += nx * overlap * (a.mass / total);
        b.pos.z += nz * overlap * (a.mass / total);
        this.onBump(a, b, nx, nz);
      }
    }
  }

  protected onBump(_a: Actor, _b: Actor, _nx: number, _nz: number): void {}

  /** Ajuda à IA: aponta o stick para um ponto. */
  protected steer(a: Actor, x: number, z: number, scale = 1): void {
    const pad = this.ctx.botPad(a.seat.id);
    const dx = x - a.pos.x;
    const dz = z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) {
      pad.stick.x = pad.stick.y = 0;
      return;
    }
    const k = Math.min(1, d / 1.5) * scale;
    pad.stick.x = (dx / d) * k;
    pad.stick.y = (dz / d) * k;
  }

  /** Placar simples de "quem está vivo". */
  protected teamOf(a: Actor): string {
    return this.ctx.mode === 'ffa' ? a.seat.id : (a.seat.team ?? a.seat.id);
  }

  dispose(): void {
    for (const a of this.actors) a.model.dispose();
    disposeObject(this.scene);
  }
}
