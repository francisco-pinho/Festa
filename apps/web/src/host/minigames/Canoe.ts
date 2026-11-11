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

  constructor(ctx: MinigameContext) {
    super(ctx, { ground: null, decor: false });
    this.scene.add(this.water.mesh);
    // Margens com árvores
    for (const side of [-1, 1]) {
      const bank = mesh(new THREE.BoxGeometry(90, 1.2, 8), toon('#7ccf5b'), { receive: true });
      bank.position.set(0, -0.2, side * 10);
      this.scene.add(bank);
      for (let i = 0; i < 16; i++) {
        const t = pickProp([...PROPS.trees, ...PROPS.plants], ctx.rng.next(), { height: 2 + ctx.rng.next() * 5 });
        if (!t) continue;
        t.position.set(-40 + i * 5.3 + ctx.rng.next() * 2, 0.4, side * (8 + ctx.rng.next() * 4));
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
        r.model.root.position.set(-len / 2 + 0.9 + k * 1.3, 0.1, 0);
        r.model.faceYaw(Math.PI / 2, true);
        r.model.setAnim('sit');
        r.model.restAnim = 'sit';
        group.add(r.model.root);
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
    r.model.setAnim(r.model.anim === 'punchLeft' ? 'punchRight' : 'punchLeft');
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
    let mid = 0;
    for (const b of this.boats) {
      b.group.position.set(b.x, 0.2 + Math.sin(time * 3 + b.z) * 0.05, b.z);
      b.group.rotation.x = Math.sin(time * 18) * 0.12 * b.wobble;
      mid += b.x;
    }
    mid /= Math.max(1, this.boats.length);
    // Câmara de lado, a acompanhar as canoas.
    this.camera.position.x += (mid + 2 - this.camera.position.x) * Math.min(1, dt * 2);
    this.camera.position.y = 7;
    this.camera.position.z = 15;
    this.camera.lookAt(this.camera.position.x, 0.5, 0);
  }

  override endGame(): void {
    super.endGame();
    for (const r of this.row) r.model.restAnim = 'idle';
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
