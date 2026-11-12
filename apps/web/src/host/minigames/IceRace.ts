/**
 * «Corrida no Gelo» (todos contra todos / equipas): corrida numa pista oval de gelo. Escorrega!
 * Guia com o joystick (é preciso travar antes das curvas) e Ⓐ dá um impulso de patinagem.
 * 2 voltas (3 na 2.ª ronda): ganha quem cortar a meta primeiro; se o tempo acabar, quem for à frente.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { rankBy } from './rank';

/** Elipses da pista: parede de fora, ilha do meio e a linha central (para os bots). */
const OUT = { a: 14, b: 8.5 };
const IN = { a: 7, b: 2.6 };
const MID = { a: 10.5, b: 5.6 };

const ellipse = (e: { a: number; b: number }, x: number, z: number) => Math.hypot(x / e.a, z / e.b);
/** Ângulo «de pista» (0–2π) de um ponto. */
const trackAngle = (x: number, z: number) => Math.atan2(z / MID.b, x / MID.a);

function ellipseShape(e: { a: number; b: number }, n = 96): THREE.Path {
  const p = new THREE.Path();
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = Math.cos(t) * e.a;
    const z = Math.sin(t) * e.b;
    if (i === 0) p.moveTo(x, z);
    else p.lineTo(x, z);
  }
  return p;
}

class IceRaceRun extends ArenaMinigame {
  protected readonly duration = 70;
  private readonly laps: number;
  private readonly progress = new Map<string, number>();
  private readonly lastAngle = new Map<string, number>();
  private readonly finishedAt = new Map<string, number>();
  private order = 0;

  constructor(ctx: MinigameContext) {
    super(ctx);
    this.laps = (ctx.round ?? 1) >= 2 ? 3 : 2;
    this.grip = 2.4; // gelo: pouca aderência
    this.dashBoost = 1.8;
    this.dashLength = 0.35;
    this.dashCooldownTime = 1.2;
    // Neve à volta, pista de gelo (com a ilha no meio) e as tábuas da parede.
    const snow = mesh(new THREE.CylinderGeometry(30, 30, 1, 48), toon('#f4f8ff'), { cast: false, receive: true });
    snow.position.y = -0.55;
    this.scene.add(snow);
    const iceShape = new THREE.Shape(ellipseShape(OUT).getPoints());
    iceShape.holes.push(ellipseShape(IN));
    const iceGeo = new THREE.ShapeGeometry(iceShape, 1);
    iceGeo.rotateX(Math.PI / 2);
    const ice = new THREE.Mesh(iceGeo, new THREE.MeshPhysicalMaterial({ color: '#bfe6ff', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide }));
    ice.position.y = 0.01;
    ice.receiveShadow = true;
    this.scene.add(ice);
    const island = mesh(new THREE.CylinderGeometry(1, 1, 0.8, 48), toon('#ffffff'));
    island.scale.set(IN.a, 1, IN.b);
    island.position.y = 0.4;
    this.scene.add(island);
    // Pinheiros na ilha do meio
    for (let i = 0; i < 6; i++) {
      const tree = new THREE.Group();
      const trunk = mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8), toon('#7a4f28'));
      trunk.position.y = 1.2;
      const top = mesh(new THREE.ConeGeometry(0.9, 2, 8), toon('#2f8a5a'));
      top.position.y = 2.4;
      tree.add(trunk, top);
      tree.position.set(-5 + i * 2, 0, (i % 2 ? 0.7 : -0.7));
      this.scene.add(tree);
    }
    // Parede de fora (tábuas às cores)
    for (let i = 0; i < 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      const board = mesh(new THREE.BoxGeometry(1.5, 0.9, 0.25), toonUnique(i % 2 ? '#ff3b5c' : '#ffffff'), { cast: false });
      board.position.set(Math.cos(t) * (OUT.a + 0.2), 0.45, Math.sin(t) * (OUT.b + 0.2));
      board.rotation.y = -Math.atan2(Math.sin(t) * OUT.a, Math.cos(t) * OUT.b) + Math.PI / 2;
      this.scene.add(board);
    }
    // Meta (xadrez) no lado de cá, entre a ilha e a parede.
    for (let k = 0; k < 12; k++) {
      for (let j = 0; j < 2; j++) {
        const sq = mesh(new THREE.BoxGeometry(0.5, 0.02, 0.5), toon((k + j) % 2 ? '#1d1433' : '#ffffff'), { cast: false });
        sq.position.set(-0.25 + j * 0.5, 0.03, IN.b + 0.3 + k * ((OUT.b - IN.b - 0.4) / 12));
        this.scene.add(sq);
      }
    }
    this.spawnActors(3, () => ({ speed: 8.5, radius: 0.55 }));
    const n = this.actors.length;
    this.actors.forEach((a, i) => {
      // Na grelha de partida, atrás da meta, virados para +x.
      a.pos.set(-1.4 - (i % 2) * 1.2, 0, IN.b + 1 + ((i + 0.5) / n) * (OUT.b - IN.b - 2));
      a.facing = Math.PI / 2;
      a.model.faceYaw(Math.PI / 2, true);
      this.lastAngle.set(a.seat.id, trackAngle(a.pos.x, a.pos.z));
      this.progress.set(a.seat.id, 0);
    });
    this.camera.position.set(0, 25, 19);
    this.camera.lookAt(0, 0, 1);
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => {
      const f = this.finishedAt.get(a.seat.id);
      if (f) return { id: a.seat.id, value: `🏁 ${f}.º` };
      const lap = Math.min(this.laps, Math.floor((this.progress.get(a.seat.id) ?? 0) / (Math.PI * 2)) + 1);
      return { id: a.seat.id, value: `volta ${lap}/${this.laps}` };
    });
  }

  override ranking(): string[][] {
    // Quem acabou (pela ordem) e depois quem foi mais longe.
    return rankBy(this.actors.map((a) => a.seat.id), (id) => {
      const f = this.finishedAt.get(id);
      return f ? 1e6 - f : (this.progress.get(id) ?? 0);
    });
  }

  winners(): string[] {
    const first = [...this.finishedAt].find(([, o]) => o === 1)?.[0];
    let leader = first;
    if (!leader) {
      const best = Math.max(...this.progress.values());
      const top = [...this.progress].filter(([, p]) => p === best);
      if (top.length !== 1 || best <= 0) return [];
      leader = top[0]![0];
    }
    if (this.ctx.mode === 'ffa') return [leader];
    const team = this.actors.find((a) => a.seat.id === leader)!.seat.team;
    return this.actors.filter((a) => a.seat.team === team).map((a) => a.seat.id);
  }

  /** Fica dentro da pista: parede de fora e ilha do meio (ressalta e perde velocidade). */
  protected override constrain(a: Actor): void {
    const eo = ellipse(OUT, a.pos.x, a.pos.z);
    const r = a.radius / OUT.b;
    if (eo > 1 - r) {
      a.pos.x *= (1 - r) / eo;
      a.pos.z *= (1 - r) / eo;
      a.vel.multiplyScalar(-0.25);
    }
    const ei = ellipse(IN, a.pos.x, a.pos.z);
    const ri = a.radius / IN.b;
    if (ei < 1 + ri) {
      const k = (1 + ri) / Math.max(0.01, ei);
      a.pos.x *= k;
      a.pos.z *= k;
      a.vel.multiplyScalar(-0.25);
    }
  }

  protected step(): void {
    for (const a of this.actors) {
      if (this.finishedAt.has(a.seat.id)) continue;
      const ang = trackAngle(a.pos.x, a.pos.z);
      let d = ang - this.lastAngle.get(a.seat.id)!;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.lastAngle.set(a.seat.id, ang);
      // Andar para +x no lado de cá (z > 0) faz o ângulo descer: o progresso é o contrário.
      const p = (this.progress.get(a.seat.id) ?? 0) - d;
      this.progress.set(a.seat.id, p);
      if (p >= this.laps * Math.PI * 2) {
        const pos = ++this.order;
        this.finishedAt.set(a.seat.id, pos);
        this.ctx.vibrate(a.seat.id, 250);
        sound.play(pos === 1 ? 'win' : 'whistle');
        a.vel.multiplyScalar(0.3);
        a.model.setAnim('cheer');
        if (pos === 1) this.elapsed = Math.max(this.elapsed, this.duration - 4);
      } else if (Math.floor(p / (Math.PI * 2)) > Math.floor((p + d) / (Math.PI * 2))) {
        sound.play('bell', { vol: 0.5 });
        this.ctx.vibrate(a.seat.id, 60);
      }
    }
    if (this.actors.every((a) => this.finishedAt.has(a.seat.id))) this.endGame();
  }

  protected override move(a: Actor, dt: number): void {
    if (this.finishedAt.has(a.seat.id)) {
      a.vel.multiplyScalar(1 - Math.min(1, dt * 2));
      a.pos.addScaledVector(a.vel, dt);
      this.constrain(a);
      return;
    }
    super.move(a, dt);
  }

  /** Bots: apontam para um ponto um pouco à frente na linha do meio; impulso nas retas. */
  protected think(a: Actor): void {
    const pad = this.ctx.botPad(a.seat.id);
    const ang = trackAngle(a.pos.x, a.pos.z);
    const ahead = ang - 0.55;
    const tx = Math.cos(ahead) * MID.a;
    const tz = Math.sin(ahead) * MID.b;
    this.steer(a, tx, tz);
    const straight = Math.abs(Math.sin(ang)) > 0.85;
    if (straight && this.ctx.rng.next() < 0.03 + this.ctx.botSkill * 0.03) pad.press('a');
  }
}

export const IceRace: MinigameDef = {
  id: 'gelo',
  rounds: 2,
  name: 'Corrida no Gelo',
  modes: ['ffa', 'teams'],
  description: () =>
    'Corrida numa pista de gelo! Guia com o joystick — escorrega, por isso trava antes das curvas — e Ⓐ dá um impulso. Ganha quem cortar a meta primeiro.',
  controls: '🕹️ Patinar · Ⓐ Impulso',
  stick: true,
  buttons: [{ id: 'a', label: 'Impulso' }],
  create: (ctx) => new IceRaceRun(ctx),
};
