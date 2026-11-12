/**
 * «Chão de Cores»: o chão é de azulejos coloridos sobre a água. O letreiro anuncia uma cor e,
 * quando o tempo acaba, os azulejos das outras cores caem — quem lá estiver vai à água.
 * Cada ronda há menos tempo. Ganha quem ficar de pé (ou a equipa com mais gente).
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, textSprite, toonUnique, disposeObject } from '../three/materials';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import { ringDecor } from './scenery';
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
}

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
  private readonly falling = new Set<Actor>();
  /** Quem estava em jogo antes da última queda (se caírem todos, empatam entre si). */
  private lastAlive: Actor[] = [];
  /** Saltos (Ⓑ): tempo que falta no ar. Como no Fall Guys: Ⓐ mergulha, Ⓑ salta. */
  private readonly air = new Map<string, number>();
  /** Bots: quanto tempo ainda «pensam» antes de reagir à cor. */
  private readonly botDelay = new Map<string, number>();

  constructor(ctx: MinigameContext) {
    super(ctx);
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const mat = toonUnique('#ffffff');
        const m = mesh(new THREE.BoxGeometry(TILE - 0.08, 0.5, TILE - 0.08), mat, { receive: true });
        m.position.set(-HALF + TILE / 2 + i * TILE, -0.25, -HALF + TILE / 2 + j * TILE);
        this.scene.add(m);
        this.tiles.push({ mesh: m, mat, color: 0, drop: 0 });
      }
    this.recolor();
    this.bar = mesh(new THREE.BoxGeometry(8, 0.35, 0.2), toonUnique('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.4 }), { cast: false });
    this.bar.position.set(0, 3.2, -HALF - 1);
    this.scene.add(this.bar);
    ringDecor(this.scene, ctx.rng, HALF + 9, 22, { ground: '#000', theme: ctx.theme });
    this.spawnActors(3.5);
    // Mergulho (Ⓐ): mais longo e mais rápido do que o arranque normal, e empurra quem apanhar.
    this.dashBoost = 2.9;
    this.dashLength = 0.32;
    this.dashCooldownTime = 1.2;
    this.camera.position.set(0, 21, 17);
    this.camera.lookAt(0, 0, 1.2);
    this.newRound();
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
      for (const t of this.tiles) if (t.color !== this.target) t.drop = Math.min(1, t.drop + dt * 2.5);
      // Enquanto os azulejos caem: quem está no chão por cima de um buraco vai à água
      // (um salto bem medido salva — e quem aterra num buraco cai).
      for (const a of this.actors) {
        if (!a.alive || a.pos.y > 0.15) continue;
        const t = this.tileAt(a.pos.x, a.pos.z);
        if (!t || t.drop > 0.15) {
          a.alive = false;
          this.outTimes.set(a.seat.id, this.elapsed);
          this.falling.add(a);
          a.model.setAnim('fall');
          this.ctx.vibrate(a.seat.id, 300);
          sound.play('splash', { vol: 0.6 });
        }
      }
      if (this.phaseT > 1.4) {
        this.phase = 'back';
        this.phaseT = 0;
        const alive = this.actors.filter((x) => x.alive);
        const sides = new Set(alive.map((x) => this.teamOf(x)));
        if (sides.size <= 1) this.endGame();
      }
    } else {
      for (const t of this.tiles) t.drop = Math.max(0, t.drop - dt * 2.5);
      if (this.phaseT > 0.6) this.newRound();
    }
    for (const t of this.tiles) t.mesh.position.y = -0.25 - t.drop * 6;
    for (const a of this.falling) {
      a.pos.y -= dt * 7;
      if (a.pos.y < -5) {
        a.model.root.visible = false;
        this.falling.delete(a);
      }
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
