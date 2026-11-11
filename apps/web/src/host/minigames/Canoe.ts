/**
 * «Canoa a Pares» (equipas): cada equipa numa canoa, corrida pelo rio até à meta.
 * Cada Ⓐ é uma remada. Quando os membros da equipa ALTERNAM, a canoa dá um bom impulso;
 * se o mesmo remar duas vezes seguidas, a canoa abana e quase não anda. Coordenem-se!
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { PROPS, pickProp } from '../three/props';
import { Water } from '../stages/environment';
import { TEAM_COLORS } from './ArenaMinigame';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const START = -24;
/** Duração de uma remada (pá à frente → puxa para trás → levanta e volta). */
const STROKE = 0.5;

interface Paddle {
  pivot: THREE.Group;
  /** 1 = rema à direita, -1 = à esquerda. */
  side: number;
  /** Tempo desde o início da remada (≥ STROKE: parado). */
  t: number;
}
const FINISH = 24;

interface Boat {
  team: 'blue' | 'red';
  crew: Rower[];
  group: THREE.Group;
  x: number;
  z: number;
  v: number;
  wobble: number;
  last: string | null;
  lastAt: number;
  finishedAt: number;
}

class CanoeRun extends RowMinigame {
  protected readonly duration = 45;
  private readonly water = new Water(300);
  private readonly boats: Boat[] = [];
  private order = 0;
  private readonly botNext = new Map<string, number>();
  private readonly paddles = new Map<string, Paddle>();

  constructor(ctx: MinigameContext) {
    super(ctx, { ground: null, decor: false });
    this.scene.add(this.water.mesh);
    // Margens com árvores
    for (const side of [-1, 1]) {
      const bank = mesh(new THREE.BoxGeometry(90, 1.2, 8), toon('#7ccf5b'), { receive: true });
      bank.position.set(0, -0.2, side * 10);
      this.scene.add(bank);
      // Na margem do lado da câmara só plantas baixas (as árvores tapavam a vista).
      const near = side === 1;
      for (let i = 0; i < 16; i++) {
        const t = near
          ? pickProp(PROPS.plants, ctx.rng.next(), { height: 0.5 + ctx.rng.next() * 0.6 })
          : i % 3 === 2
            ? pickProp(PROPS.plants, ctx.rng.next(), { height: 0.6 + ctx.rng.next() * 0.8 })
            : pickProp(PROPS.trees, ctx.rng.next(), { height: 3.5 + ctx.rng.next() * 3.5 });
        if (!t) continue;
        t.position.set(-40 + i * 5.3 + ctx.rng.next() * 2, 0.4, side * (near ? 8 + ctx.rng.next() * 1.5 : 8 + ctx.rng.next() * 4));
        this.scene.add(t);
      }
    }
    // Meta
    const flag = mesh(new THREE.BoxGeometry(0.3, 0.05, 14), toonUnique('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.3 }), { cast: false });
    flag.position.set(FINISH, 0.05, 0);
    this.scene.add(flag);
    for (const side of [-1, 1]) {
      const post = mesh(new THREE.CylinderGeometry(0.15, 0.15, 4, 8), toon('#ff3b5c'));
      post.position.set(FINISH, 2, side * 6.5);
      this.scene.add(post);
    }
    (['blue', 'red'] as const).forEach((team, i) => {
      const crew = this.row.filter((r) => r.seat.team === team);
      if (!crew.length) return;
      const group = new THREE.Group();
      const len = 1.4 + crew.length * 1.3;
      const hull = mesh(new THREE.CapsuleGeometry(0.75, len, 6, 14), toonUnique(TEAM_COLORS[team]));
      hull.rotation.z = Math.PI / 2;
      hull.scale.set(1, 1, 0.6);
      group.add(hull);
      crew.forEach((r, k) => {
        const x = -len / 2 + 0.9 + k * 1.3;
        r.model.root.position.set(x, 0.1, 0);
        r.model.faceYaw(Math.PI / 2, true);
        r.model.setAnim('sit');
        r.model.restAnim = 'sit';
        group.add(r.model.root);
        // Remo: um rema à direita, o seguinte à esquerda (a canoa anda para +x, a direita é +z).
        const side = k % 2 === 0 ? 1 : -1;
        const pivot = new THREE.Group();
        pivot.position.set(x + 0.25, 0.85, side * 0.8);
        const tilt = new THREE.Group();
        tilt.rotation.x = side * 0.3; // inclinado para fora, para a pá chegar à água ao lado do casco
        const wood = toon('#e0a96a');
        const shaft = mesh(new THREE.CylinderGeometry(0.075, 0.075, 2.3, 10), wood);
        shaft.position.y = -0.75;
        const grip = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 8), toon('#5b3a1e'));
        grip.rotation.x = Math.PI / 2;
        grip.position.y = 0.4;
        const blade = mesh(new THREE.CapsuleGeometry(0.24, 0.5, 4, 12), toonUnique(TEAM_COLORS[team]));
        blade.scale.set(1, 1, 0.25);
        blade.rotation.y = Math.PI / 2; // a pá de frente para a água (empurra para trás)
        blade.position.y = -1.85;
        // Pontos onde as mãos agarram: a de fora mais abaixo no cabo, a de dentro no punho.
        const lowHold = new THREE.Object3D();
        lowHold.position.y = -0.45;
        const topHold = new THREE.Object3D();
        topHold.position.y = 0.32;
        tilt.add(shaft, grip, blade, lowHold, topHold);
        pivot.add(tilt);
        group.add(pivot);
        // A direita do boneco é +z (olha para +x): quem rema à direita tem a mão direita em baixo.
        if (side === 1) r.model.reach(topHold, lowHold);
        else r.model.reach(lowHold, topHold);
        this.paddles.set(r.seat.id, { pivot, side, t: STROKE });
      });
      const z = i === 0 ? 2.6 : -2.6;
      group.position.set(START, 0.2, z);
      this.scene.add(group);
      this.boats.push({ team, crew, group, x: START, z, v: 0, wobble: 0, last: null, lastAt: -1, finishedAt: 0 });
    });
  }

  private boatOf(r: Rower): Boat | undefined {
    return this.boats.find((b) => b.crew.includes(r));
  }

  scores(): MinigameScore[] {
    return this.row.map((r) => {
      const b = this.boatOf(r);
      return { id: r.seat.id, value: !b ? '' : b.finishedAt ? `🏁 ${b.finishedAt}.º` : `🛶 ${Math.max(0, Math.round(FINISH - b.x))} m` };
    });
  }

  winners(): string[] {
    const first = this.boats.find((b) => b.finishedAt === 1) ?? [...this.boats].sort((a, b) => b.x - a.x)[0];
    if (!first) return [];
    if (!first.finishedAt && this.boats.length > 1 && Math.abs(this.boats[0]!.x - this.boats[1]!.x) < 0.5) return [];
    return first.crew.map((r) => r.seat.id);
  }

  private stroke(b: Boat, r: Rower): void {
    const now = this.elapsed;
    const alternating = b.crew.length === 1 || (b.last !== null && b.last !== r.seat.id);
    const tooFast = now - b.lastAt < 0.16;
    let push = alternating && !tooFast ? 2.3 : 0.5;
    if (b.last === null) push = 2.3; // a primeira remada conta sempre
    if (push < 1) {
      b.wobble = 1;
      this.ctx.vibrate(r.seat.id, 90);
    } else this.ctx.vibrate(r.seat.id, 20);
    b.v = Math.min(9, b.v + push);
    b.last = r.seat.id;
    b.lastAt = now;
    const paddle = this.paddles.get(r.seat.id);
    if (paddle) paddle.t = 0;
    sound.play('splash', { vol: 0.25, pitch: 1.4 });
  }

  protected step(dt: number): void {
    for (const b of this.boats) {
      if (b.finishedAt) continue;
      for (const r of b.crew) {
        if (this.isBot(r)) {
          // Bots: remam quando a última remada foi de outro membro, a um ritmo que depende da dificuldade.
          const t = (this.botNext.get(r.seat.id) ?? 0) - dt;
          this.botNext.set(r.seat.id, t);
          const myTurn = b.crew.length === 1 || b.last !== r.seat.id || this.ctx.rng.next() < 0.15 * (1 - this.ctx.botSkill);
          if (t <= 0 && myTurn && this.elapsed - b.lastAt > 0.2) {
            this.stroke(b, r);
            this.botNext.set(r.seat.id, (0.55 - this.ctx.botSkill * 0.25) * (0.8 + this.ctx.rng.next() * 0.5));
          }
        } else if (this.pressed(r, 'a')) this.stroke(b, r);
      }
      b.v *= Math.exp(-1.1 * dt);
      b.x += b.v * dt;
      b.wobble = Math.max(0, b.wobble - dt * 2);
      if (b.x >= FINISH) {
        b.finishedAt = ++this.order;
        sound.play(b.finishedAt === 1 ? 'win' : 'whistle');
        for (const r of b.crew) this.ctx.vibrate(r.seat.id, 250);
        if (b.finishedAt === 1) this.elapsed = Math.max(this.elapsed, this.duration - 3);
      }
    }
    if (this.boats.every((b) => b.finishedAt)) this.endGame();
  }

  protected override animate(dt: number, time: number): void {
    this.water.update(time);
    // Remos: pá à frente e dentro de água → puxa para trás → levanta e volta à frente.
    // O corpo acompanha (roda o tronco para o lado do remo e inclina-se para a frente).
    for (const [id, p] of this.paddles) {
      p.t += dt;
      const k = Math.min(1, p.t / STROKE);
      const pull = k < 0.6 ? k / 0.6 : 1 - (k - 0.6) / 0.4; // 0→1 a puxar, 1→0 a voltar
      const swing = 0.55 - pull * 1.15; // + = pá à frente (+x), − = pá atrás
      const lift = k < 0.6 ? 0 : Math.sin(((k - 0.6) / 0.4) * Math.PI) * 0.35; // fora de água ao voltar
      p.pivot.rotation.z = swing;
      p.pivot.position.y = 0.85 + lift;
      const r = this.row.find((x) => x.seat.id === id);
      if (r) {
        r.model.pose.chestY = p.side * -0.35 * (1 - pull) + p.side * 0.15;
        r.model.pose.headX = 0.12 * Math.sin(pull * Math.PI);
      }
    }
    let mid = 0;
    for (const b of this.boats) {
      b.group.position.set(b.x, 0.2 + Math.sin(time * 3 + b.z) * 0.05, b.z);
      b.group.rotation.x = Math.sin(time * 18) * 0.12 * b.wobble;
      mid += b.x;
    }
    mid /= Math.max(1, this.boats.length);
    // Câmara de lado, a acompanhar as canoas.
    this.camera.position.x += (mid + 2 - this.camera.position.x) * Math.min(1, dt * 2);
    // Um pouco mais alta, para nada na margem tapar as canoas.
    this.camera.position.y = 9.5;
    this.camera.position.z = 14;
    this.camera.lookAt(this.camera.position.x, 0.5, 0);
  }

  override endGame(): void {
    super.endGame();
    for (const r of this.row) {
      r.model.restAnim = 'idle';
      r.model.reach(null, null);
    }
  }

  override dispose(): void {
    this.water.mesh.geometry.dispose();
    super.dispose();
  }
}

export const Canoe: MinigameDef = {
  id: 'canoa',
  rounds: 2,
  name: 'Canoa a Pares',
  modes: ['teams'],
  description: () => 'Corrida de canoas! Cada Ⓐ é uma remada, mas a canoa só anda bem se os da equipa remarem À VEZ. Se o mesmo remar duas vezes seguidas, ela abana.',
  controls: 'Ⓐ Remar (alternem!)',
  stick: false,
  buttons: [{ id: 'a', label: 'Remar' }],
  create: (ctx) => new CanoeRun(ctx),
};
