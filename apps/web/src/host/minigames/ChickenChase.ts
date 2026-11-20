/**
 * «Apanha a Galinha» (duelo, inspirado no Fowl Play do Mario Party 3): os dois estão num cercado
 * com uma galinha à solta. Corre atrás dela com o joystick; quem lhe tocar primeiro ganha a ronda.
 * A galinha foge de quem estiver mais perto e às vezes dá um esticão; encostá-la à cerca ajuda.
 * Ⓐ dá um arranque curto. Melhor de 3.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { mesh, toon, toonUnique } from '../three/materials';
import { ArenaMinigame, type Actor } from './ArenaMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { themeGround, themeScenery } from './scenery';

const R = 8;
const CATCH = 0.95;

/** Galinha de desenho animado: corpo branco, crista e barbela vermelhas, bico e patas amarelas. */
function chicken(): THREE.Group {
  const g = new THREE.Group();
  const white = toon('#fbfaf5');
  const body = mesh(new THREE.SphereGeometry(0.42, 14, 12), white);
  body.scale.set(1, 0.85, 1.2);
  body.position.y = 0.55;
  const head = mesh(new THREE.SphereGeometry(0.22, 12, 10), white);
  head.position.set(0, 0.95, 0.38);
  const comb = mesh(new THREE.BoxGeometry(0.06, 0.16, 0.22), toonUnique('#e8333c'));
  comb.position.set(0, 1.18, 0.38);
  const wattle = mesh(new THREE.SphereGeometry(0.06, 8, 6), toonUnique('#e8333c'));
  wattle.position.set(0, 0.8, 0.55);
  const beak = mesh(new THREE.ConeGeometry(0.07, 0.18, 6), toon('#ffb21e'));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.93, 0.62);
  const tail = mesh(new THREE.ConeGeometry(0.18, 0.35, 6), white);
  tail.rotation.x = -0.9;
  tail.position.set(0, 0.75, -0.5);
  g.add(body, head, comb, wattle, beak, tail);
  for (const side of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.035, 6, 6), toon('#1b1033'), { cast: false });
    eye.position.set(side * 0.12, 1, 0.55);
    const leg = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 6), toon('#ffb21e'));
    leg.position.set(side * 0.14, 0.16, 0);
    leg.name = 'leg';
    g.add(eye, leg);
  }
  return g;
}

class ChickenChaseRun extends ArenaMinigame {
  protected readonly duration = 30;
  private readonly hen = chicken();
  private readonly hpos = new THREE.Vector3(0, 0, -1.5);
  private readonly hvel = new THREE.Vector3();
  private dart = 0;
  private wander = 0;
  private catcher: Actor | null = null;
  private lift = 0;

  constructor(ctx: MinigameContext) {
    super(ctx);
    const floor = mesh(new THREE.CylinderGeometry(R + 0.6, R + 0.6, 0.4, 48), toon(themeGround(ctx.theme)), { receive: true, cast: false });
    floor.position.y = -0.2;
    this.scene.add(floor);
    // Cerca de madeira à volta.
    const wood = toon('#a0703c');
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const post = mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), wood);
      post.position.set(Math.cos(a) * (R + 0.3), 0.45, Math.sin(a) * (R + 0.3));
      this.scene.add(post);
    }
    for (const y of [0.35, 0.75]) {
      const rail = mesh(new THREE.TorusGeometry(R + 0.3, 0.05, 6, 64), wood, { cast: false });
      rail.rotation.x = Math.PI / 2;
      rail.position.y = y;
      this.scene.add(rail);
    }
    themeScenery(this.scene, ctx.rng, ctx.theme, R + 1);
    this.hen.position.copy(this.hpos);
    this.scene.add(this.hen);
    this.spawnActors(5, () => ({ speed: 6.4 }));
    this.dashBoost = 1.9;
    this.dashCooldownTime = 1.4;
    this.camera.position.set(0, 15, 13);
    this.camera.lookAt(0, 0, 0.5);
  }

  scores(): MinigameScore[] {
    return this.actors.map((a) => ({ id: a.seat.id, value: a === this.catcher ? '🐔 apanhou!' : '…' }));
  }

  winners(): string[] {
    return this.catcher ? [this.catcher.seat.id] : [];
  }

  protected override constrain(a: Actor): void {
    const d = Math.hypot(a.pos.x, a.pos.z);
    if (d > R - 0.4) a.pos.multiplyScalar((R - 0.4) / d);
  }

  protected step(dt: number): void {
    if (this.catcher) return;
    // A galinha foge de quem estiver mais perto, com voltas ao calhas e esticões de vez em quando.
    const near = this.actors.reduce((best, a) => (Math.hypot(a.pos.x - this.hpos.x, a.pos.z - this.hpos.z) < Math.hypot(best.pos.x - this.hpos.x, best.pos.z - this.hpos.z) ? a : best));
    const away = new THREE.Vector3(this.hpos.x - near.pos.x, 0, this.hpos.z - near.pos.z);
    const dist = away.length();
    away.normalize();
    this.wander += dt * (1.5 + Math.random());
    const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(Math.sin(this.wander * 2.3) * 0.8);
    // Perto da cerca, foge ao longo dela (não fica presa a bater na rede).
    const out = new THREE.Vector3(this.hpos.x, 0, this.hpos.z);
    const r = out.length();
    if (r > R - 2) away.addScaledVector(out.normalize(), -(r - (R - 2)) * 0.9);
    this.dart -= dt;
    if (dist < 2.2 && this.dart <= 0) {
      this.dart = 1.6 + Math.random();
      sound.play('whoosh', { vol: 0.3, pitch: 1.8 });
    }
    const speed = dist < 4.5 ? (this.dart > 1.2 ? 9 : 5.6) : 2.2;
    const want = away.add(side).normalize().multiplyScalar(speed);
    this.hvel.lerp(want, Math.min(1, dt * 5));
    this.hpos.addScaledVector(this.hvel, dt);
    const hr = Math.hypot(this.hpos.x, this.hpos.z);
    if (hr > R - 0.5) this.hpos.multiplyScalar((R - 0.5) / hr);
    // Apanhada?
    for (const a of this.actors) {
      if (Math.hypot(a.pos.x - this.hpos.x, a.pos.z - this.hpos.z) < CATCH) {
        this.catcher = a;
        sound.play('cheer');
        a.model.setAnim('cheer');
        this.ctx.vibrate(a.seat.id, 200);
        this.endGame();
        return;
      }
    }
  }

  /** Bots: correm para onde a galinha vai estar (melhores = olham mais à frente) e dão arranques. */
  protected think(a: Actor): void {
    const look = 0.15 + this.ctx.botSkill * 0.35;
    this.steer(a, this.hpos.x + this.hvel.x * look, this.hpos.z + this.hvel.z * look);
    if (Math.hypot(a.pos.x - this.hpos.x, a.pos.z - this.hpos.z) < 2 && this.ctx.rng.next() < 0.03 + this.ctx.botSkill * 0.04) this.ctx.botPad(a.seat.id).press('a');
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    if (this.catcher) {
      // Quem apanhou levanta a galinha por cima da cabeça.
      this.lift = Math.min(1, this.lift + dt * 3);
      const p = this.catcher.pos;
      this.hen.position.set(p.x, 2.3 * this.lift, p.z);
      this.hen.rotation.y += dt * 6;
      return;
    }
    this.hen.position.copy(this.hpos);
    const sp = Math.hypot(this.hvel.x, this.hvel.z);
    if (sp > 0.2) this.hen.rotation.y = Math.atan2(this.hvel.x, this.hvel.z);
    // Pulinhos ao correr e patas a mexer.
    this.hen.position.y = Math.abs(Math.sin(time * 14)) * Math.min(0.25, sp * 0.03);
    this.hen.children.forEach((c, i) => {
      if (c.name === 'leg') c.rotation.x = Math.sin(time * 18 + i) * Math.min(0.8, sp * 0.12);
    });
  }
}

export const ChickenChase: MinigameDef = {
  id: 'apanha-galinha',
  name: 'Apanha a Galinha',
  modes: ['ffa'],
  duel: true,
  rounds: 3,
  description: () => 'Uma galinha à solta no cercado: corre atrás dela e toca-lhe primeiro! Encosta-a à cerca para a apanhares. Ⓐ dá um arranque. Melhor de 3.',
  controls: '🕹️ Correr · Ⓐ Arranque',
  stick: true,
  buttons: [{ id: 'a', label: 'Arranque' }],
  create: (ctx) => new ChickenChaseRun(ctx),
};
