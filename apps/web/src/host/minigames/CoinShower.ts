/**
 * "Chuva de Moedas": caem moedas do céu — apanha o máximo.
 * Cuidado com as bombas: atordoam e fazem perder moedas (Ⓑ salta por cima da explosão).
 * Na 2.ª ronda a ilha vai inclinando ao acaso: escorrega-se e as moedas no chão rolam.
 * Modos: todos contra todos e equipas (soma da equipa).
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique, disposeObject, textSprite } from '../three/materials';
import { coinMaterials, glowTexture } from '../three/coinArt';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { rankBy } from './rank';
import { themeGround, themeScenery } from './scenery';
import { explode } from '../three/explosion';
import { damp } from '../three/tweens';

const ARENA_R = 12;
const GRAVITY = 18;
/** Salto: duração e altura (acima de SAFE_H a explosão passa por baixo). */
const JUMP_T = 0.7;
const JUMP_H = 1.7;
const SAFE_H = 0.5;
/** Inclinação máxima da ilha na 2.ª ronda (rad) e quanto se escorrega. */
const TILT_MAX = 0.13;
const SLIDE = 26;

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
  /** A ilha (chão, aro e marcas no chão): inclina-se na 2.ª ronda. */
  private readonly platform = new THREE.Group();
  private readonly tilting: boolean;
  private readonly tilt = { x: 0, z: 0, tx: 0, tz: 0, timer: 2.5, announced: false };
  /** Tempo de salto que falta a cada um. */
  private readonly air = new Map<Actor, number>();
  /** Número de moedas por cima da cabeça de cada um. */
  private readonly labels = new Map<string, { s: THREE.Sprite; v: number; pop: number; w: number }>();
  /** Contagem final (5, 4, 3, 2, 1). */
  private lastCount = 6;

  constructor(ctx: MinigameContext) {
    super(ctx);
    const ground = mesh(new THREE.CylinderGeometry(ARENA_R + 0.6, ARENA_R + 1.5, 2, 48), toon(themeGround(ctx.theme)), { cast: false, receive: true });
    ground.position.y = -1;
    const rimColor = ctx.theme === 'volcano' ? '#3a2a26' : ctx.theme === 'city' || ctx.theme === 'castle' ? '#8a8478' : '#f2d58b';
    const rim = mesh(new THREE.TorusGeometry(ARENA_R + 0.6, 0.35, 8, 64), toon(rimColor));
    rim.rotation.x = Math.PI / 2;
    this.platform.add(ground, rim);
    this.scene.add(this.platform);
    // Cenário com o tema do mapa à volta (com chão por baixo): mais adereços; os altos ficam longe da câmara.
    themeScenery(this.scene, ctx.rng, ctx.theme, ARENA_R + 1, { water: true, count: 38 });
    this.tilting = (ctx.round ?? 1) >= 2;
    this.spawnActors(5);
    for (const s of ctx.seats) this.score.set(s.id, 0);
    for (const a of this.actors) this.air.set(a, 0);
  }

  /** Altura do chão da ilha num ponto (com a inclinação). */
  private surfaceY(x: number, z: number): number {
    return x * Math.tan(this.tilt.z) - z * Math.tan(this.tilt.x);
  }

  private addScore(id: string, delta: number): void {
    this.score.set(id, (this.score.get(id) ?? 0) + delta);
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
      // Começa calmo (uma moeda a cada ~0,6 s) e vai aumentando até ao fim.
      this.spawnTimer = Math.max(0.24, 0.6 - this.elapsed * 0.012);
      const r = this.ctx.rng.next();
      this.spawn(r < 0.12 ? 'bomb' : r < 0.2 ? 'big' : 'coin');
    }
    if (this.tilting) this.updateTilt(dt);
    const slideX = -Math.tan(this.tilt.z) * SLIDE;
    const slideZ = Math.tan(this.tilt.x) * SLIDE;

    // Saltos e personagens em cima do chão (inclinado).
    for (const a of this.actors) {
      const pressed = this.ctx.pad(a.seat.id).consumePress('b');
      if (pressed && a.stunned <= 0 && (this.air.get(a) ?? 0) <= 0) {
        this.air.set(a, JUMP_T);
        sound.play('whoosh', { vol: 0.3, pitch: 1.3 });
      }
      const t = Math.max(0, (this.air.get(a) ?? 0) - dt);
      this.air.set(a, t);
      if (this.tilting && t <= 0) {
        a.pos.x += slideX * dt;
        a.pos.z += slideZ * dt;
        this.constrain(a);
      }
      a.pos.y = this.surfaceY(a.pos.x, a.pos.z) + (t > 0 ? Math.sin((1 - t / JUMP_T) * Math.PI) * JUMP_H : 0);
      if (t > 0) a.model.setAnim('jump');
    }

    // Contagem dos últimos 5 segundos.
    const left = Math.ceil(this.duration - this.elapsed);
    if (left <= 5 && left >= 1 && left < this.lastCount) {
      this.lastCount = left;
      sound.play('countdown', { pitch: 1 + (5 - left) * 0.1 });
      this.popText(String(left), { height: 4.2, color: left <= 3 ? '#ff5a5a' : '#ffd23f', life: 0.9 });
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      if (!it.landed) {
        it.vy -= GRAVITY * dt;
        it.obj.position.y += it.vy * dt;
        const h = it.obj.position.y;
        const floor = this.surfaceY(it.obj.position.x, it.obj.position.z) + 0.45;
        (it.marker.material as THREE.MeshBasicMaterial).opacity = Math.min(0.6, 0.15 + (14 - h) / 20);
        if (h <= floor) {
          it.obj.position.y = floor;
          it.landed = true;
          if (it.kind === 'bomb') {
            this.explode(it);
            this.removeItem(i);
            continue;
          }
          it.marker.removeFromParent();
        }
      } else {
        if (this.tilting) {
          // As moedas no chão rolam pela inclinação; se saírem da ilha, perdem-se.
          it.obj.position.x += slideX * 1.3 * dt;
          it.obj.position.z += slideZ * 1.3 * dt;
          if (Math.hypot(it.obj.position.x, it.obj.position.z) > ARENA_R) {
            this.removeItem(i);
            continue;
          }
        }
        it.obj.position.y = this.surfaceY(it.obj.position.x, it.obj.position.z) + 0.45;
        it.life -= dt;
        if (it.life < 1.5) it.obj.visible = Math.floor(it.life * 8) % 2 === 0;
        if (it.life <= 0) {
          this.removeItem(i);
          continue;
        }
      }
      if (it.kind !== 'bomb') it.obj.rotation.y += dt * 4;

      if (it.kind !== 'bomb') {
        const y = it.obj.position.y;
        const who = this.actors.find(
          (a) =>
            a.stunned <= 0 &&
            y < a.pos.y + 1.8 &&
            y > a.pos.y - 0.6 &&
            Math.hypot(a.pos.x - it.obj.position.x, a.pos.z - it.obj.position.z) < a.radius + 0.5,
        );
        if (who) {
          const value = it.kind === 'big' ? 3 : 1;
          this.addScore(who.seat.id, value);
          if (value > 1) {
            // Moeda especial: arpejo a subir (soa a prémio).
            sound.play('coinBig', { vol: 0.9 });
            this.floatAt('+3', it.obj.position.x, it.obj.position.z);
          } else sound.play('coin', { vol: 0.5 });
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
    // A marca vai na ilha: inclina-se com ela.
    this.platform.add(marker);
    this.scene.add(obj);
    this.items.push({ kind, obj, marker, vy: 0, landed: false, life: 6 });
  }

  private explode(it: Falling): void {
    const p = it.obj.position;
    explode(this.scene, new THREE.Vector3(p.x, p.y + 0.05, p.z), 1.2);
    for (const a of this.actors) {
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d > 2.2) continue;
      // Quem está no ar (a saltar) safa-se.
      if (a.pos.y - this.surfaceY(a.pos.x, a.pos.z) > SAFE_H) continue;
      a.stunned = 1.3;
      const lost = Math.min(2, this.score.get(a.seat.id) ?? 0);
      this.addScore(a.seat.id, -lost);
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
  private readonly pops: { s: THREE.Sprite; t: number; life: number; h: number; w: number }[] = [];

  /** Texto grande a meio da ilha que aparece com «pop» e desaparece (contagem, avisos). */
  private popText(text: string, opts: { height: number; color: string; life: number }): void {
    const s = textSprite(text, { height: opts.height, color: opts.color, stroke: '#1b1033' });
    s.position.set(0, 7, 3);
    s.renderOrder = 20;
    this.scene.add(s);
    this.pops.push({ s, t: 0, life: opts.life, h: opts.height, w: s.scale.x });
  }

  /** 2.ª ronda: a ilha vai mudando de inclinação ao acaso. */
  private updateTilt(dt: number): void {
    const tl = this.tilt;
    tl.timer -= dt;
    if (tl.timer <= 0) {
      tl.timer = 3 + this.ctx.rng.next() * 2;
      const a = this.ctx.rng.next() * Math.PI * 2;
      const m = TILT_MAX * (0.6 + this.ctx.rng.next() * 0.4);
      tl.tx = Math.cos(a) * m;
      tl.tz = Math.sin(a) * m;
      sound.play('roll', { vol: 0.8 });
      if (!tl.announced) {
        tl.announced = true;
        this.popText('A ilha está a inclinar!', { height: 1.6, color: '#ffd23f', life: 2.2 });
      }
    }
    const k = damp(1.1, dt);
    tl.x += (tl.tx - tl.x) * k;
    tl.z += (tl.tz - tl.z) * k;
    this.platform.rotation.set(tl.x, 0, tl.z);
  }

  /** Número de moedas por cima da cabeça de cada um (só se refaz quando muda, com um «pop»). */
  private updateLabels(dt: number): void {
    for (const a of this.actors) {
      const v = this.score.get(a.seat.id) ?? 0;
      let l = this.labels.get(a.seat.id);
      if (!l || l.v !== v) {
        if (l) {
          this.scene.remove(l.s);
          l.s.material.map?.dispose();
          l.s.material.dispose();
        }
        const s = textSprite(`🪙${v}`, { height: 0.7, color: '#ffe066', stroke: '#3a2a10' });
        this.scene.add(s);
        l = { s, v, pop: l ? 0.25 : 0, w: s.scale.x };
        this.labels.set(a.seat.id, l);
      }
      l.pop = Math.max(0, l.pop - dt);
      const k = 1 + l.pop * 1.6;
      l.s.scale.set(l.w * k, 0.7 * k, 1);
      l.s.position.set(a.pos.x, a.pos.y + 2.75, a.pos.z);
    }
  }

  /** «+3» a subir de onde se apanhou a moeda grande. */
  private floatAt(text: string, x: number, z: number): void {
    const s = textSprite(text, { height: 1, color: '#e7b6ff', stroke: '#2a0f45' });
    s.position.set(x, 2.6, z);
    this.scene.add(s);
    this.floaters.push({ s, t: 0 });
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    this.updateLabels(dt);
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]!;
      p.t += dt;
      const k = 1 + 0.5 * Math.max(0, 1 - p.t * 6);
      p.s.scale.set(p.w * k, p.h * k, 1);
      p.s.material.opacity = Math.min(1, Math.max(0, (p.life - p.t) / 0.3));
      if (p.t >= p.life) {
        this.scene.remove(p.s);
        p.s.material.map?.dispose();
        p.s.material.dispose();
        this.pops.splice(i, 1);
      }
    }
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
    this.scene.remove(it.obj);
    it.marker.removeFromParent();
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
      // Se já está mesmo a cair em cima: salta.
      const dp = danger.obj.position;
      const h = dp.y - this.surfaceY(dp.x, dp.z);
      if (h < 3.5 && Math.hypot(dp.x - a.pos.x, dp.z - a.pos.z) < 2.4 && this.ctx.rng.next() < 0.2 + this.ctx.botSkill * 0.6) pad.press('b');
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
    for (const l of this.labels.values()) {
      l.s.material.map?.dispose();
      l.s.material.dispose();
    }
    this.labels.clear();
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
      ? 'Apanhem as moedas que caem do céu! Ganha a equipa com mais moedas. Fujam das bombas ou saltem por cima da explosão! Na segunda ronda a ilha inclina.'
      : 'Apanha as moedas que caem do céu! Quem tiver mais ganha. Foge das bombas ou salta por cima da explosão! Na segunda ronda a ilha inclina.',
  controls: '🕹️ Mover  ·  Ⓐ Dash  ·  Ⓑ Saltar',
  stick: true,
  buttons: [
    { id: 'a', label: 'Dash' },
    { id: 'b', label: 'Saltar' },
  ],
  create: (ctx) => new CoinShowerRun(ctx),
};
