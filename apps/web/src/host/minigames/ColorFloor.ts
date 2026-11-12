/**
 * «Chão de Cores»: o chão é de azulejos coloridos num cais de madeira (estacas e vigas) no meio do
 * mar, com barcos ao fundo. O letreiro anuncia uma cor e, quando o tempo acaba, os azulejos das
 * outras cores partem-se em pedaços que caem à água — quem lá estiver vai junto.
 * Cada ronda há menos tempo. Ganha quem ficar de pé (ou a equipa com mais gente).
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, textSprite, toon, toonUnique, disposeObject } from '../three/materials';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const N = 6;
const TILE = 2.3;
const HALF = (N * TILE) / 2;
const COLORS = [
  { name: 'Vermelho', hex: '#ff3b5c' },
  { name: 'Azul', hex: '#2f7dff' },
  { name: 'Amarelo', hex: '#ffd23f' },
  { name: 'Verde', hex: '#25c26b' },
  { name: 'Roxo', hex: '#9b5cff' },
];

interface Tile {
  mesh: THREE.Mesh;
  mat: THREE.MeshToonMaterial;
  color: number;
  /** 0 = no sítio, 1 = caído. */
  drop: number;
  /** Já se partiu nesta ronda (os pedaços estão a cair). */
  broken: boolean;
}

/** Pedaço de um azulejo partido. */
interface Shard {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
}

const WATER_Y = -2.3;
const WOOD = '#7a5230';

class ColorFloorRun extends ArenaMinigame {
  protected readonly duration = 60;
  private readonly tiles: Tile[] = [];
  private phase: 'show' | 'drop' | 'back' = 'show';
  private phaseT = 0;
  private target = 0;
  private window = 4;
  private round = 0;
  private sign: THREE.Sprite | null = null;
  private readonly bar: THREE.Mesh;
  /** Quem estava em jogo antes da última queda (se caírem todos, empatam entre si). */
  private lastAlive: Actor[] = [];
  /** Saltos (Ⓑ): tempo que falta no ar. Como no Fall Guys: Ⓐ mergulha, Ⓑ salta. */
  private readonly air = new Map<string, number>();
  /** Bots: quanto tempo ainda «pensam» antes de reagir à cor. */
  private readonly botDelay = new Map<string, number>();
  private readonly shards: Shard[] = [];
  private readonly shardGeo = new THREE.BoxGeometry(TILE / 3 - 0.06, 0.45, TILE / 3 - 0.06);
  private readonly boats: { g: THREE.Group; phase: number; y: number }[] = [];

  constructor(ctx: MinigameContext) {
    super(ctx);
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const mat = toonUnique('#ffffff');
        const m = mesh(new THREE.BoxGeometry(TILE - 0.08, 0.5, TILE - 0.08), mat, { receive: true });
        m.position.set(-HALF + TILE / 2 + i * TILE, -0.25, -HALF + TILE / 2 + j * TILE);
        this.scene.add(m);
        this.tiles.push({ mesh: m, mat, color: 0, drop: 0, broken: false });
      }
    this.buildPier();
    this.buildSea(ctx);
    this.recolor();
    this.bar = mesh(new THREE.BoxGeometry(8, 0.35, 0.2), toonUnique('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.4 }), { cast: false });
    this.bar.position.set(0, 3.2, -HALF - 1);
    this.scene.add(this.bar);
    this.spawnActors(3.5);
    // Mergulho (Ⓐ): mais longo e mais rápido do que o arranque normal, e empurra quem apanhar.
    this.dashBoost = 2.9;
    this.dashLength = 0.32;
    this.dashCooldownTime = 1.2;
    this.camera.position.set(0, 21, 17);
    this.camera.lookAt(0, 0, 1.2);
    this.newRound();
  }

  /** Estacas de madeira nos cruzamentos, vigas por baixo das juntas e tábuas de bordo à volta. */
  private buildPier(): void {
    const wood = toon(WOOD);
    const dark = toon('#5c3d22');
    const postGeo = new THREE.CylinderGeometry(0.2, 0.24, 6, 8);
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) {
        const edge = i === 0 || j === 0 || i === N || j === N;
        if (!edge && (i + j) % 2) continue;
        const corner = (i === 0 || i === N) && (j === 0 || j === N);
        const p = mesh(postGeo, (i + j) % 2 ? wood : dark, { cast: false });
        // Nos cantos a estaca sobe acima do chão (cabeço de amarração).
        p.position.set(-HALF + i * TILE, corner ? -2.6 : -3.4, -HALF + j * TILE);
        this.scene.add(p);
        if (corner) {
          const rope = mesh(new THREE.TorusGeometry(0.25, 0.06, 6, 14), toon('#cdb38a'), { cast: false });
          rope.rotation.x = Math.PI / 2;
          rope.position.set(p.position.x, 0.1, p.position.z);
          this.scene.add(rope);
        }
      }
    // Vigas por baixo das juntas dos azulejos (nos dois sentidos).
    for (let k = 0; k <= N; k++) {
      const a = mesh(new THREE.BoxGeometry(N * TILE + 0.4, 0.3, 0.26), wood, { cast: false });
      a.position.set(0, -0.68, -HALF + k * TILE);
      const b = mesh(new THREE.BoxGeometry(0.26, 0.3, N * TILE + 0.4), dark, { cast: false });
      b.position.set(-HALF + k * TILE, -0.98, 0);
      this.scene.add(a, b);
    }
    // Tábuas de bordo à volta do cais.
    const plankMat = toon('#9a6b3c');
    for (const s of [-1, 1]) {
      const px = mesh(new THREE.BoxGeometry(N * TILE + 1.2, 0.18, 0.5), plankMat, { receive: true });
      px.position.set(0, -0.05, s * (HALF + 0.25));
      const pz = mesh(new THREE.BoxGeometry(0.5, 0.18, N * TILE + 1.2), plankMat, { receive: true });
      pz.position.set(s * (HALF + 0.25), -0.05, 0);
      this.scene.add(px, pz);
    }
    // Travessas em diagonal entre as estacas da frente e de trás (contraventamento).
    const tilt = Math.atan2(1.4, TILE * 2);
    for (const s of [-1, 1])
      for (let k = 0; k < N; k += 2) {
        const brace = mesh(new THREE.BoxGeometry(Math.hypot(TILE * 2, 1.4), 0.16, 0.12), dark, { cast: false });
        brace.position.set(-HALF + (k + 1) * TILE, -1.75, s * (HALF + 0.1));
        brace.rotation.z = (k / 2) % 2 ? tilt : -tilt;
        this.scene.add(brace);
      }
  }

  /** Mar aberto (sempre água a sério, mesmo no vulcão) com barcos a balançar ao fundo. */
  private buildSea(ctx: MinigameContext): void {
    const wm = this.water.mesh.material as THREE.MeshStandardMaterial;
    wm.color.set('#1782bd');
    wm.emissive = new THREE.Color('#000000');
    this.water.mesh.position.y = WATER_Y;
    const hullColors = ['#c0392b', '#2f6db5', '#f2f2f2', '#2e8b57', '#e0a030'];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const color = hullColors[i % hullColors.length]!;
      // Casco: meio cilindro deitado (fundo redondo), com convés de madeira por cima.
      const hull = mesh(new THREE.CylinderGeometry(1, 1, 5, 12, 1, false, Math.PI / 2, Math.PI), toon(color), { cast: false });
      hull.rotation.z = Math.PI / 2;
      hull.scale.set(1, 1, 0.9);
      const deck = mesh(new THREE.BoxGeometry(5, 0.12, 1.8), toon('#b88a55'), { cast: false });
      deck.position.y = 0.02;
      g.add(hull, deck);
      if (i % 3 === 2) {
        // Barco a motor: cabine.
        const cab = mesh(new THREE.BoxGeometry(1.6, 1, 1.3), toon('#f4f4f4'), { cast: false });
        cab.position.set(-0.4, 0.55, 0);
        const roof = mesh(new THREE.BoxGeometry(1.9, 0.12, 1.5), toon(color), { cast: false });
        roof.position.set(-0.4, 1.1, 0);
        g.add(cab, roof);
      } else {
        // Veleiro: mastro e vela triangular.
        const mast = mesh(new THREE.CylinderGeometry(0.06, 0.08, 5, 6), toon('#5c3d22'), { cast: false });
        mast.position.set(0.3, 2.5, 0);
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(-2.2, 0);
        shape.lineTo(0, 4.3);
        const sail = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshToonMaterial({ color: i % 2 ? '#ffffff' : '#ffe0b0', side: THREE.DoubleSide }));
        sail.position.set(0.22, 0.45, 0);
        g.add(mast, sail);
      }
      // Ao fundo e dos lados (nunca entre a câmara e o cais).
      const ang = Math.PI * (1.08 + (i / 6) * 0.84) + (ctx.rng.next() - 0.5) * 0.15;
      const r = 24 + ctx.rng.next() * 18;
      g.position.set(Math.cos(ang) * r, WATER_Y + 0.2, Math.sin(ang) * r);
      g.rotation.y = ctx.rng.next() * Math.PI * 2;
      g.scale.setScalar(1.2 + ctx.rng.next() * 0.6);
      this.scene.add(g);
      this.boats.push({ g, phase: ctx.rng.next() * 10, y: g.position.y });
    }
    // Ilhotas lá longe no horizonte.
    for (let i = 0; i < 4; i++) {
      const isle = mesh(new THREE.SphereGeometry(1, 14, 8), toon(i % 2 ? '#4e8f4a' : '#6aa35a'), { cast: false });
      isle.scale.set(14 + i * 4, 4 + (i % 3) * 2, 9);
      isle.position.set(-70 + i * 45, WATER_Y - 1, -110 - (i % 2) * 20);
      const sand = mesh(new THREE.CylinderGeometry(1, 1, 0.4, 16), toon('#e8d6a0'), { cast: false });
      sand.scale.set(isle.scale.x * 1.08, 1, isle.scale.z * 1.15);
      sand.position.set(isle.position.x, WATER_Y + 0.05, isle.position.z);
      this.scene.add(sand, isle);
    }
  }

  /** O azulejo parte-se em 9 pedaços que saltam um bocadinho e caem à água a rodar. */
  private shatter(t: Tile): void {
    t.broken = true;
    t.mesh.visible = false;
    const c = t.mesh.position;
    const r = () => this.ctx.rng.next() - 0.5;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const m = new THREE.Mesh(this.shardGeo, t.mat);
        const ox = (i - 1) * (TILE / 3);
        const oz = (j - 1) * (TILE / 3);
        m.position.set(c.x + ox, c.y, c.z + oz);
        m.castShadow = true;
        this.scene.add(m);
        this.shards.push({
          mesh: m,
          vel: new THREE.Vector3(ox * 1.4 + r(), 1.5 + this.ctx.rng.next() * 2, oz * 1.4 + r()),
          spin: new THREE.Vector3(r() * 10, r() * 6, r() * 10),
        });
      }
  }

  private recolor(): void {
    for (const t of this.tiles) {
      t.color = this.ctx.rng.int(0, COLORS.length - 1);
      t.mat.color.set(COLORS[t.color]!.hex);
    }
  }

  private newRound(): void {
    this.round++;
    this.recolor();
    // A cor anunciada tem de existir no chão; com as rondas há cada vez menos azulejos dela.
    this.target = this.tiles[this.ctx.rng.int(0, this.tiles.length - 1)]!.color;
    const keep = Math.max(2, 9 - this.round);
    const ofTarget = this.tiles.filter((t) => t.color === this.target);
    for (const t of this.ctx.rng.shuffle(ofTarget).slice(keep)) {
      t.color = (t.color + 1 + this.ctx.rng.int(0, COLORS.length - 2)) % COLORS.length;
      t.mat.color.set(COLORS[t.color]!.hex);
    }
    this.window = Math.max(1.1, 3.6 - this.round * 0.4);
    this.phase = 'show';
    this.phaseT = 0;
    if (this.sign) {
      this.scene.remove(this.sign);
      disposeObject(this.sign);
    }
    const c = COLORS[this.target]!;
    this.sign = textSprite(`● ${c.name}!`, { height: 1.8, color: c.hex, stroke: '#1d1433' });
    this.sign.position.set(0, 4.6, -HALF - 1);
    this.scene.add(this.sign);
    (this.bar.material as THREE.MeshToonMaterial).color.set(c.hex);
    (this.bar.material as THREE.MeshToonMaterial).emissive.set(c.hex);
    sound.play('beep');
    for (const a of this.actors) {
      this.botDelay.set(a.seat.id, 0.35 + (1 - this.ctx.botSkill) * 1.1 * this.ctx.rng.next());
      if (a.alive) this.ctx.vibrate(a.seat.id, 40);
    }
  }

  private tileAt(x: number, z: number): Tile | undefined {
    const i = Math.floor((x + HALF) / TILE);
    const j = Math.floor((z + HALF) / TILE);
    if (i < 0 || j < 0 || i >= N || j >= N) return undefined;
    return this.tiles[i * N + j];
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => ({ id: a.seat.id, value: a.alive ? '🟩' : '💦' }));
  }

  winners(): string[] {
    let alive = this.actors.filter((a) => a.alive);
    // Ninguém acertou na última cor: caem todos os que restavam e empatam.
    if (!alive.length) alive = this.lastAlive;
    if (this.ctx.mode === 'ffa') return alive.length === this.actors.length ? [] : alive.map((a) => a.seat.id);
    const count = (t: 'blue' | 'red') => alive.filter((a) => a.seat.team === t).length;
    if (count('blue') === count('red')) return [];
    const team = count('blue') > count('red') ? 'blue' : 'red';
    return this.actors.filter((a) => a.seat.team === team).map((a) => a.seat.id);
  }

  protected override constrain(a: Actor): void {
    a.pos.x = Math.max(-HALF + 0.3, Math.min(HALF - 0.3, a.pos.x));
    a.pos.z = Math.max(-HALF + 0.3, Math.min(HALF - 0.3, a.pos.z));
  }

  protected override onBump(a: Actor, b: Actor, nx: number, nz: number): void {
    const push = (from: Actor, to: Actor, dir: number) => {
      if (from.dashTime <= 0) return;
      to.vel.x += nx * dir * 9;
      to.vel.z += nz * dir * 9;
      to.stunned = Math.max(to.stunned, 0.35);
      sound.play('hit');
      this.ctx.vibrate(to.seat.id, 80);
    };
    push(a, b, 1);
    push(b, a, -1);
  }

  private jump(a: Actor): void {
    if ((this.air.get(a.seat.id) ?? 0) > 0 || !a.alive) return;
    this.air.set(a.seat.id, 0.7);
    a.model.setAnim('jump');
    sound.play('whoosh', { vol: 0.3, pitch: 1.3 });
  }

  protected step(dt: number): void {
    this.phaseT += dt;
    for (const a of this.actors) {
      if (!a.alive) continue;
      if (this.ctx.pad(a.seat.id).consumePress('b')) this.jump(a);
      const t = Math.max(0, (this.air.get(a.seat.id) ?? 0) - dt);
      this.air.set(a.seat.id, t);
      a.pos.y = t > 0 ? Math.sin((1 - t / 0.7) * Math.PI) * 1.7 : 0;
    }
    if (this.phase === 'show') {
      this.bar.scale.x = Math.max(0.01, 1 - this.phaseT / this.window);
      if (this.phaseT >= this.window) {
        this.phase = 'drop';
        this.phaseT = 0;
        sound.play('whoosh');
        // Quem não está num azulejo da cor certa cai. Se caírem todos os que restam, empatam.
        this.lastAlive = this.actors.filter((a) => a.alive);
        const wrong = this.actors.filter((a) => {
          if (!a.alive) return false;
          const t = this.tileAt(a.pos.x, a.pos.z);
          return !t || t.color !== this.target;
        });
        const everyone = wrong.length === this.actors.filter((a) => a.alive).length;
        if (everyone && wrong.length) {
          const sign = textSprite('Ninguém acertou — empate!', { height: 1, color: '#ffffff', stroke: '#1d1433' });
          sign.position.set(0, 3, 0);
          this.scene.add(sign);
          setTimeout(() => this.scene.remove(sign), 1500);
        }
      }
    } else if (this.phase === 'drop') {
      if (this.phaseT <= dt) sound.play('hit', { vol: 0.7, pitch: 0.6 });
      for (const t of this.tiles) {
        if (t.color === this.target) continue;
        t.drop = Math.min(1, t.drop + dt * 2.5);
        if (!t.broken) this.shatter(t);
      }
      // Enquanto os azulejos caem: quem está no chão por cima de um buraco vai à água
      // (um salto bem medido salva — e quem aterra num buraco cai).
      for (const a of this.actors) {
        if (!a.alive || a.pos.y > 0.15) continue;
        const t = this.tileAt(a.pos.x, a.pos.z);
        if (!t || t.drop > 0.15) this.sink(a, 0.6);
      }
      if (this.phaseT > 1.4) {
        this.phase = 'back';
        this.phaseT = 0;
        const alive = this.actors.filter((x) => x.alive);
        const sides = new Set(alive.map((x) => this.teamOf(x)));
        if (sides.size <= 1) this.endGame();
      }
    } else {
      // Azulejos novos sobem de baixo do cais para o lugar.
      for (const t of this.tiles) {
        t.drop = Math.max(0, t.drop - dt * 2.5);
        if (t.broken) {
          t.broken = false;
          t.mesh.visible = true;
        }
      }
      if (this.phaseT > 0.6) this.newRound();
    }
    for (const t of this.tiles) t.mesh.position.y = -0.25 - t.drop * 2.2;
    // Pedaços a cair à água.
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i]!;
      s.vel.y -= 18 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      if (s.mesh.position.y < WATER_Y - 1.5) {
        this.scene.remove(s.mesh);
        this.shards.splice(i, 1);
      }
    }
    // Barcos a balançar nas ondas.
    for (const b of this.boats) {
      const k = this.elapsed + b.phase;
      b.g.position.y = b.y + Math.sin(k * 1.3) * 0.18;
      b.g.rotation.z = Math.sin(k * 1.1) * 0.06;
      b.g.rotation.x = Math.cos(k * 0.9) * 0.04;
    }
  }

  protected think(a: Actor, dt: number): void {
    const pad = this.ctx.botPad(a.seat.id);
    const wait = (this.botDelay.get(a.seat.id) ?? 0) - dt;
    this.botDelay.set(a.seat.id, wait);
    if (this.phase !== 'show' || wait > 0) {
      pad.stick.x = pad.stick.y = 0;
      return;
    }
    // Vai para o centro do azulejo da cor certa mais perto.
    let best: Tile | null = null;
    let bestD = Infinity;
    for (const t of this.tiles) {
      if (t.color !== this.target) continue;
      const d = Math.hypot(t.mesh.position.x - a.pos.x, t.mesh.position.z - a.pos.z);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best) {
      this.steer(a, best.mesh.position.x, best.mesh.position.z);
      // Longe: mergulha. Quase a acabar o tempo e ainda fora: salta para lá.
      if (bestD > 5 && a.dashCooldown <= 0 && this.ctx.rng.next() < 0.05) pad.press('a');
      if (bestD > 1 && bestD < 3.2 && this.window - this.phaseT < 0.4 && this.ctx.rng.next() < 0.3) pad.press('b');
    }
  }
}

export const ColorFloor: MinigameDef = {
  id: 'cores',
  rounds: 2,
  name: 'Chão de Cores',
  modes: ['ffa', 'teams'],
  description: () => 'O letreiro anuncia uma cor: corre para um azulejo dessa cor antes que os outros caiam à água! Mergulha com Ⓐ (e empurra quem apanhares) e salta com Ⓑ por cima dos buracos.',
  controls: '🕹️ Correr · Ⓐ Mergulho (empurra) · Ⓑ Saltar',
  stick: true,
  buttons: [
    { id: 'a', label: 'Mergulho' },
    { id: 'b', label: 'Saltar' },
  ],
  create: (ctx) => new ColorFloorRun(ctx),
};
