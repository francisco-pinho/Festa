/**
 * «Bombas Sobe-Desce» (todos contra todos): cada um tem uma passadeira rolante que traz bombas
 * na sua direção. Ⓐ inverte a passadeira: as bombas sobem e, lá em cima, caem na passadeira de
 * outro jogador. Uma bomba que chegue até ti rebenta: perdes uma vida (❤️ 3). Ganha quem sobrar.
 * Cada vez aparecem mais bombas e mais depressa.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const LEN = 9; // comprimento da passadeira
const LIVES = 3;

interface Lane {
  r: Rower;
  dir: 1 | -1; // 1 = a descer (para o jogador), −1 = a subir
  belt: THREE.Mesh;
  stripes: THREE.Mesh[];
  lives: number;
  hearts: THREE.Sprite | null;
  cool: number;
}

interface Bomb {
  lane: number;
  s: number; // 0 = topo, LEN = junto ao jogador
  obj: THREE.Group;
  fuse: THREE.Mesh;
  /** A saltar de uma passadeira para outra. */
  hop: { from: number; to: number; t: number } | null;
}

class ConveyorRun extends RowMinigame {
  protected readonly duration = 60;
  private readonly lanes: Lane[] = [];
  private readonly bombs: Bomb[] = [];
  private next = 1.2;
  private readonly outAt = new Map<string, number>();
  private readonly botCheck = new Map<string, number>();

  constructor(ctx: MinigameContext) {
    super(ctx, { spacing: 2.8 });
    for (const r of this.row) {
      r.model.root.position.z = 1.6;
      r.model.faceYaw(Math.PI, true);
      const belt = mesh(new THREE.BoxGeometry(1.6, 0.3, LEN), toon('#3a3150'), { receive: true });
      belt.position.set(r.x, 0.4, 1 - LEN / 2);
      const stripes: THREE.Mesh[] = [];
      for (let i = 0; i < 9; i++) {
        const st = mesh(new THREE.BoxGeometry(1.5, 0.02, 0.18), toon('#ffd23f'), { cast: false });
        st.position.set(r.x, 0.56, 1 - (i / 9) * LEN);
        this.scene.add(st);
        stripes.push(st);
      }
      for (const side of [-1, 1]) {
        const rail = mesh(new THREE.BoxGeometry(0.12, 0.5, LEN), toon('#9aa3ad'));
        rail.position.set(r.x + side * 0.86, 0.6, 1 - LEN / 2);
        this.scene.add(rail);
      }
      this.scene.add(belt);
      const lane: Lane = { r, dir: 1, belt, stripes, lives: LIVES, hearts: null, cool: 0 };
      this.lanes.push(lane);
      this.showHearts(lane);
    }
    // Calha lá em cima, onde as bombas mudam de passadeira.
    const n = this.lanes.length;
    const top = mesh(new THREE.BoxGeometry(n * 2.8 + 1.5, 0.5, 1.2), toon('#ff6b7a'));
    top.position.set(0, 0.9, 1 - LEN - 0.6);
    this.scene.add(top);
    this.camera.position.set(0, 9, 9.5);
    this.camera.lookAt(0, 0, -3);
  }

  private showHearts(l: Lane): void {
    if (l.hearts) {
      l.r.model.root.remove(l.hearts);
      disposeObject(l.hearts);
    }
    l.hearts = textSprite('❤️'.repeat(l.lives) + '🖤'.repeat(LIVES - l.lives), { height: 0.5 });
    l.hearts.position.y = 3.2;
    l.r.model.root.add(l.hearts);
  }

  private laneZ(s: number): number {
    return 1 - LEN + s;
  }

  scores(): MinigameScore[] {
    return this.lanes.map((l) => ({ id: l.r.seat.id, value: l.lives > 0 ? '❤️'.repeat(l.lives) : '💥 fora' }));
  }

  winners(): string[] {
    let alive = this.lanes.filter((l) => l.lives > 0);
    if (!alive.length) {
      const last = Math.max(...this.outAt.values());
      alive = this.lanes.filter((l) => (this.outAt.get(l.r.seat.id) ?? 0) >= last - 0.05);
    }
    return alive.length === this.lanes.length ? [] : alive.map((l) => l.r.seat.id);
  }

  private spawn(lane: number): void {
    const obj = new THREE.Group();
    const ball = mesh(new THREE.SphereGeometry(0.42, 16, 12), toon('#26232f'));
    const fuse = mesh(new THREE.SphereGeometry(0.1, 8, 6), toonUnique('#ffb020', { emissive: '#ff6a00', emissiveIntensity: 1.2 }), { cast: false });
    fuse.position.y = 0.5;
    obj.add(ball, fuse);
    obj.position.set(this.lanes[lane]!.r.x, 1, this.laneZ(0));
    this.scene.add(obj);
    this.bombs.push({ lane, s: 0, obj, fuse, hop: null });
  }

  private aliveLanes(except?: number): number[] {
    return this.lanes.map((l, i) => (l.lives > 0 && i !== except ? i : -1)).filter((i) => i >= 0);
  }

  protected step(dt: number): void {
    const pace = 1 + this.elapsed / 30;
    const speed = 2.2 * pace;
    // Bombas novas
    this.next -= dt;
    const alive = this.aliveLanes();
    if (this.next <= 0 && alive.length) {
      this.spawn(alive[Math.floor(this.ctx.rng.next() * alive.length)]!);
      this.next = Math.max(0.6, 2.2 - this.elapsed * 0.03) * (0.7 + this.ctx.rng.next() * 0.6);
    }
    // Inverter a passadeira
    for (let i = 0; i < this.lanes.length; i++) {
      const l = this.lanes[i]!;
      l.cool -= dt;
      if (l.lives <= 0) continue;
      let flip = false;
      if (this.isBot(l.r)) {
        const t = (this.botCheck.get(l.r.seat.id) ?? 0) - dt;
        this.botCheck.set(l.r.seat.id, t);
        if (t <= 0) {
          this.botCheck.set(l.r.seat.id, 0.25 + (1 - this.ctx.botSkill) * 0.4);
          const close = this.bombs.some((b) => !b.hop && b.lane === i && b.s > LEN - 3.2);
          const anyUp = this.bombs.some((b) => !b.hop && b.lane === i);
          if (l.dir === 1 && close) flip = true;
          else if (l.dir === -1 && !anyUp && this.ctx.rng.next() < 0.5) flip = true;
        }
      } else flip = this.pressed(l.r, 'a');
      if (flip && l.cool <= 0) {
        l.dir = l.dir === 1 ? -1 : 1;
        l.cool = 0.25;
        sound.play('click', { pitch: l.dir === 1 ? 0.8 : 1.2 });
        this.ctx.vibrate(l.r.seat.id, 20);
      }
      for (const st of l.stripes) {
        let z = st.position.z + l.dir * speed * dt;
        if (z > 1) z -= LEN;
        if (z < 1 - LEN) z += LEN;
        st.position.z = z;
      }
    }
    // Bombas a andar
    for (const b of [...this.bombs]) {
      const fl = Math.sin(this.elapsed * 20 + b.lane) > 0;
      (b.fuse.material as THREE.MeshToonMaterial).emissiveIntensity = fl ? 1.6 : 0.4;
      if (b.hop) {
        // Salta pela calha de cima para outra passadeira.
        b.hop.t += dt / 0.6;
        const k = Math.min(1, b.hop.t);
        const x = THREE.MathUtils.lerp(this.lanes[b.hop.from]!.r.x, this.lanes[b.hop.to]!.r.x, k);
        b.obj.position.set(x, 1.3 + Math.sin(k * Math.PI) * 1.4, this.laneZ(0) - 0.4);
        if (k >= 1) {
          b.lane = b.hop.to;
          b.hop = null;
          b.s = 0;
        }
        continue;
      }
      const l = this.lanes[b.lane]!;
      if (l.lives <= 0) {
        this.scene.remove(b.obj);
        disposeObject(b.obj);
        this.bombs.splice(this.bombs.indexOf(b), 1);
        continue;
      }
      b.s += l.dir * speed * dt;
      if (b.s < 0) {
        // Chegou lá acima: vai para a passadeira de outro.
        const others = this.aliveLanes(b.lane);
        if (!others.length) {
          b.s = 0;
          continue;
        }
        b.hop = { from: b.lane, to: others[Math.floor(this.ctx.rng.next() * others.length)]!, t: 0 };
        sound.play('whoosh', { vol: 0.3, pitch: 1.2 });
        continue;
      }
      b.obj.position.set(l.r.x, 1, this.laneZ(b.s));
      b.obj.rotation.x += l.dir * speed * dt * 2;
      if (b.s >= LEN) this.boom(b, l);
    }
    const left = this.lanes.filter((l) => l.lives > 0);
    if (left.length <= 1 && this.lanes.length > 1) this.endGame();
  }

  private boom(b: Bomb, l: Lane): void {
    this.scene.remove(b.obj);
    disposeObject(b.obj);
    this.bombs.splice(this.bombs.indexOf(b), 1);
    sound.play('firework');
    l.lives--;
    this.showHearts(l);
    this.float('💥', l.r.x, 2.4, '#ff8c1a', 1.1, 1.6);
    l.r.model.flash('#ff2a2a', 0.35);
    l.r.model.setAnim(l.lives > 0 ? 'hurt' : 'fall');
    this.ctx.vibrate(l.r.seat.id, 300);
    if (l.lives <= 0) {
      this.knockOut(l.r);
      this.outAt.set(l.r.seat.id, this.elapsed);
      l.r.model.setFaded(true);
    }
  }
}

export const ConveyorBombs: MinigameDef = {
  id: 'bombas-passadeira',
  rounds: 2,
  name: 'Bombas Sobe-Desce',
  modes: ['ffa'],
  description: () =>
    'As passadeiras trazem bombas na tua direção! Ⓐ inverte a tua: as bombas sobem e caem na passadeira de outro. Se uma chegar até ti, perdes uma vida (3). Ganha quem sobrar.',
  controls: 'Ⓐ Inverter a passadeira',
  stick: false,
  buttons: [{ id: 'a', label: 'Inverter' }],
  create: (ctx) => new ConveyorRun(ctx),
};
