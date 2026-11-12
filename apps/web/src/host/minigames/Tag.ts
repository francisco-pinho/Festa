/**
 * "Apanha-Apanha" (1 contra todos): o solitário tem de apanhar toda a gente
 * antes do tempo acabar. Se sobrar alguém, ganha a equipa dos que fogem.
 *
 * Obstáculos que atrapalham toda a gente (caçador incluído):
 *  - minas que vão aparecendo: piscam enquanto armam; quem lhes toca é projetado e fica tonto;
 *  - lama (anda-se a metade da velocidade) e gelo (escorrega, custa a travar e a virar);
 *  - uma barra giratória presa ao pilar do meio (a partir da 2.ª ronda).
 * Cada ronda o mapa muda e fica mais difícil: mais minas e mais depressa, barra mais rápida e,
 * na 3.ª ronda, as paredes vão-se fechando.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { themeScenery } from './scenery';
import { explode } from '../three/explosion';

interface Pillar {
  x: number;
  z: number;
  r: number;
}
interface Patch {
  x: number;
  z: number;
  r: number;
  kind: 'mud' | 'ice';
}
interface Mine {
  x: number;
  z: number;
  /** Tempo desde que apareceu (arma ao fim de ARM segundos). */
  t: number;
  group: THREE.Group;
  light: THREE.Mesh;
}
interface Blast {
  mesh: THREE.Mesh;
  t: number;
}

/** Como fica a arena em cada ronda. */
interface Layout {
  floor: string;
  pillars: Pillar[];
  patches: Patch[];
  /** Segundos entre minas e máximo de minas ao mesmo tempo. */
  mineEvery: number;
  maxMines: number;
  /** Velocidade da barra giratória (rad/s); 0 = sem barra. */
  sweeper: number;
  /** Até onde as paredes se fecham no fim da ronda (meia largura). */
  shrinkTo: number;
}

const HALF = 12;
const ARM = 1.2;
const MINE_TOUCH = 0.95;
const BLAST_R = 3;
const BAR_LEN = 7.5;

const LAYOUTS: Layout[] = [
  {
    floor: '#7ccf5b',
    pillars: [
      { x: -5, z: -4, r: 1.4 },
      { x: 5, z: -4, r: 1.4 },
      { x: -5, z: 5, r: 1.4 },
      { x: 5, z: 5, r: 1.4 },
      { x: 0, z: 0.5, r: 1.8 },
    ],
    patches: [
      { x: -8.5, z: 0.5, r: 2.4, kind: 'mud' },
      { x: 8.5, z: 1, r: 2.2, kind: 'mud' },
    ],
    mineEvery: 4.5,
    maxMines: 4,
    sweeper: 0,
    shrinkTo: HALF,
  },
  {
    floor: '#e3eef5',
    pillars: [
      { x: 0, z: 0, r: 1.5 },
      { x: -8, z: -6.5, r: 1.2 },
      { x: 8, z: -6.5, r: 1.2 },
      { x: -8, z: 7, r: 1.2 },
      { x: 8, z: 7, r: 1.2 },
    ],
    patches: [
      { x: -4.5, z: 9, r: 3, kind: 'ice' },
      { x: 5, z: -9, r: 3, kind: 'ice' },
      { x: 9.5, z: 0.5, r: 2, kind: 'mud' },
    ],
    mineEvery: 3,
    maxMines: 6,
    sweeper: 0.9,
    shrinkTo: HALF,
  },
  {
    floor: '#d9b77a',
    pillars: [
      { x: 0, z: 0, r: 1.5 },
      { x: -6, z: -5.5, r: 1.1 },
      { x: 6, z: 5.5, r: 1.1 },
    ],
    patches: [
      { x: 5.5, z: -5, r: 2.6, kind: 'ice' },
      { x: -5.5, z: 5, r: 2.6, kind: 'ice' },
      { x: -8.5, z: -1, r: 2, kind: 'mud' },
      { x: 8.5, z: 1, r: 2, kind: 'mud' },
    ],
    mineEvery: 2,
    maxMines: 8,
    sweeper: 1.35,
    shrinkTo: 8.5,
  },
];

class TagRun extends ArenaMinigame {
  protected readonly duration = 25;
  private readonly caught = new Set<string>();
  private readonly layout: Layout;
  private readonly roundNo: number;
  private half = HALF;
  private readonly walls: { mesh: THREE.Mesh; axis: 'x' | 'z'; side: number }[] = [];
  private readonly mines: Mine[] = [];
  private readonly blasts: Blast[] = [];
  private mineTimer = 2;
  private sweeper: THREE.Group | null = null;
  private barAngle = 0;
  private readonly barHit = new Map<string, number>();

  constructor(ctx: MinigameContext) {
    super(ctx);
    this.roundNo = Math.min(LAYOUTS.length, Math.max(1, ctx.round ?? 1));
    this.layout = LAYOUTS[this.roundNo - 1]!;
    this.dashCooldownTime = 1.6;
    const floor = mesh(new THREE.BoxGeometry(HALF * 2 + 2, 1, HALF * 2 + 2), toon(this.layout.floor), { cast: false, receive: true });
    floor.position.y = -0.5;
    this.scene.add(floor);
    for (const side of [-1, 1]) {
      for (const axis of ['x', 'z'] as const) {
        const wall = mesh(new THREE.BoxGeometry(axis === 'x' ? 0.6 : HALF * 2 + 2, 1, axis === 'x' ? HALF * 2 + 2 : 0.6), toonUnique('#c98b4f'));
        wall.position.set(axis === 'x' ? side * (HALF + 0.3) : 0, 0.5, axis === 'z' ? side * (HALF + 0.3) : 0);
        this.scene.add(wall);
        this.walls.push({ mesh: wall, axis, side });
      }
    }
    for (const p of this.layout.pillars) {
      const pillar = mesh(new THREE.CylinderGeometry(p.r, p.r * 1.1, 2.4, 20), toon('#9aa3ad'));
      pillar.position.set(p.x, 1.2, p.z);
      this.scene.add(pillar);
    }
    // Lama e gelo no chão
    for (const p of this.layout.patches) {
      const m = mesh(
        new THREE.CylinderGeometry(p.r, p.r, 0.05, 32),
        p.kind === 'mud' ? toonUnique('#6b4a2b') : toonUnique('#bfe9ff', { emissive: '#bfe9ff', emissiveIntensity: 0.15 }),
        { cast: false, receive: true },
      );
      m.position.set(p.x, 0.03, p.z);
      m.scale.set(1, 1, 0.85 + ((p.x * 7 + p.z) % 3) * 0.05);
      this.scene.add(m);
    }
    // Barra giratória presa ao pilar do meio
    if (this.layout.sweeper > 0) {
      const g = new THREE.Group();
      g.position.set(0, 0, 0);
      const bar = mesh(new THREE.BoxGeometry(BAR_LEN, 0.5, 0.5), toonUnique('#ff5a1f', { emissive: '#ff5a1f', emissiveIntensity: 0.2 }));
      bar.position.set(BAR_LEN / 2 + 0.6, 0.6, 0);
      // Riscas de aviso
      for (let i = 0; i < 5; i++) {
        const stripe = mesh(new THREE.BoxGeometry(0.4, 0.52, 0.52), toon('#1d1433'), { cast: false });
        stripe.position.set(1.4 + i * 1.4, 0.6, 0);
        g.add(stripe);
      }
      g.add(bar);
      this.scene.add(g);
      this.sweeper = g;
    }

    // Cenário com o tema do mapa à volta (com chão por baixo).

    themeScenery(this.scene, ctx.rng, ctx.theme, HALF * 1.45, { water: false });

    this.spawnActors(9, (seat) => (seat.team === 'blue' ? { speed: 8.6, radius: 0.7 } : { speed: 7.4 }));
    const chaser = this.actors.find((a) => a.seat.team === 'blue');
    if (chaser) {
      chaser.pos.set(0, 0, -9);
      chaser.model.root.scale.setScalar(1.3);
      // Quem foge começa do lado oposto, espalhado (nunca em cima do caçador).
      const runners = this.actors.filter((a) => a !== chaser);
      runners.forEach((r, i) => {
        const k = runners.length === 1 ? 0.5 : i / (runners.length - 1);
        r.pos.set(-9 + k * 18, 0, 8 - (i % 2) * 2.5);
      });
    }
    this.camera.position.set(0, 26, 19);
    this.camera.lookAt(0, 0, 1);
  }

  private get chaser(): Actor | undefined {
    return this.actors.find((a) => a.seat.team === 'blue');
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => ({
      id: a.seat.id,
      value: a.seat.team === 'blue' ? '🏃 caçador' : this.caught.has(a.seat.id) ? '😵 apanhado' : '✅ livre',
    }));
  }

  winners(): string[] {
    const runners = this.actors.filter((a) => a.seat.team === 'red');
    const allCaught = runners.every((r) => this.caught.has(r.seat.id));
    return allCaught ? (this.chaser ? [this.chaser.seat.id] : []) : runners.map((r) => r.seat.id);
  }

  private patchAt(x: number, z: number): Patch | undefined {
    return this.layout.patches.find((p) => Math.hypot(x - p.x, z - p.z) < p.r);
  }

  /** Lama: mais devagar. Gelo: escorrega (pouca aderência). */
  protected override move(a: Actor, dt: number): void {
    const patch = this.patchAt(a.pos.x, a.pos.z);
    const speed = a.speed;
    const grip = this.grip;
    if (patch?.kind === 'mud') a.speed = speed * 0.5;
    if (patch?.kind === 'ice') this.grip = 1.3;
    super.move(a, dt);
    a.speed = speed;
    this.grip = grip;
  }

  protected override constrain(a: Actor): void {
    const h = this.half;
    a.pos.x = Math.max(-h + a.radius, Math.min(h - a.radius, a.pos.x));
    a.pos.z = Math.max(-h + a.radius, Math.min(h - a.radius, a.pos.z));
    for (const p of this.layout.pillars) {
      const dx = a.pos.x - p.x;
      const dz = a.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      const min = p.r + a.radius;
      if (d < min && d > 0) {
        a.pos.x = p.x + (dx / d) * min;
        a.pos.z = p.z + (dz / d) * min;
      }
    }
  }

  // ── Minas ──────────────────────────────────────────────

  private spawnMine(): void {
    for (let tries = 0; tries < 20; tries++) {
      const h = this.half - 1.2;
      const x = (this.ctx.rng.next() * 2 - 1) * h;
      const z = (this.ctx.rng.next() * 2 - 1) * h;
      if (this.actors.some((a) => a.alive && Math.hypot(a.pos.x - x, a.pos.z - z) < 2.6)) continue;
      if (this.layout.pillars.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 1)) continue;
      if (this.mines.some((m) => Math.hypot(m.x - x, m.z - z) < 2)) continue;
      const group = new THREE.Group();
      const base = mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.22, 16), toonUnique('#3a3f47'));
      base.position.y = 0.11;
      const light = mesh(new THREE.SphereGeometry(0.16, 12, 8), toonUnique('#ff2a2a', { emissive: '#ff2a2a', emissiveIntensity: 0.4 }), { cast: false });
      light.position.y = 0.26;
      group.add(base, light);
      group.position.set(x, 0, z);
      group.scale.setScalar(0.01);
      this.scene.add(group);
      this.mines.push({ x, z, t: 0, group, light });
      sound.play('tick', { vol: 0.4 });
      return;
    }
  }

  private explode(mine: Mine): void {
    this.scene.remove(mine.group);
    this.mines.splice(this.mines.indexOf(mine), 1);
    explode(this.scene, new THREE.Vector3(mine.x, 0.4, mine.z), 1);
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 12),
      new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85, depthWrite: false }),
    );
    flash.position.set(mine.x, 0.4, mine.z);
    this.scene.add(flash);
    this.blasts.push({ mesh: flash, t: 0 });
    for (const a of this.actors) {
      if (!a.alive) continue;
      const dx = a.pos.x - mine.x;
      const dz = a.pos.z - mine.z;
      const d = Math.hypot(dx, dz);
      if (d > BLAST_R) continue;
      const k = 1 - d / BLAST_R;
      const nx = d > 0.01 ? dx / d : 1;
      const nz = d > 0.01 ? dz / d : 0;
      a.vel.x += nx * (8 + 10 * k);
      a.vel.z += nz * (8 + 10 * k);
      a.stunned = Math.max(a.stunned, 0.6 + 0.7 * k);
      this.ctx.vibrate(a.seat.id, 220);
    }
  }

  private updateMines(dt: number): void {
    this.mineTimer -= dt;
    if (this.mineTimer <= 0 && this.mines.length < this.layout.maxMines) {
      this.mineTimer = this.layout.mineEvery * (0.75 + this.ctx.rng.next() * 0.5);
      this.spawnMine();
    }
    for (const m of [...this.mines]) {
      m.t += dt;
      if (m.t < ARM) continue;
      const hit = this.actors.find((a) => a.alive && Math.hypot(a.pos.x - m.x, a.pos.z - m.z) < MINE_TOUCH + a.radius * 0.5);
      if (hit) this.explode(m);
    }
  }

  // ── Barra giratória ────────────────────────────────────

  private updateSweeper(dt: number): void {
    if (!this.sweeper) return;
    this.barAngle += this.layout.sweeper * dt;
    this.sweeper.rotation.y = -this.barAngle;
    const dx = Math.cos(this.barAngle);
    const dz = Math.sin(this.barAngle);
    for (const a of this.actors) {
      if (!a.alive) continue;
      const cool = (this.barHit.get(a.seat.id) ?? 0) - dt;
      this.barHit.set(a.seat.id, cool);
      if (cool > 0) continue;
      const t = a.pos.x * dx + a.pos.z * dz;
      const perp = a.pos.x * -dz + a.pos.z * dx;
      if (t < 0.6 || t > BAR_LEN + 0.6 || Math.abs(perp) > 0.3 + a.radius) continue;
      // Empurra no sentido em que a barra roda, mais forte na ponta.
      const push = 5 + this.layout.sweeper * t * 2.2;
      a.vel.x += -dz * push;
      a.vel.z += dx * push;
      a.pos.x += -dz * (0.35 + a.radius - perp) * 0.5;
      a.pos.z += dx * (0.35 + a.radius - perp) * 0.5;
      a.stunned = Math.max(a.stunned, 0.7);
      this.barHit.set(a.seat.id, 0.9);
      sound.play('hit');
      this.ctx.vibrate(a.seat.id, 160);
    }
  }

  protected step(dt: number): void {
    const chaser = this.chaser;
    if (!chaser) return this.endGame();
    // Na última ronda as paredes vão-se fechando até ao fim.
    if (this.layout.shrinkTo < HALF) {
      this.half = HALF - (HALF - this.layout.shrinkTo) * Math.min(1, this.elapsed / this.duration);
      for (const w of this.walls) {
        if (w.axis === 'x') w.mesh.position.x = w.side * (this.half + 0.3);
        else w.mesh.position.z = w.side * (this.half + 0.3);
      }
    }
    this.updateMines(dt);
    this.updateSweeper(dt);
    // Segundo e meio de tolerância no arranque.
    if (this.elapsed < 1.5) return;
    for (const r of this.actors) {
      if (r === chaser || !r.alive) continue;
      if (Math.hypot(r.pos.x - chaser.pos.x, r.pos.z - chaser.pos.z) < r.radius + chaser.radius + 0.1) {
        r.alive = false;
        r.vel.set(0, 0, 0);
        this.caught.add(r.seat.id);
        r.model.setAnim('sad');
        r.model.setFaded(true);
        this.ctx.vibrate(r.seat.id, 250);
        this.ctx.vibrate(chaser.seat.id, 60);
      }
    }
    if (this.actors.every((a) => a === chaser || !a.alive)) this.endGame();
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    // Minas a aparecer e a piscar (devagar a armar, depressa quando armadas).
    for (const m of this.mines) {
      m.group.scale.setScalar(Math.min(1, m.group.scale.x + dt * 5));
      const armed = m.t >= ARM;
      const on = Math.sin(time * (armed ? 18 : 6)) > 0;
      const mat = m.light.material as THREE.MeshToonMaterial;
      mat.emissiveIntensity = on ? (armed ? 2.2 : 1) : 0.15;
    }
    for (const b of [...this.blasts]) {
      b.t += dt;
      const k = b.t / 0.45;
      b.mesh.scale.setScalar(0.5 + k * BLAST_R);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - k));
      if (k >= 1) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        this.blasts.splice(this.blasts.indexOf(b), 1);
      }
    }
  }

  /** Bots: fogem das minas armadas e da barra giratória (somam um empurrão ao stick). */
  private avoidHazards(a: Actor): void {
    const pad = this.ctx.botPad(a.seat.id);
    let fx = pad.stick.x;
    let fz = pad.stick.y;
    for (const m of this.mines) {
      const dx = a.pos.x - m.x;
      const dz = a.pos.z - m.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.4 && d > 0.01) {
        fx += (dx / d) * (2.4 - d) * 1.4;
        fz += (dz / d) * (2.4 - d) * 1.4;
      }
    }
    if (this.sweeper) {
      // A barra vem aí: afasta-se para o lado de onde ela já passou.
      const ahead = this.barAngle + 0.5;
      const dx = Math.cos(ahead);
      const dz = Math.sin(ahead);
      const t = a.pos.x * dx + a.pos.z * dz;
      const perp = a.pos.x * -dz + a.pos.z * dx;
      if (t > 0 && t < BAR_LEN + 1 && Math.abs(perp) < 2) {
        fx += dz * 1.2;
        fz += -dx * 1.2;
      }
    }
    const len = Math.hypot(fx, fz);
    if (len > 1) {
      fx /= len;
      fz /= len;
    }
    pad.stick.x = fx;
    pad.stick.y = fz;
  }

  protected think(a: Actor): void {
    const pad = this.ctx.botPad(a.seat.id);
    const chaser = this.chaser!;
    if (a === chaser) {
      const prey = this.actors.filter((o) => o !== a && o.alive);
      if (!prey.length) return;
      const t = prey.reduce((best, o) =>
        Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < Math.hypot(best.pos.x - a.pos.x, best.pos.z - a.pos.z) ? o : best,
      );
      const lead = 0.25;
      this.steer(a, t.pos.x + t.vel.x * lead, t.pos.z + t.vel.z * lead);
      // Presa tonta (mina, barra): é a altura de dar o sprint.
      const close = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
      if ((close < 3.2 && this.ctx.rng.next() < 0.1) || (t.stunned > 0 && close < 5)) pad.press('a');
      this.avoidHazards(a);
      return;
    }
    // Fugir: afastar do caçador, das paredes e dos pilares.
    const h = this.half;
    let fx = a.pos.x - chaser.pos.x;
    let fz = a.pos.z - chaser.pos.z;
    const d = Math.hypot(fx, fz) || 1;
    fx = (fx / d) * (12 / d);
    fz = (fz / d) * (12 / d);
    fx += 1 / Math.max(0.5, h - a.pos.x) ** 1.5 * -4 + 1 / Math.max(0.5, h + a.pos.x) ** 1.5 * 4;
    fz += 1 / Math.max(0.5, h - a.pos.z) ** 1.5 * -4 + 1 / Math.max(0.5, h + a.pos.z) ** 1.5 * 4;
    for (const p of this.layout.pillars) {
      const px = a.pos.x - p.x;
      const pz = a.pos.z - p.z;
      const pd = Math.hypot(px, pz) - p.r;
      if (pd < 2) {
        fx += (px / (pd + p.r)) * 1.5;
        fz += (pz / (pd + p.r)) * 1.5;
      }
    }
    const len = Math.hypot(fx, fz) || 1;
    const calm = d > 9 ? 0.5 : 1;
    pad.stick.x = (fx / len) * calm;
    pad.stick.y = (fz / len) * calm;
    if (d < 2.5 && this.ctx.rng.next() < 0.08) pad.press('a');
    this.avoidHazards(a);
  }
}

export const Tag: MinigameDef = {
  id: 'tag',
  rounds: 3,
  name: 'Apanha-Apanha',
  modes: ['oneVsAll'],
  description: () =>
    'O caçador tem 25 segundos para apanhar toda a gente. Cuidado com as minas, a lama, o gelo e a barra que gira! Cada ronda o mapa fica mais difícil.',
  controls: '🕹️ Mover  ·  Ⓐ Sprint',
  stick: true,
  buttons: [{ id: 'a', label: 'Sprint' }],
  create: (ctx: MinigameContext) => new TagRun(ctx),
};
