/**
 * «Bolas de Neve»: bolas de neve rolam do cimo do campo para baixo, cada vez mais e mais
 * depressa. As grandes têm de se fugir para o lado; as pequenas saltam-se com Ⓐ.
 * Quem é apanhado fica de fora. Ganha quem sobreviver (ou a equipa com mais gente).
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { PROPS } from '../three/props';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import { ringDecor } from './scenery';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const W = 11; // meia largura
const TOP = -12;
const BOTTOM = 12;

interface Ball {
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  r: number;
  x: number;
  z: number;
  speed: number;
}

class SnowballsRun extends ArenaMinigame {
  protected readonly duration = 40;
  private readonly balls: Ball[] = [];
  private nextBall = 1.2;
  private readonly jump = new Map<string, number>();
  private readonly ballGeo = new THREE.IcosahedronGeometry(1, 2);
  /** Contorno escuro (face de trás, um pouco maior) e sombra no chão: as bolas veem-se bem na neve. */
  private readonly outlineMat = new THREE.MeshBasicMaterial({ color: '#1d3557', side: THREE.BackSide });
  private readonly shadowGeo = new THREE.CircleGeometry(1, 24);
  private readonly shadowMat = new THREE.MeshBasicMaterial({ color: '#1d3557', transparent: true, opacity: 0.35, depthWrite: false });
  private readonly outAt = new Map<string, number>();

  constructor(ctx: MinigameContext) {
    super(ctx);
    // Sem dash: Ⓐ salta.
    this.dashCooldownTime = 999;
    this.scene.background = new THREE.Color('#cfe6ff');
    const snow = mesh(new THREE.BoxGeometry(W * 2 + 2, 1, BOTTOM - TOP + 4), toon('#d3dfee'), { cast: false, receive: true });
    snow.position.set(0, -0.5, (TOP + BOTTOM) / 2);
    this.scene.add(snow);
    for (const side of [-1, 1]) {
      const bank = mesh(new THREE.BoxGeometry(1, 1.4, BOTTOM - TOP + 4), toon('#e4ecff'));
      bank.position.set(side * (W + 1.2), 0.2, (TOP + BOTTOM) / 2);
      this.scene.add(bank);
    }
    ringDecor(this.scene, ctx.rng, W + 10, 24, { trees: PROPS.trees.filter((k) => /Pine/.test(k)), props: PROPS.rocks });
    this.spawnActors(0, (_seat, i) => ({ pos: new THREE.Vector3((i - (ctx.seats.length - 1) / 2) * 2.2, 0, 6), facing: Math.PI }));
    this.camera.position.set(0, 18, 22);
    this.camera.lookAt(0, 0, 2);
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => ({ id: a.seat.id, value: a.alive ? '⛄' : '❄️' }));
  }

  winners(): string[] {
    let alive = this.actors.filter((a) => a.alive);
    if (!alive.length) {
      const last = Math.max(...this.actors.map((a) => this.outAt.get(a.seat.id) ?? 0));
      alive = this.actors.filter((a) => (this.outAt.get(a.seat.id) ?? 0) >= last - 0.05);
    }
    if (this.ctx.mode === 'ffa') return alive.length === this.actors.length ? [] : alive.map((a) => a.seat.id);
    const count = (t: 'blue' | 'red') => alive.filter((a) => a.seat.team === t).length;
    if (count('blue') === count('red')) return [];
    const team = count('blue') > count('red') ? 'blue' : 'red';
    return this.actors.filter((a) => a.seat.team === team).map((a) => a.seat.id);
  }

  protected override constrain(a: Actor): void {
    a.pos.x = Math.max(-W + 0.5, Math.min(W - 0.5, a.pos.x));
    a.pos.z = Math.max(TOP + 4, Math.min(BOTTOM - 1, a.pos.z));
  }

  /** Ⓐ = saltar (substitui o arranque). */
  protected override onDash(a: Actor): void {
    a.dashTime = 0;
    if ((this.jump.get(a.seat.id) ?? 0) <= 0) {
      this.jump.set(a.seat.id, 0.6);
      a.model.setAnim('jump');
      sound.play('whoosh', { vol: 0.3 });
    }
  }

  private spawnBall(): void {
    const big = this.ctx.rng.next() < 0.55;
    const r = big ? 1.5 + this.ctx.rng.next() * 0.6 : 0.55;
    // As pequenas (que se podem saltar) são azuladas; as grandes brancas.
    const m = mesh(this.ballGeo, toonUnique(big ? '#ffffff' : '#9fd3ff', { emissive: big ? '#ffffff' : '#9fd3ff', emissiveIntensity: 0.12 }));
    m.scale.setScalar(r);
    const outline = new THREE.Mesh(this.ballGeo, this.outlineMat);
    outline.scale.setScalar(1.07);
    m.add(outline);
    const x = (this.ctx.rng.next() * 2 - 1) * (W - r);
    m.position.set(x, r, TOP);
    this.scene.add(m);
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.setScalar(r * 1.05);
    shadow.position.set(x, 0.02, TOP);
    this.scene.add(shadow);
    const pace = 1 + this.elapsed / 25;
    this.balls.push({ mesh: m, shadow, r, x, z: TOP, speed: (big ? 6 : 8) * pace });
  }

  protected step(dt: number): void {
    // Saltos
    for (const a of this.actors) {
      const j = (this.jump.get(a.seat.id) ?? 0) - dt;
      this.jump.set(a.seat.id, j);
      a.pos.y = j > 0 ? Math.sin((1 - j / 0.6) * Math.PI) * 1.4 : 0;
      if (a.dashCooldown > 1) a.dashCooldown = 0; // Ⓐ disponível sempre que está no chão
    }
    this.nextBall -= dt;
    if (this.nextBall <= 0) {
      this.spawnBall();
      this.nextBall = Math.max(0.35, 1.3 - this.elapsed * 0.025) * (0.7 + this.ctx.rng.next() * 0.6);
    }
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i]!;
      b.z += b.speed * dt;
      b.mesh.position.z = b.z;
      b.shadow.position.z = b.z;
      b.mesh.rotation.x += (b.speed * dt) / b.r;
      for (const a of this.actors) {
        if (!a.alive) continue;
        const d = Math.hypot(a.pos.x - b.x, a.pos.z - b.z);
        const airborne = a.pos.y > 0.5;
        if (d < b.r + 0.45 && !(airborne && b.r < 1)) {
          a.alive = false;
          this.outTimes.set(a.seat.id, this.elapsed);
          this.outAt.set(a.seat.id, this.elapsed);
          a.model.setAnim('fall');
          a.model.root.scale.set(1.15, 0.45, 1.15);
          this.ctx.vibrate(a.seat.id, 350);
          sound.play('hit');
        }
      }
      if (b.z > BOTTOM + 3) {
        this.scene.remove(b.mesh, b.shadow);
        (b.mesh.material as THREE.Material).dispose();
        this.balls.splice(i, 1);
      }
    }
    const alive = this.actors.filter((x) => x.alive);
    if (!alive.length || (this.ctx.mode !== 'ffa' && new Set(alive.map((x) => x.seat.team)).size <= 1)) this.endGame();
  }

  protected think(a: Actor): void {
    const pad = this.ctx.botPad(a.seat.id);
    // A bola mais perigosa a chegar: foge para o lado (grande) ou salta (pequena).
    const danger = this.balls
      .filter((b) => b.z < a.pos.z + 0.5 && a.pos.z - b.z < 5 + b.speed * 0.4 && Math.abs(b.x - a.pos.x) < b.r + 1.2)
      .sort((p, q) => q.z - p.z)[0];
    if (!danger) {
      this.steer(a, a.pos.x * 0.9, 6, 0.4);
      return;
    }
    if (danger.r < 1 && a.pos.z - danger.z < 1.8 && this.ctx.rng.next() < 0.5 + this.ctx.botSkill * 0.5) pad.press('a');
    else if (danger.r >= 1) {
      const side = a.pos.x >= danger.x ? 1 : -1;
      const goal = Math.abs(a.pos.x + side * 3) > W - 1 ? -side : side;
      this.steer(a, a.pos.x + goal * 3, a.pos.z);
    }
  }

  override dispose(): void {
    this.ballGeo.dispose();
    this.shadowGeo.dispose();
    this.outlineMat.dispose();
    this.shadowMat.dispose();
    super.dispose();
  }
}

export const Snowballs: MinigameDef = {
  id: 'neve',
  rounds: 2,
  name: 'Bolas de Neve',
  modes: ['ffa', 'teams'],
  description: () => 'Bolas de neve gigantes rolam colina abaixo! Foge das grandes para o lado e salta as pequenas (azuis) com Ⓐ. Quem for apanhado sai.',
  controls: '🕹️ Mover · Ⓐ Saltar',
  stick: true,
  buttons: [{ id: 'a', label: 'Saltar' }],
  create: (ctx) => new SnowballsRun(ctx),
};
