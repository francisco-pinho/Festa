/**
 * "Chuva de Moedas": caem moedas do céu — apanha o máximo.
 * Cuidado com as bombas: atordoam e fazem perder moedas.
 * Modos: todos contra todos e equipas (soma da equipa).
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique, disposeObject, textSprite } from '../three/materials';
import { coinMaterials, glowTexture } from '../three/coinArt';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { rankBy } from './rank';

const ARENA_R = 12;
const GRAVITY = 18;

interface Falling {
  kind: 'coin' | 'big' | 'bomb';
  obj: THREE.Object3D;
  marker: THREE.Mesh;
  vy: number;
  landed: boolean;
  life: number;
}

class CoinShowerRun extends ArenaMinigame {
  protected readonly duration = 30;
  private readonly items: Falling[] = [];
  private readonly score = new Map<string, number>();
  private spawnTimer = 0;
  private readonly coinGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.12, 20);
  /** Moeda normal: dourada com uma estrela em relevo; borda serrilhada. */
  private readonly coinMat = coinMaterials(false);
  /** Moeda grande (vale 3): roxa com aro dourado e um «3». */
  private readonly bigMat = coinMaterials(true);
  private readonly glowTex = glowTexture();

  constructor(ctx: MinigameContext) {
    super(ctx);
    const ground = mesh(new THREE.CylinderGeometry(ARENA_R + 0.6, ARENA_R + 1.5, 2, 48), toon('#7ccf5b'), { cast: false, receive: true });
    ground.position.y = -1;
    const rim = mesh(new THREE.TorusGeometry(ARENA_R + 0.6, 0.35, 8, 64), toon('#f2d58b'));
    rim.rotation.x = Math.PI / 2;
    this.scene.add(ground, rim);
    this.spawnActors(5);
    for (const s of ctx.seats) this.score.set(s.id, 0);
  }

  scores(): MinigameScore[] {
    return this.ctx.seats.map((s) => ({ id: s.id, value: `🪙 ${this.score.get(s.id) ?? 0}` }));
  }

  override ranking(): string[][] {
    return rankBy(this.ctx.seats.map((s) => s.id), (id) => this.score.get(id) ?? 0);
  }

  winners(): string[] {
    if (this.ctx.mode === 'teams') {
      const sum = (team: 'blue' | 'red') =>
        this.ctx.seats.filter((s) => s.team === team).reduce((acc, s) => acc + (this.score.get(s.id) ?? 0), 0);
      const blue = sum('blue');
      const red = sum('red');
      if (blue === red) return [];
      const team = blue > red ? 'blue' : 'red';
      return this.ctx.seats.filter((s) => s.team === team).map((s) => s.id);
    }
    const max = Math.max(...this.score.values());
    if (max <= 0) return [];
    return [...this.score].filter(([, v]) => v === max).map(([id]) => id);
  }

  protected override constrain(a: Actor): void {
    const d = Math.hypot(a.pos.x, a.pos.z);
    if (d > ARENA_R - a.radius) a.pos.multiplyScalar((ARENA_R - a.radius) / d);
  }

  protected step(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.28 - Math.min(0.12, this.elapsed * 0.004);
      const r = this.ctx.rng.next();
      this.spawn(r < 0.12 ? 'bomb' : r < 0.2 ? 'big' : 'coin');
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      if (!it.landed) {
        it.vy -= GRAVITY * dt;
        it.obj.position.y += it.vy * dt;
        const h = it.obj.position.y;
        (it.marker.material as THREE.MeshBasicMaterial).opacity = Math.min(0.6, 0.15 + (14 - h) / 20);
        if (h <= 0.45) {
          it.obj.position.y = 0.45;
          it.landed = true;
          if (it.kind === 'bomb') {
            this.explode(it);
            this.removeItem(i);
            continue;
          }
          this.scene.remove(it.marker);
        }
      } else {
        it.life -= dt;
        if (it.life < 1.5) it.obj.visible = Math.floor(it.life * 8) % 2 === 0;
        if (it.life <= 0) {
          this.removeItem(i);
          continue;
        }
      }
      if (it.kind !== 'bomb') it.obj.rotation.y += dt * 4;

      if (it.kind !== 'bomb' && it.obj.position.y < 1.8) {
        const who = this.actors.find(
          (a) => a.stunned <= 0 && Math.hypot(a.pos.x - it.obj.position.x, a.pos.z - it.obj.position.z) < a.radius + 0.5,
        );
        if (who) {
          const value = it.kind === 'big' ? 3 : 1;
          this.score.set(who.seat.id, (this.score.get(who.seat.id) ?? 0) + value);
          sound.play('coin', { vol: 0.5, pitch: value > 1 ? 1.3 : 1 });
          if (value > 1) {
            sound.play('star', { vol: 0.4 });
            this.floatAt('+3', it.obj.position.x, it.obj.position.z);
          }
          this.ctx.vibrate(who.seat.id, 20);
          this.removeItem(i);
        }
      }
    }
  }

  private spawn(kind: Falling['kind']): void {
    const a = this.ctx.rng.next() * Math.PI * 2;
    const r = Math.sqrt(this.ctx.rng.next()) * (ARENA_R - 1);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    let obj: THREE.Object3D;
    if (kind === 'bomb') {
      const g = new THREE.Group();
      const ball = mesh(new THREE.SphereGeometry(0.55, 16, 12), toon('#2b2b38'));
      const fuse = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35), toon('#c9a26b'));
      fuse.position.y = 0.6;
      const spark = mesh(new THREE.SphereGeometry(0.12, 8, 6), toonUnique('#ffb020', { emissive: '#ff6a00', emissiveIntensity: 1 }));
      spark.position.y = 0.8;
      g.add(ball, fuse, spark);
      obj = g;
    } else {
      const big = kind === 'big';
      const coin = new THREE.Mesh(this.coinGeo, big ? this.bigMat : this.coinMat);
      coin.castShadow = true;
      coin.rotation.x = Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(coin);
      if (big) {
        holder.scale.setScalar(1.8);
        // Aura e um feixe de luz até ao chão: vê-se logo que é a especial.
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#d58cff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.setScalar(1.6);
        holder.add(glow);
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.4, 16, 12, 1, true),
          new THREE.MeshBasicMaterial({ color: '#e7b6ff', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        );
        beam.position.y = -8 / 1.8;
        beam.scale.setScalar(1 / 1.8);
        holder.add(beam);
      }
      obj = holder;
    }
    obj.position.set(x, 14 + this.ctx.rng.next() * 4, z);
    const marker = new THREE.Mesh(
      kind === 'big' ? new THREE.RingGeometry(0.75, 1.05, 32) : new THREE.CircleGeometry(kind === 'bomb' ? 2.2 : 0.6, 24),
      new THREE.MeshBasicMaterial({ color: kind === 'bomb' ? '#ff3b5c' : kind === 'big' ? '#ffd23f' : '#3a2a10', transparent: true, opacity: kind === 'big' ? 0.7 : 0.15, depthWrite: false }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(x, 0.03, z);
    this.scene.add(obj, marker);
    this.items.push({ kind, obj, marker, vy: 0, landed: false, life: 6 });
  }

  private explode(it: Falling): void {
    sound.play('punch', { pitch: 0.6 });
    const p = it.obj.position;
    for (const a of this.actors) {
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d > 2.2) continue;
      a.stunned = 1.3;
      const lost = Math.min(2, this.score.get(a.seat.id) ?? 0);
      this.score.set(a.seat.id, (this.score.get(a.seat.id) ?? 0) - lost);
      const push = new THREE.Vector3(a.pos.x - p.x, 0, a.pos.z - p.z).normalize().multiplyScalar(9);
      a.vel.copy(push);
      this.ctx.vibrate(a.seat.id, 200);
    }
    const boom = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.8 }),
    );
    boom.position.copy(p);
    this.scene.add(boom);
    void this.ctx.engine
      .tween(0.4, (t) => {
        boom.scale.setScalar(1 + t * 2.4);
        (boom.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
      })
      .then(() => {
        this.scene.remove(boom);
        disposeObject(boom);
      });
  }

  private readonly floaters: { s: THREE.Sprite; t: number }[] = [];

  /** «+3» a subir de onde se apanhou a moeda grande. */
  private floatAt(text: string, x: number, z: number): void {
    const s = textSprite(text, { height: 1, color: '#e7b6ff', stroke: '#2a0f45' });
    s.position.set(x, 2.6, z);
    this.scene.add(s);
    this.floaters.push({ s, t: 0 });
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]!;
      f.t += dt;
      f.s.position.y += dt * 1.6;
      (f.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - f.t);
      if (f.t >= 1) {
        this.scene.remove(f.s);
        disposeObject(f.s);
        this.floaters.splice(i, 1);
      }
    }
  }

  private removeItem(i: number): void {
    const it = this.items[i]!;
    this.scene.remove(it.obj, it.marker);
    it.marker.geometry.dispose();
    (it.marker.material as THREE.Material).dispose();
    this.items.splice(i, 1);
  }

  protected think(a: Actor): void {
    const pad = this.ctx.botPad(a.seat.id);
    // Foge de bombas prestes a cair.
    const danger = this.items.find(
      (it) => it.kind === 'bomb' && it.obj.position.y < 9 && Math.hypot(it.obj.position.x - a.pos.x, it.obj.position.z - a.pos.z) < 2.8,
    );
    if (danger) {
      this.steer(a, a.pos.x * 2 - danger.obj.position.x, a.pos.z * 2 - danger.obj.position.z);
      return;
    }
    let best: Falling | null = null;
    let bestScore = Infinity;
    for (const it of this.items) {
      if (it.kind === 'bomb') continue;
      const d = Math.hypot(it.obj.position.x - a.pos.x, it.obj.position.z - a.pos.z);
      const timeToLand = it.landed ? 0 : Math.max(0, it.obj.position.y / 10);
      const score = d / a.speed - timeToLand * 0.3 - (it.kind === 'big' ? 1 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best) {
      this.steer(a, best.obj.position.x, best.obj.position.z);
      const d = Math.hypot(best.obj.position.x - a.pos.x, best.obj.position.z - a.pos.z);
      if (d > 5 && this.ctx.rng.next() < 0.02) pad.press('a');
    } else {
      this.steer(a, 0, 0, 0.4);
    }
  }

  override dispose(): void {
    this.coinGeo.dispose();
    for (const m of [...this.coinMat, ...this.bigMat]) m.dispose();
    this.glowTex.dispose();
    super.dispose();
  }
}

export const CoinShower: MinigameDef = {
  id: 'coin-shower',
  rounds: 2,
  name: 'Chuva de Moedas',
  modes: ['ffa', 'teams'],
  description: (mode) =>
    mode === 'teams'
      ? 'Apanhem as moedas que caem do céu! Ganha a equipa com mais moedas. Fujam das bombas!'
      : 'Apanha as moedas que caem do céu! Quem tiver mais ganha. Foge das bombas!',
  controls: '🕹️ Mover  ·  Ⓐ Dash',
  stick: true,
  buttons: [{ id: 'a', label: 'Dash' }],
  create: (ctx) => new CoinShowerRun(ctx),
};
