/**
 * Golfe 3D: 3 buracos com fairway, green, lagos, bunkers e vento.
 * Aponta-se com o joystick e a força vem do gesto; o taco é escolhido sozinho.
 * Joga primeiro quem está mais longe do buraco (como no golfe a sério).
 */
import * as THREE from 'three';
import { createRng, getCharacter } from '@festa/game';
import {
  CLUBS,
  COURSE,
  MAX_STROKES,
  holeResultName,
  lieAt,
  pickClub,
  relativeToPar,
  type Club,
  type GolfHole,
  type Lie,
} from '@festa/game/sports/golf';
import type { SwingInput } from '@festa/shared';
import { disposeObject, mesh, toon, toonUnique } from '../../three/materials';
import { ease } from '../../three/tweens';
import { bush, palmTree } from '../../stages/environment';
import { SportStage } from '../SportStage';
import { rankBy, type SportContext, type SportStanding } from '../types';
import type { Seat } from '../../game/Seats';

const BALL_R = 0.12;
/** Desaceleração ao rolar (m/s²) em cada superfície. */
const DECEL: Record<Lie, number> = { green: 3, fairway: 6, rough: 14, bunker: 30, water: 30, out: 30 };
const LIE_POWER: Record<Lie, number> = { green: 1, fairway: 1, rough: 0.8, bunker: 0.6, water: 1, out: 1 };
const LIE_NAME: Record<Lie, string> = { green: 'green', fairway: 'fairway', rough: 'relva alta', bunker: 'bunker', water: 'água', out: 'fora' };

interface GolferState {
  seat: Seat;
  ball: THREE.Mesh;
  pos: THREE.Vector2;
  strokes: number;
  done: boolean;
  total: number;
  par: number;
}

export class GolfStage extends SportStage {
  private readonly golfers: GolferState[] = [];
  private readonly holeGroup = new THREE.Group();
  private readonly aimArrow: THREE.Group;
  private readonly aimRing: THREE.Mesh;
  private hole: GolfHole = COURSE[0]!;
  private wind = new THREE.Vector2();
  private aimAngle = 0;
  private aiming: GolferState | null = null;
  private aimDist = 10;
  private path: THREE.Vector2[] = [];

  constructor(ctx: SportContext) {
    super(ctx);
    this.scene.add(this.holeGroup);
    this.aimArrow = new THREE.Group();
    const shaft = mesh(new THREE.BoxGeometry(0.12, 0.04, 1), new THREE.MeshBasicMaterial({ color: '#ffd23f' }), { cast: false });
    shaft.position.z = -0.5;
    this.aimArrow.add(shaft);
    this.aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.1, 32),
      new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    this.aimRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.aimArrow, this.aimRing);
    this.showAim(false);

    for (const seat of ctx.players) {
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(BALL_R, 14, 10),
        new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, emissive: getCharacter(seat.characterId).color, emissiveIntensity: 0.25 }),
      );
      ball.castShadow = true;
      this.scene.add(ball);
      this.golfers.push({ seat, ball, pos: new THREE.Vector2(), strokes: 0, done: false, total: 0, par: 0 });
    }
  }

  async play(): Promise<SportStanding[]> {
    for (let h = 0; h < COURSE.length; h++) {
      await this.playHole(COURSE[h]!, h);
    }
    this.ctx.hud.setRound(null);
    const ranked = rankBy(this.golfers, (g) => g.total, false);
    return ranked.map((g) => ({ id: g.seat.id, rank: g.rank, score: `${g.total} pancadas (${relativeToPar(g.total, g.par)})` }));
  }

  // ── Buraco ──────────────────────────────────────────────

  private async playHole(hole: GolfHole, index: number): Promise<void> {
    this.hole = hole;
    this.buildHole(hole, index);
    const rng = this.ctx.rng;
    const windAngle = rng.next() * Math.PI * 2;
    const windSpeed = Math.round(rng.next() * 4);
    this.wind.set(Math.cos(windAngle), Math.sin(windAngle)).multiplyScalar(windSpeed);
    for (const g of this.golfers) {
      g.pos.set(0, 0);
      g.strokes = 0;
      g.done = false;
      g.par += hole.par;
      g.ball.visible = true;
      this.placeBall(g);
    }
    // Vista do buraco inteiro
    const mid = { x: hole.hole.x / 2, z: hole.hole.z / 2 };
    this.cameraTo({ x: mid.x + 30, y: 70, z: mid.z + 50 }, { x: mid.x, y: 0, z: mid.z }, { instant: true });
    this.updateHud();
    await this.ctx.hud.banner(hole.name, { sub: `Par ${hole.par} · ${Math.round(Math.hypot(hole.hole.x, hole.hole.z))} m · vento ${windSpeed}`, hold: 2.5 });

    for (;;) {
      const next = this.golfers
        .filter((g) => !g.done)
        .sort((a, b) => this.distToHole(b) - this.distToHole(a))[0];
      if (!next) break;
      await this.shot(next);
    }
    this.updateHud();
    await this.ctx.hud.banner(`Fim do ${hole.name.split(' · ')[0]}`, {
      sub: this.golfers.map((g) => `${g.seat.name}: ${g.strokes}`).join(' · '),
      hold: 2.6,
    });
  }

  private distToHole(g: GolferState): number {
    return Math.hypot(g.pos.x - this.hole.hole.x, g.pos.y - this.hole.hole.z);
  }

  private async shot(g: GolferState): Promise<void> {
    const lie = lieAt(this.hole, g.pos.x, g.pos.y);
    const dist = this.distToHole(g);
    const club: Club = pickClub(dist, lie === 'green');
    const clubInfo = CLUBS[club];
    // Aponta para o buraco por omissão
    this.aimAngle = Math.atan2(this.hole.hole.x - g.pos.x, this.hole.hole.z - g.pos.y);
    this.aimDist = Math.min(dist, clubInfo.maxDist * LIE_POWER[lie]);

    const m = this.model(g.seat.id);
    for (const other of this.models.values()) other.root.visible = other === m;
    this.aiming = g;
    this.showAim(true);
    this.updateHud(g.seat.id);
    this.waitAll(`Vez de ${g.seat.name} ⛳`, g.seat.id);
    this.ctx.hud.hint(`${g.seat.name} · ${clubInfo.name} · ${Math.round(dist)} m · ${LIE_NAME[lie]}`, true);

    const swing = await this.ctx.seats.awaitSwing(g.seat, {
      layout: {
        kind: 'motion',
        action: 'putt',
        aim: true,
        prompt: `${clubInfo.name} · ${Math.round(dist)} m até ao buraco`,
        hint: club === 'putter' ? 'No green: gesto suave! Devagar = fraco' : 'Joystick para apontar · mais força = mais longe',
      },
      bot: () => this.botShot(g, club, lie),
      botDelay: 1.3,
    });
    this.showAim(false);
    this.aiming = null;
    this.ctx.hud.hint(null);
    this.setLayout(g.seat, { kind: 'wait', message: 'Boa tacada? 🤞' });

    m.setAnim('hit');
    await this.wait(0.25);
    m.setAnim('idle');
    g.strokes++;
    const prev = g.pos.clone();
    const result = await this.flyBall(g, swing, club, lie);
    if (result === 'in') {
      g.done = true;
      g.total += g.strokes;
      g.ball.visible = false;
      m.setAnim('cheer');
      this.ctx.seats.vibrate(g.seat, [80, 40, 80, 40, 250]);
      await this.ctx.hud.banner(holeResultName(g.strokes, this.hole.par), { sub: g.seat.name, hold: 2, color: '#ffd23f' });
      m.setAnim('idle');
    } else {
      const newLie = lieAt(this.hole, g.pos.x, g.pos.y);
      if (newLie === 'water' || newLie === 'out') {
        g.strokes++;
        m.setAnim('sad');
        await this.ctx.hud.banner(newLie === 'water' ? 'Splash! Água' : 'Fora de limites', { sub: '+1 pancada de penalização', hold: 1.8, color: '#3fd0ff' });
        m.setAnim('idle');
        g.pos.copy(prev);
        this.placeBall(g);
      } else if (newLie === 'green' && lie !== 'green') {
        await this.ctx.hud.banner('No green!', { hold: 1 });
      }
      if (g.strokes >= MAX_STROKES && !g.done) {
        g.done = true;
        g.total += g.strokes;
        g.ball.visible = false;
        await this.ctx.hud.banner(`${g.seat.name} apanha a bola`, { sub: `Máximo de ${MAX_STROKES} pancadas`, hold: 1.6 });
      }
    }
    this.updateHud();
  }

  /** Voo + rolamento. Devolve 'in' se entrou no buraco. */
  private async flyBall(g: GolferState, s: SwingInput, club: Club, lie: Lie): Promise<'in' | 'stop'> {
    const clubInfo = CLUBS[club];
    const power = club === 'putter' ? s.power ** 1.3 : s.power;
    const dist = Math.max(0.5, clubInfo.maxDist * power * LIE_POWER[lie]);
    const angle = this.aimAngle + s.dir * (club === 'putter' ? 0.05 : 0.14);
    const dir = new THREE.Vector2(Math.sin(angle), Math.cos(angle));
    const holePos = new THREE.Vector2(this.hole.hole.x, this.hole.hole.z);

    if (club !== 'putter') {
      const T = 1 + dist / 45;
      const apex = Math.min(16, dist * 0.22);
      const from = g.pos.clone();
      const to = from.clone().addScaledVector(dir, dist).addScaledVector(this.wind, T * 0.9);
      this.cameraTo({ x: from.x - dir.x * 8, y: 6, z: from.y - dir.y * 8 }, { x: to.x, y: 0, z: to.y }, { speed: 2 });
      await this.tween(T, (t) => {
        g.pos.lerpVectors(from, to, t);
        g.ball.position.set(g.pos.x, BALL_R + Math.sin(t * Math.PI) * apex, g.pos.y);
      }, ease.linear);
      if (g.pos.distanceTo(holePos) < 0.6) return this.dropIn(g);
      const landLie = lieAt(this.hole, g.pos.x, g.pos.y);
      if (landLie === 'water' || landLie === 'out' || landLie === 'bunker') return 'stop';
      // Rola um pouco
      const roll = dist * (landLie === 'green' ? 0.08 : landLie === 'fairway' ? 0.12 : 0.04);
      return this.roll(g, dir, Math.sqrt(2 * DECEL[landLie] * roll), holePos);
    }
    this.cameraTo({ x: g.pos.x - dir.x * 5, y: 3, z: g.pos.y - dir.y * 5 }, { x: g.pos.x + dir.x * 6, y: 0, z: g.pos.y + dir.y * 6 }, { speed: 2.5 });
    return this.roll(g, dir, Math.sqrt(2 * DECEL[lie] * dist), holePos);
  }

  /** Rola com atrito; pode cair no buraco se passar perto e devagar. */
  private async roll(g: GolferState, dir: THREE.Vector2, speed: number, holePos: THREE.Vector2): Promise<'in' | 'stop'> {
    let v = speed;
    while (v > 0.05) {
      await this.wait(1 / 60);
      const lie = lieAt(this.hole, g.pos.x, g.pos.y);
      g.pos.addScaledVector(dir, v / 60);
      v -= DECEL[lie] / 60;
      this.placeBall(g);
      // Cai se passar mesmo por cima do buraco e não vier demasiado depressa.
      if (g.pos.distanceTo(holePos) < 0.28 && v < 4.5) return this.dropIn(g);
      if (lie === 'water' || lie === 'out' || lie === 'bunker') break;
    }
    return 'stop';
  }

  private async dropIn(g: GolferState): Promise<'in'> {
    const y = g.ball.position.y;
    g.pos.set(this.hole.hole.x, this.hole.hole.z);
    await this.tween(0.25, (t) => g.ball.position.set(g.pos.x, y - t * 0.4, g.pos.y));
    return 'in';
  }

  private botShot(g: GolferState, club: Club, lie: Lie): SwingInput {
    const rng = this.ctx.rng;
    const max = CLUBS[club].maxDist * LIE_POWER[lie];
    const holePos = new THREE.Vector2(this.hole.hole.x, this.hole.hole.z);
    let target = holePos;
    if (club !== 'putter' && g.pos.distanceTo(holePos) > max * 0.95) {
      // Segue o fairway: o ponto mais avançado ao alcance.
      const nearest = this.path.reduce((bi, p, i) => (p.distanceTo(g.pos) < this.path[bi]!.distanceTo(g.pos) ? i : bi), 0);
      for (let i = nearest; i < this.path.length; i++) if (this.path[i]!.distanceTo(g.pos) <= max * 0.85) target = this.path[i]!;
    }
    const sloppy = 1.6 - this.ctx.botSkill * 1.2; // 0,44 (mestre) … 1,18 (fácil)
    this.aimAngle = Math.atan2(target.x - g.pos.x, target.y - g.pos.y) + (rng.next() - 0.5) * 0.08 * sloppy;
    const want = g.pos.distanceTo(target);
    let power = want / max;
    if (club === 'putter') power = Math.pow(Math.min(1, (want * 1.05) / max), 1 / 1.3);
    power = Math.max(0.05, Math.min(1, power * (1 + (rng.next() - 0.5) * 0.18 * sloppy)));
    return { t: 'swing', power, dir: (rng.next() - 0.5) * 0.4, spin: 0, source: 'key' };
  }

  // ── Por frame ───────────────────────────────────────────

  protected override tick(dt: number, time: number): void {
    const g = this.aiming;
    if (!g) return;
    const pad = this.ctx.seats.pad(g.seat);
    this.aimAngle -= pad.stick.x * dt * 1.1;
    const dir = new THREE.Vector2(Math.sin(this.aimAngle), Math.cos(this.aimAngle));
    const back = g.pos.clone().addScaledVector(dir, -1);
    const lie = lieAt(this.hole, g.pos.x, g.pos.y);
    const putting = lie === 'green';
    this.cameraTo(
      { x: g.pos.x - dir.x * (putting ? 5.5 : 10), y: putting ? 3 : 6, z: g.pos.y - dir.y * (putting ? 5.5 : 10) },
      { x: g.pos.x + dir.x * (putting ? 5 : 16), y: 0, z: g.pos.y + dir.y * (putting ? 5 : 16) },
      { speed: 6 },
    );
    const m = this.model(g.seat.id);
    m.root.position.set(back.x + dir.y * 1.1, 0, back.y - dir.x * 1.1);
    m.faceYaw(this.aimAngle - Math.PI / 2);
    this.aimArrow.position.set(g.pos.x, 0.08, g.pos.y);
    this.aimArrow.rotation.y = this.aimAngle + Math.PI;
    this.aimArrow.scale.set(1, 1, this.aimDist);
    this.aimRing.position.set(g.pos.x + dir.x * this.aimDist, 0.1, g.pos.y + dir.y * this.aimDist);
    (this.aimRing.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(time * 5) * 0.3;
  }

  private showAim(v: boolean): void {
    this.aimArrow.visible = v;
    this.aimRing.visible = v;
  }

  private placeBall(g: GolferState): void {
    g.ball.position.set(g.pos.x, BALL_R + 0.05, g.pos.y);
  }

  private updateHud(activeId?: string): void {
    const windDir = Math.round(((Math.atan2(this.wind.x, -this.wind.y) * 180) / Math.PI + 360) % 360);
    const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    this.ctx.hud.setRound(
      `${this.hole.name.split(' · ')[0]} · Par ${this.hole.par} · Vento ${this.wind.length() < 0.5 ? '—' : `${arrows[Math.round(windDir / 45) % 8]} ${Math.round(this.wind.length())}`}`,
    );
    this.scoreboard(
      this.golfers.map((g) => ({
        id: g.seat.id,
        // Total face ao par só conta buracos acabados; o número é das pancadas neste buraco.
        text: `${g.done ? '✔' : `🏌 ${g.strokes}`} · ${relativeToPar(g.total, g.par - (g.done ? 0 : this.hole.par))}`,
        active: g.seat.id === activeId,
      })),
    );
  }

  // ── Cenário ─────────────────────────────────────────────

  private buildHole(hole: GolfHole, index: number): void {
    for (const c of [...this.holeGroup.children]) {
      this.holeGroup.remove(c);
      disposeObject(c);
    }
    const g = this.holeGroup;
    const flat = (geo: THREE.BufferGeometry, color: string, y: number, extra: THREE.MeshToonMaterialParameters = {}) => {
      const m = mesh(geo, toonUnique(color, extra), { cast: false, receive: true });
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      g.add(m);
      return m;
    };
    const ground = flat(new THREE.PlaneGeometry(400, 400), '#4f9a45', 0);
    ground.position.set(0, 0, -100);

    // Fairway: segmentos + círculos nas juntas
    this.path = [];
    for (let i = 0; i < hole.fairway.length - 1; i++) {
      const a = hole.fairway[i]!;
      const b = hole.fairway[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const seg = flat(new THREE.PlaneGeometry(hole.fairwayWidth, len), '#78c95e', 0.02);
      seg.position.x = (a.x + b.x) / 2;
      seg.position.z = (a.z + b.z) / 2;
      seg.rotation.z = Math.atan2(b.x - a.x, b.z - a.z);
      const joint = flat(new THREE.CircleGeometry(hole.fairwayWidth / 2, 24), '#78c95e', 0.02);
      joint.position.set(a.x, 0.02, a.z);
      for (let d = 0; d < len; d += 2) {
        this.path.push(new THREE.Vector2(a.x + ((b.x - a.x) * d) / len, a.z + ((b.z - a.z) * d) / len));
      }
    }
    this.path.push(new THREE.Vector2(hole.hole.x, hole.hole.z));
    const green = flat(new THREE.CircleGeometry(hole.greenRadius, 40), '#93e070', 0.04);
    green.position.set(hole.hole.x, 0.04, hole.hole.z);
    for (const b of hole.bunkers) {
      const s = flat(new THREE.CircleGeometry(b.r, 28), '#f2d58b', 0.05);
      s.position.set(b.x, 0.05, b.z);
    }
    for (const w of hole.water) {
      const water = flat(new THREE.CircleGeometry(w.r, 36), '#2fa8e0', 0.06, { transparent: true, opacity: 0.9 });
      water.position.set(w.x, 0.06, w.z);
    }
    // Tee
    const tee = mesh(new THREE.BoxGeometry(4, 0.1, 4), toon('#6fbf55'), { cast: false, receive: true });
    tee.position.set(0, 0.03, 0);
    g.add(tee);
    // Buraco e bandeira
    const cup = flat(new THREE.CircleGeometry(0.22, 20), '#1b1033', 0.045);
    cup.position.set(hole.hole.x, 0.045, hole.hole.z);
    const pole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2), toon('#ffffff'));
    pole.position.set(hole.hole.x, 1.6, hole.hole.z);
    const flag = mesh(new THREE.PlaneGeometry(1.1, 0.7), toonUnique('#ff3b5c', { side: THREE.DoubleSide }));
    flag.position.set(hole.hole.x + 0.55, 2.8, hole.hole.z);
    g.add(pole, flag);

    // Árvores no rough, longe do fairway e do green
    const rng = createRng(500 + index);
    for (let i = 0, placed = 0; i < 600 && placed < 70; i++) {
      const x = (rng.next() - 0.5) * 120;
      const z = 15 - rng.next() * (Math.abs(hole.hole.z) + 40);
      const lie = lieAt(hole, x, z);
      if (lie !== 'rough' && lie !== 'out') continue;
      if (Math.hypot(x - hole.hole.x, z - hole.hole.z) < hole.greenRadius + 4) continue;
      if (Math.hypot(x, z) < 6) continue;
      const tree = rng.next() < 0.6 ? palmTree(rng, 1 + rng.next() * 0.6) : bush(rng);
      tree.position.set(x, 0, z);
      g.add(tree);
      placed++;
    }
  }

  override dispose(): void {
    for (const gs of this.golfers) gs.ball.geometry.dispose();
    super.dispose();
  }
}
