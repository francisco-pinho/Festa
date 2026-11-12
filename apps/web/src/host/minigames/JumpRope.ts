/**
 * «Corda Saltitona»: uma corda comprida gira cada vez mais depressa por baixo de toda a gente.
 * Salta com Ⓐ quando ela passa no chão — quem estiver no chão nesse momento tropeça e sai.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const JUMP = 0.62; // duração do salto (s)
const JUMP_H = 1.6; // altura do salto
const R = 3.3; // raio da volta da corda (no meio)
const HAND_Y = 3.4; // altura a que a corda está presa nos postes
const ROPE_R = 0.09;

/** Textura de corda entrançada: fios em diagonal, castanho-claro com sombras. */
let ropeTex: THREE.CanvasTexture | null = null;
export function ropeTexture(): THREE.CanvasTexture {
  if (ropeTex) return ropeTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9a46a';
  g.fillRect(0, 0, 64, 32);
  for (let i = -2; i < 6; i++) {
    g.fillStyle = i % 2 ? '#a8824c' : '#dcbb84';
    g.beginPath();
    g.moveTo(i * 16, 0);
    g.lineTo(i * 16 + 10, 0);
    g.lineTo(i * 16 + 26, 32);
    g.lineTo(i * 16 + 16, 32);
    g.closePath();
    g.fill();
  }
  ropeTex = new THREE.CanvasTexture(c);
  ropeTex.colorSpace = THREE.SRGBColorSpace;
  ropeTex.wrapS = ropeTex.wrapT = THREE.RepeatWrapping;
  ropeTex.repeat.set(90, 1);
  return ropeTex;
}

class JumpRopeRun extends RowMinigame {
  protected readonly duration = 45;
  private angle = Math.PI * 0.2; // 0 = em cima; π = no chão
  private speed = 3.2; // rad/s
  private passes = 0;
  private readonly rope: THREE.Mesh;
  private readonly ropeCurve: THREE.CatmullRomCurve3;
  private readonly ropePts: THREE.Vector3[];
  private readonly air = new Map<string, number>();
  private readonly botPlan = new Map<string, number>();
  private readonly half: number;

  constructor(ctx: MinigameContext) {
    super(ctx, { spacing: 1.9 });
    // A corda é bem mais comprida do que a fila: todos ficam na parte do meio, onde ela bate no chão.
    this.half = (this.row.length * 1.9) / 2 / 0.55 + 1;
    for (const side of [-1, 1]) {
      const post = mesh(new THREE.CylinderGeometry(0.16, 0.2, HAND_Y + 0.4, 10), toon('#8b5a2b'));
      post.position.set(side * this.half, (HAND_Y + 0.4) / 2, 0);
      const knob = mesh(new THREE.SphereGeometry(0.28, 12, 10), toon('#8b5a2b'));
      knob.position.set(side * this.half, HAND_Y, 0);
      this.scene.add(post, knob);
    }
    // Corda a sério: uma curva presa nos postes que roda (o meio vai lá abaixo, as pontas ficam paradas).
    this.ropePts = Array.from({ length: 25 }, () => new THREE.Vector3());
    this.ropeCurve = new THREE.CatmullRomCurve3(this.ropePts);
    // Curva «catmullrom» simples: a «centripetal» (por omissão) pode dar valores inválidos.
    this.ropeCurve.curveType = 'catmullrom';
    // Sem sombra: a corda é refeita a cada imagem e a sombra dela chegou a escurecer o ecrã todo.
    // Corda de sisal entrançada (textura às riscas em diagonal), mais grossa.
    this.rope = mesh(new THREE.TubeGeometry(this.ropeCurve, 48, ROPE_R, 8), toonUnique('#ffffff', { map: ropeTexture() }), { cast: false });
    this.rope.frustumCulled = false;
    this.scene.add(this.rope);
    this.camera.position.set(0, 5.5, this.half * 1.25 + 4);
    this.camera.lookAt(0, 2, 0);
    for (const r of this.row) this.air.set(r.seat.id, 0);
  }

  scores(): MinigameScore[] {
    return this.row.map((r) => ({ id: r.seat.id, value: r.alive ? `🪢 ${this.passes}` : '💫' }));
  }

  winners(): string[] {
    return this.survivorsWin();
  }

  private jump(r: Rower): void {
    if ((this.air.get(r.seat.id) ?? 0) > 0 || !r.alive) return;
    this.air.set(r.seat.id, JUMP);
    r.model.setAnim('jump');
  }

  protected step(dt: number): void {
    const before = this.angle;
    this.speed = Math.min(12, 3.2 + this.elapsed * 0.2);
    this.angle += this.speed * dt;
    // Passou no chão (ângulo π + 2kπ)?
    const crossed = Math.floor((before - Math.PI) / (Math.PI * 2)) !== Math.floor((this.angle - Math.PI) / (Math.PI * 2));
    for (const r of this.row) {
      if (!r.alive) continue;
      if (this.isBot(r)) this.think(r);
      if (this.pressed(r, 'a')) this.jump(r);
      const t = Math.max(0, (this.air.get(r.seat.id) ?? 0) - dt);
      this.air.set(r.seat.id, t);
      r.model.root.position.y = t > 0 ? Math.sin((1 - t / JUMP) * Math.PI) * JUMP_H : 0;
      if (t === 0 && r.model.anim === 'jump') r.model.setAnim('idle');
    }
    if (crossed) {
      this.passes++;
      sound.play('tick', { pitch: 0.8 });
      for (const r of this.row) {
        if (!r.alive) continue;
        if (r.model.root.position.y < 0.25) {
          this.knockOut(r);
          r.model.setAnim('fall');
          this.ctx.vibrate(r.seat.id, 300);
          this.float('💫', r.x, 2.4, '#ff6b7a');
          sound.play('hit');
        } else this.ctx.vibrate(r.seat.id, 20);
      }
      this.endIfDecided();
    }
  }

  /** Bot: salta pouco antes de a corda chegar ao chão, com um erro que depende da dificuldade. */
  private think(r: Rower): void {
    const toGround = (((Math.PI - this.angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const timeLeft = toGround / this.speed;
    let plan = this.botPlan.get(r.seat.id);
    if (plan === undefined) {
      // Mais depressa = mais difícil acertar no tempo.
      const err = (1 - this.ctx.botSkill) * 0.2 + this.speed * 0.012;
      plan = JUMP * 0.45 + (this.ctx.rng.next() * 2 - 1) * err;
      this.botPlan.set(r.seat.id, plan);
    }
    if (timeLeft <= plan && timeLeft > plan - 0.05) {
      this.botPress(r, 'a');
      this.botPlan.delete(r.seat.id);
    }
  }

  protected override animate(): void {
    // Cada ponto da corda roda à volta do eixo entre os postes; quanto mais ao meio, maior a volta
    // (curva como uma corda real). No chão achata um pouco em vez de o atravessar.
    const n = this.ropePts.length;
    const lag = 0.18; // o meio vai ligeiramente atrás das pontas (a corda «arrasta»)
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const bulge = Math.sin(u * Math.PI) ** 0.3; // mais «cheia» no meio: rasa o chão em toda a fila
      const a = this.angle - lag * bulge;
      const y = HAND_Y + Math.cos(a) * R * bulge;
      this.ropePts[i]!.set(-this.half + u * this.half * 2, Math.max(0.07, y), Math.sin(a) * R * 0.7 * bulge);
    }
    // Proteção: se algum ponto vier inválido, mantém a corda da imagem anterior.
    if (this.ropePts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z))) return;
    this.ropeCurve.updateArcLengths();
    const geo = new THREE.TubeGeometry(this.ropeCurve, 48, ROPE_R, 8);
    const pos = geo.attributes.position!.array as Float32Array;
    for (let i = 0; i < pos.length; i++)
      if (!Number.isFinite(pos[i]!)) {
        geo.dispose();
        return;
      }
    this.rope.geometry.dispose();
    this.rope.geometry = geo;
  }
}

export const JumpRope: MinigameDef = {
  id: 'corda',
  rounds: 2,
  name: 'Corda Saltitona',
  modes: ['ffa', 'teams'],
  description: () => 'Salta à corda! Carrega em Ⓐ quando a corda passar no chão. Vai cada vez mais depressa — quem tropeçar sai.',
  controls: 'Ⓐ Saltar',
  stick: false,
  buttons: [{ id: 'a', label: 'Saltar' }],
  create: (ctx) => new JumpRopeRun(ctx),
};
