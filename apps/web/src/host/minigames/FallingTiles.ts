/**
 * «Plataformas que Caem» (todos contra todos / equipas): azulejos hexagonais por cima da lava.
 * Na primeira passagem o azulejo fica com uma racha no meio; quando alguém volta a passar por
 * cima, desfaz-se e cai pouco depois. Ⓐ salta (dá para passar buracos). Quem cair à lava sai;
 * ganha quem ficar de pé. Na 2.ª ronda caem mais depressa.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toonUnique } from '../three/materials';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { themeScenery } from './scenery';

const HEX = 1.05; // raio de cada hexágono
const RADIUS = 8.6;
const JUMP = 0.6;

interface Tile {
  x: number;
  z: number;
  mesh: THREE.Mesh;
  mat: THREE.MeshToonMaterial;
  /** Já tem a racha (alguém passou por cima uma vez). */
  cracked: boolean;
  /** −1 = ainda não está a cair; ≥0 = segundos desde que começou a desfazer-se (2.ª passagem). */
  crack: number;
  fallen: boolean;
  drop: number;
}

class FallingTilesRun extends ArenaMinigame {
  protected readonly duration = 60;
  private readonly tiles: Tile[] = [];
  private readonly crumble: number;
  private readonly air = new Map<string, number>();
  private readonly outAt = new Map<string, number>();
  private readonly goal = new Map<string, { x: number; z: number; t: number }>();
  /** Azulejo onde cada um estava (entrar noutro conta como uma passagem). */
  private readonly onTile = new Map<string, Tile>();
  private readonly crackGeo = new THREE.BoxGeometry(HEX * 1.6, 0.04, 0.09);
  private readonly crackMat = toonUnique('#3a2a22');

  constructor(ctx: MinigameContext) {
    super(ctx);
    this.crumble = (ctx.round ?? 1) >= 2 ? 0.9 : 1.3;
    (this.water.mesh.material as THREE.MeshStandardMaterial).color.set('#ff5a1f');
    (this.water.mesh.material as THREE.MeshStandardMaterial).emissive = new THREE.Color('#b32400');
    // Grelha de hexágonos (colunas desencontradas) dentro de um círculo.
    const geo = new THREE.CylinderGeometry(HEX * 0.96, HEX * 0.9, 0.5, 6);
    const w = HEX * Math.sqrt(3);
    const colors = ['#9ad0ff', '#b8f0c8', '#ffe39a', '#ffb3c1'];
    for (let row = -9; row <= 9; row++)
      for (let col = -9; col <= 9; col++) {
        const x = col * w + (row % 2 ? w / 2 : 0);
        const z = row * HEX * 1.5;
        if (Math.hypot(x, z) > RADIUS) continue;
        const mat = toonUnique(colors[(Math.abs(row) + Math.abs(col)) % colors.length]!);
        const m = mesh(geo, mat, { receive: true });
        m.rotation.y = Math.PI / 6;
        m.position.set(x, -0.25, z);
        this.scene.add(m);
        this.tiles.push({ x, z, mesh: m, mat, cracked: false, crack: -1, fallen: false, drop: 0 });
      }
    // Cenário com o tema do mapa à volta (com chão por baixo).
    themeScenery(this.scene, ctx.rng, ctx.theme, RADIUS + 1, { water: true });
    this.spawnActors(5);
    this.camera.position.set(0, 21, 17);
    this.camera.lookAt(0, 0, 0.5);
  }

  private tileAt(x: number, z: number): Tile | undefined {
    let best: Tile | undefined;
    let bd = HEX * 0.95;
    for (const t of this.tiles) {
      if (t.fallen) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => ({ id: a.seat.id, value: a.alive ? '🟢 de pé' : '🔥 na lava' }));
  }

  winners(): string[] {
    let alive = this.actors.filter((a) => a.alive);
    if (!alive.length) {
      const last = Math.max(...this.outAt.values());
      alive = this.actors.filter((a) => (this.outAt.get(a.seat.id) ?? 0) >= last - 0.05);
      if (alive.length === this.actors.length) return [];
    }
    if (this.ctx.mode === 'ffa') return alive.length === this.actors.length ? [] : alive.map((a) => a.seat.id);
    const count = (t: 'blue' | 'red') => alive.filter((a) => a.seat.team === t).length;
    if (count('blue') === count('red')) return [];
    const team = count('blue') > count('red') ? 'blue' : 'red';
    return this.actors.filter((a) => a.seat.team === team).map((a) => a.seat.id);
  }

  protected override onDash(a: Actor): void {
    // Ⓐ salta (em vez de dar um arranque).
    if ((this.air.get(a.seat.id) ?? 0) > 0) return;
    this.air.set(a.seat.id, JUMP);
    a.dashTime = 0;
    a.model.setAnim('jump');
    sound.play('whoosh', { vol: 0.3, pitch: 1.3 });
  }

  protected override constrain(a: Actor): void {
    const d = Math.hypot(a.pos.x, a.pos.z);
    if (d > RADIUS + 1.5) a.pos.multiplyScalar((RADIUS + 1.5) / d);
  }

  protected step(dt: number): void {
    // Saltos
    for (const a of this.actors) {
      if (!a.alive) continue;
      const t = Math.max(0, (this.air.get(a.seat.id) ?? 0) - dt);
      this.air.set(a.seat.id, t);
      a.pos.y = t > 0 ? Math.sin((1 - t / JUMP) * Math.PI) * 1.4 : 0;
      if (a.dashCooldown > 0.3) a.dashCooldown = Math.min(a.dashCooldown, t > 0 ? 9 : 0);
    }
    // Entrar num azulejo conta como uma passagem: a 1.ª racha-o, a 2.ª fá-lo cair.
    // Quem não tem azulejo debaixo dos pés cai.
    for (const a of this.actors) {
      if (!a.alive || a.pos.y > 0.05) continue;
      const tile = this.tileAt(a.pos.x, a.pos.z);
      if (!tile || tile.drop > 0.25) {
        this.outAt.set(a.seat.id, this.elapsed);
        this.sink(a, 1);
        continue;
      }
      if (this.onTile.get(a.seat.id) === tile) continue;
      const first = !this.onTile.has(a.seat.id); // onde começou não conta como passagem
      this.onTile.set(a.seat.id, tile);
      if (first) continue;
      if (!tile.cracked) this.crackTile(tile);
      else if (tile.crack < 0) {
        tile.crack = 0;
        sound.play('tick', { vol: 0.3, pitch: 0.6 });
      }
    }
    for (const t of this.tiles) {
      if (t.fallen || t.crack < 0) continue;
      t.crack += dt;
      const k = Math.min(1, t.crack / this.crumble);
      // Fica vermelho e treme antes de cair.
      t.mat.color.setRGB(1, 1 - k * 0.6, 1 - k * 0.7);
      t.mesh.position.x = t.x + (k > 0.5 ? Math.sin(t.crack * 60) * 0.05 : 0);
      if (k >= 1) {
        t.drop += dt * 2;
        t.mesh.position.y = -0.25 - t.drop * t.drop * 8;
        t.mesh.rotation.z = t.drop * 0.6;
        if (t.drop > 1.2) {
          t.fallen = true;
          t.mesh.visible = false;
        }
      }
    }
    const alive = this.actors.filter((a) => a.alive);
    const sides = new Set(alive.map((a) => (this.ctx.mode === 'ffa' ? a.seat.id : a.seat.team)));
    if (sides.size <= 1 && this.actors.length > 1) this.endGame();
  }

  /** Primeira passagem: risca escura no meio do azulejo. */
  private crackTile(t: Tile): void {
    t.cracked = true;
    const line = new THREE.Mesh(this.crackGeo, this.crackMat);
    line.position.y = 0.26;
    line.rotation.y = this.ctx.rng.next() * Math.PI;
    t.mesh.add(line);
    t.mat.color.multiplyScalar(0.88);
    sound.play('tick', { vol: 0.2, pitch: 1.1 });
  }

  /** Bots: vão para azulejos intactos com muitos vizinhos e saltam buracos. */
  protected think(a: Actor): void {
    const pad = this.ctx.botPad(a.seat.id);
    let g = this.goal.get(a.seat.id);
    const here = this.tileAt(a.pos.x, a.pos.z);
    const goalTile = g ? this.tileAt(g.x, g.z) : undefined;
    if (!g || this.elapsed > g.t || !goalTile || goalTile.cracked || Math.hypot(g.x - a.pos.x, g.z - a.pos.z) < 0.6) {
      const intact = this.tiles.filter((t) => !t.fallen && !t.cracked && Math.hypot(t.x - a.pos.x, t.z - a.pos.z) < 5);
      const score = (t: Tile) => this.tiles.filter((o) => !o.fallen && !o.cracked && Math.hypot(o.x - t.x, o.z - t.z) < HEX * 2.2).length - Math.hypot(t.x, t.z) * 0.15 + this.ctx.rng.next();
      const pick = intact.sort((x, y) => score(y) - score(x))[0];
      g = pick ? { x: pick.x, z: pick.z, t: this.elapsed + 0.8 + this.ctx.rng.next() } : { x: 0, z: 0, t: this.elapsed + 1 };
      this.goal.set(a.seat.id, g);
    }
    this.steer(a, g.x, g.z);
    // Salta se o azulejo onde está vai cair, ou se à frente há um buraco.
    const ahead = this.tileAt(a.pos.x + a.vel.x * 0.25, a.pos.z + a.vel.z * 0.25);
    if ((here && here.crack > this.crumble * 0.7) || (!ahead && Math.hypot(a.vel.x, a.vel.z) > 2)) {
      if (this.ctx.rng.next() < 0.4 + this.ctx.botSkill * 0.5) pad.press('a');
    }
  }
}

export const FallingTiles: MinigameDef = {
  id: 'plataformas',
  rounds: 2,
  name: 'Plataformas que Caem',
  modes: ['ffa', 'teams'],
  description: () =>
    'Azulejos por cima da lava: à primeira passagem racham, à segunda caem! Ⓐ salta os buracos. Ganha quem ficar de pé.',
  controls: '🕹️ Mover · Ⓐ Saltar',
  stick: true,
  buttons: [{ id: 'a', label: 'Saltar' }],
  create: (ctx) => new FallingTilesRun(ctx),
};
