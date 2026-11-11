/**
 * Golfe 3D: buracos com relevo, fairway, green inclinado, lagos, bunkers e vento.
 *
 *  - O telemóvel escolhe o taco (Driver … Putter); a área onde a bola cai e a trajetória
 *    aparecem no campo. Aponta-se com o joystick.
 *  - Medidor de força (zona vermelha = mais longe mas menos preciso), topspin/backspin ao parar,
 *    curva e altura com o joystick; ou balançar o telemóvel como um taco.
 *  - A bola segue a simulação de @festa/game (voo, ressaltos, efeito, rolar com inclinação).
 *  - Caddie com dicas (taco, vento, inclinação do green, perigos). Joga primeiro quem está mais longe.
 */
import { sound } from '../../audio/Sound';
import * as THREE from 'three';
import { CHARACTERS, createRng, getCharacter } from '@festa/game';
import {
  CLUBS,
  CLUB_ORDER,
  COURSE,
  LIE_POWER,
  MAX_STROKES,
  gradientAt,
  heightAt,
  holeResultName,
  lieAt,
  pickClub,
  planShot,
  redZoneError,
  relativeToPar,
  simulateShot,
  type Club,
  type GolfHole,
  type Lie,
  type Shot,
  type ShotResult,
} from '@festa/game/sports/golf';
import { CharacterModel } from '../../three/CharacterModel';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../../three/materials';
import { bush, palmTree } from '../../stages/environment';
import { PROPS, pickProp } from '../../three/props';
import { SportStage } from '../SportStage';
import { GolfMiniMap } from './miniMap';
import { rankBy, type SportContext, type SportStanding } from '../types';
import type { Seat } from '../../game/Seats';

const BALL_R = 0.12;
const LIE_NAME: Record<Lie, string> = { green: 'green', fairway: 'fairway', rough: 'relva alta', bunker: 'bunker', water: 'água', out: 'fora' };
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

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
  /** Mini-mapa do buraco com a previsão da tacada (como no Mario Golf). */
  private readonly miniMap = new GolfMiniMap();
  private readonly holeGroup = new THREE.Group();
  private readonly dots: THREE.Mesh[] = [];
  private readonly landRing: THREE.Mesh;
  private landLabel: THREE.Sprite | null = null;
  private readonly club3d: THREE.Group;
  private readonly caddie: CharacterModel;
  private caddieBubble: THREE.Sprite | null = null;
  private readonly course: GolfHole[];
  private hole: GolfHole = COURSE[0]!;
  private wind = new THREE.Vector2();
  private aimAngle = 0;
  private aiming: GolferState | null = null;
  private aimLocked = false;
  private club: Club = 'driver';
  private botAim: number | null = null;
  private previewAt = 0;
  private path: THREE.Vector2[] = [];
  private meter: { el: HTMLElement; fill: HTMLElement; t: number; max: number; period: number; running: boolean } | null = null;

  constructor(ctx: SportContext) {
    super(ctx);
    this.course = ctx.players.length <= 3 ? COURSE : COURSE.slice(0, 3);
    this.scene.add(this.holeGroup);
    const dotMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });
    for (let i = 0; i < 18; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), dotMat);
      d.visible = false;
      this.scene.add(d);
      this.dots.push(d);
    }
    this.landRing = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 40),
      new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.landRing.rotation.x = -Math.PI / 2;
    this.landRing.visible = false;
    this.scene.add(this.landRing);

    // Taco de golfe (vai para a mão de quem joga).
    this.club3d = new THREE.Group();
    const shaft = mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.1, 8), toon('#c0c6d0'));
    shaft.position.y = -0.45;
    const head = mesh(new THREE.BoxGeometry(0.1, 0.08, 0.2), toon('#4a4f58'));
    head.position.set(0, -1.0, 0.06);
    this.club3d.add(shaft, head);

    // Caddie
    const used = new Set(ctx.players.map((p) => p.characterId));
    this.caddie = new CharacterModel(CHARACTERS.find((c) => !used.has(c.id)) ?? CHARACTERS[0]!);
    this.caddie.root.scale.setScalar(0.85);
    const bag = mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.9, 12), toonUnique('#d9434a'));
    bag.position.set(-0.35, 0.55, -0.25);
    bag.rotation.z = 0.25;
    this.caddie.root.add(bag);
    this.scene.add(this.caddie.root);

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
    for (let h = 0; h < this.course.length; h++) await this.playHole(this.course[h]!, h);
    this.ctx.hud.setRound(null);
    const ranked = rankBy(this.golfers, (g) => g.total, false);
    return ranked.map((g) => ({ id: g.seat.id, rank: g.rank, score: `${g.total} pancadas (${relativeToPar(g.total, g.par)})` }));
  }

  // ── Buraco ──────────────────────────────────────────────

  private async playHole(hole: GolfHole, index: number): Promise<void> {
    this.hole = hole;
    this.buildHole(hole, index);
    this.miniMap.setHole(hole);
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
    // Voo sobre o buraco, do green até ao tee.
    const mid = { x: hole.hole.x / 2, z: hole.hole.z / 2 };
    this.cameraTo({ x: hole.hole.x + 20, y: 45, z: hole.hole.z - 25 }, { x: hole.hole.x, y: 0, z: hole.hole.z }, { instant: true });
    this.cameraTo({ x: mid.x + 35, y: 70, z: mid.z + 55 }, { x: mid.x, y: 0, z: mid.z }, { speed: 0.6 });
    this.updateHud();
    await this.ctx.hud.banner(hole.name, { sub: `Par ${hole.par} · ${Math.round(Math.hypot(hole.hole.x, hole.hole.z))} m · vento ${windSpeed}`, hold: 2.8 });

    for (;;) {
      const next = this.golfers.filter((g) => !g.done).sort((a, b) => this.distToHole(b) - this.distToHole(a))[0];
      if (!next) break;
      await this.shot(next);
    }
    this.updateHud();
    await this.ctx.hud.banner(`Fim do ${hole.name.split(' · ')[0]}`, { sub: this.golfers.map((g) => `${g.seat.name}: ${g.strokes}`).join(' · '), hold: 2.6 });
  }

  private distToHole(g: GolferState): number {
    return Math.hypot(g.pos.x - this.hole.hole.x, g.pos.y - this.hole.hole.z);
  }

  /** Para onde apontar: o buraco, ou o ponto do fairway mais avançado ao alcance. */
  private targetFor(g: GolferState, reach: number): THREE.Vector2 {
    const holePos = new THREE.Vector2(this.hole.hole.x, this.hole.hole.z);
    if (g.pos.distanceTo(holePos) <= reach * 1.02) return holePos;
    const nearest = this.path.reduce((bi, p, i) => (p.distanceTo(g.pos) < this.path[bi]!.distanceTo(g.pos) ? i : bi), 0);
    let target = this.path[Math.min(this.path.length - 1, nearest + 1)]!;
    for (let i = nearest; i < this.path.length; i++) if (this.path[i]!.distanceTo(g.pos) <= reach * 0.9) target = this.path[i]!;
    return target;
  }

  private async shot(g: GolferState): Promise<void> {
    const lie = lieAt(this.hole, g.pos.x, g.pos.y);
    const dist = this.distToHole(g);
    const onGreen = lie === 'green';
    const longest = CLUBS.driver.carry * LIE_POWER[lie];
    const target = this.targetFor(g, longest);
    this.club = pickClub(g.pos.distanceTo(target), onGreen, lie);
    this.aimAngle = Math.atan2(target.x - g.pos.x, target.y - g.pos.y);

    const m = this.model(g.seat.id);
    for (const other of this.models.values()) other.root.visible = other === m;
    this.club3d.removeFromParent();
    this.club3d.scale.setScalar(1);
    this.club3d.position.set(0, 0, 0);
    m.attach(this.club3d, 'right');
    m.setAnim('idle');
    this.aiming = g;
    this.aimLocked = false;
    this.previewAt = 0;
    this.updateHud(g.seat.id);
    this.waitAll(`Vez de ${g.seat.name} ⛳`, g.seat.id);
    const tip = this.caddieTip(g, lie, dist);
    this.ctx.hud.hint(`🧢 ${tip}`, true);
    this.say(CLUBS[this.club].name);

    // Bots: escolhem o taco e calculam a tacada; o ecrã mostra-os a apontar.
    const auto = this.ctx.seats.isAuto(g.seat);
    let botShot: Shot | null = null;
    if (auto) {
      const t = this.targetFor(g, CLUBS[this.club].carry * LIE_POWER[lie]);
      const aimAt = onGreen || t.distanceTo(new THREE.Vector2(this.hole.hole.x, this.hole.hole.z)) < 0.5 ? { x: this.hole.hole.x, z: this.hole.hole.z } : { x: t.x, z: t.y };
      botShot = planShot(this.hole, { x: g.pos.x, z: g.pos.y }, aimAt, this.club, { x: this.wind.x, z: this.wind.y });
      const skill = this.ctx.botSkill;
      const rng = this.ctx.rng;
      const gauss = () => rng.next() + rng.next() + rng.next() - 1.5;
      botShot.angle += gauss() * (1 - skill) * (onGreen ? 0.1 : 0.15);
      botShot.power = Math.max(0.05, Math.min(1, botShot.power * (1 + gauss() * (1 - skill) * (onGreen ? 0.32 : 0.18))));
      this.botAim = botShot.angle;
    }
    const clubs = onGreen ? (['putter', 'wedge'] as Club[]) : dist < 18 ? CLUB_ORDER : CLUB_ORDER.filter((c) => c !== 'putter');
    const swing = await this.meterSwing(g, clubs, dist, lie, tip, botShot);
    this.botAim = null;
    if (botShot) this.aimAngle = botShot.angle;
    this.aiming = null;
    this.showPreview(false);
    this.ctx.hud.hint(null, true);
    this.setLayout(g.seat, { kind: 'wait', message: 'Boa tacada? 🤞' });

    const rng = this.ctx.rng;
    const err = redZoneError(swing.power, rng.next(), rng.next());
    const shot: Shot = {
      club: this.club,
      angle: this.aimAngle + err.angle,
      power: swing.power,
      curve: Math.max(-1, Math.min(1, swing.dir + err.curve)),
      loft: swing.loft ?? 0,
      spin: Math.sign(swing.spin),
    };
    if (swing.power > 1) this.say('Força máxima!');
    m.setAnim('batSwing');
    sound.play('whoosh', { vol: 0.6 });
    void this.wait(0.3).then(() => sound.play('ball', { pitch: this.club === 'putter' ? 0.6 : 1.1 }));
    await this.wait(0.35);
    g.strokes++;
    const prev = g.pos.clone();
    const result = simulateShot(this.hole, { x: g.pos.x, z: g.pos.y }, shot, { x: this.wind.x, z: this.wind.y });
    await this.animateShot(g, result, shot);
    m.setAnim('idle');
    this.club3d.removeFromParent();

    if (result.holed) {
      sound.play('ball', { pitch: 0.5 });
      sound.play('cheer');
      g.done = true;
      g.total += g.strokes;
      g.ball.visible = false;
      m.setAnim('cheer');
      this.caddie.setAnim('cheer');
      this.ctx.seats.vibrate(g.seat, [80, 40, 80, 40, 250]);
      await this.ctx.hud.banner(holeResultName(g.strokes, this.hole.par), { sub: g.seat.name, hold: 2, color: '#ffd23f' });
      m.setAnim('idle');
      this.caddie.setAnim('idle');
    } else {
      const newLie = result.lie;
      if (newLie === 'water' || newLie === 'out') {
        if (newLie === 'water') sound.play('splash');
        this.ctx.seats.vibrate(g.seat, [100, 50, 100]);
        sound.play('aww', { vol: 0.5 });
        g.strokes++;
        m.setAnim('sad');
        await this.ctx.hud.banner(newLie === 'water' ? 'Splash! Água' : 'Fora de limites', { sub: '+1 pancada de penalização', hold: 1.8, color: '#3fd0ff' });
        m.setAnim('idle');
        g.pos.copy(prev);
        this.placeBall(g);
      } else if (newLie === 'green' && lie !== 'green') {
        await this.ctx.hud.banner('No green!', { sub: `A ${Math.round(this.distToHole(g))} m do buraco`, hold: 1.1 });
      } else if (newLie === 'bunker') {
        await this.ctx.hud.banner('Bunker!', { hold: 1 });
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

  /**
   * Tacada com botões: X/Y mudam de taco, A começa o medidor (no ecrã grande) e A/X/Y param-no
   * (normal, topspin, backspin). Com o medidor a andar, o joystick dá curva e altura.
   */
  private meterSwing(g: GolferState, clubs: Club[], dist: number, lie: Lie, tip: string, botShot: Shot | null): Promise<{ power: number; dir: number; spin: number; loft: number }> {
    const seat = g.seat;
    const aimLayout = () => {
      const i = clubs.indexOf(this.club);
      this.setLayout(seat, {
        kind: 'pad',
        color: getCharacter(seat.characterId).color,
        title: `${CLUBS[this.club].name} · ${Math.round(dist)} m até ao buraco`,
        sub: `${LIE_NAME[lie]} · ${tip.replace(/^Caddie: /, '')}`,
        stick: 'stick',
        stickLabel: 'Apontar',
        buttons: {
          a: 'Tacada!',
          x: i > 0 ? `◀ ${CLUBS[clubs[i - 1]!].name}` : undefined,
          y: i < clubs.length - 1 ? `${CLUBS[clubs[i + 1]!].name} ▶` : undefined,
          plus: 'Menu',
        },
      });
    };
    if (!clubs.includes(this.club)) this.club = clubs[0]!;
    aimLayout();
    return new Promise((resolve) => {
      let phase = 'aim' as 'aim' | 'meter' | 'done';
      const finish = (r: { power: number; dir: number; spin: number; loft: number }) => {
        if (phase === 'done') return;
        phase = 'done';
        off();
        this.hideMeter();
        resolve(r);
      };
      const stop = (spin: number) => {
        const m = this.meter!;
        const v = this.meterValue(Math.max(0, m.t - 0.05));
        const pad = this.ctx.seats.pad(seat);
        const putt = this.club === 'putter';
        sound.play('click');
        this.ctx.seats.vibrate(seat, v > 1 ? [40, 30, 80] : 40);
        finish({ power: Math.max(0.03, v), dir: putt ? 0 : pad.stick.x, spin: putt ? 0 : spin, loft: putt ? 0 : -pad.stick.y });
      };
      const off = this.ctx.hub.events.on('press', ({ player, button }) => {
        if (player.id !== seat.id || this.ctx.seats.menus.blocked) return;
        if (phase === 'aim') {
          const i = clubs.indexOf(this.club);
          if ((button === 'x' && i > 0) || (button === 'y' && i < clubs.length - 1)) {
            this.club = clubs[i + (button === 'x' ? -1 : 1)]!;
            this.previewAt = 0;
            this.say(CLUBS[this.club].name);
            sound.play('tick');
            aimLayout();
          } else if (button === 'a') {
            phase = 'meter';
            this.aimLocked = true;
            this.showMeter();
            sound.play('whoosh', { vol: 0.4 });
            this.setLayout(seat, {
              kind: 'pad',
              color: getCharacter(seat.characterId).color,
              title: 'Para o medidor!',
              sub: this.club === 'putter' ? 'A para parar' : 'A normal · X topspin (rola mais) · Y backspin (trava)',
              stick: 'stick',
              stickLabel: this.club === 'putter' ? '' : 'Curva ↔ · Altura ↕',
              buttons: { a: 'Parar', x: this.club === 'putter' ? undefined : 'Topspin', y: this.club === 'putter' ? undefined : 'Backspin' },
            });
          }
        } else if (phase === 'meter') {
          if (button === 'a') stop(0);
          else if (button === 'x' && this.club !== 'putter') stop(1);
          else if (button === 'y' && this.club !== 'putter') stop(-1);
        }
      });
      // Bots (e quem se desligar) e medidor que chegou ao fim.
      void (async () => {
        let waited = 0;
        while (phase !== 'done') {
          await this.wait(0.05);
          if (phase === 'meter' && this.meter && this.meter.t >= this.meter.period * 2) finish({ power: 0.03, dir: 0, spin: 0, loft: 0 });
          waited = this.ctx.seats.isAuto(seat) ? waited + 0.05 : 0;
          if (waited >= 2 && botShot) finish({ power: botShot.power, dir: 0, spin: 0, loft: 0 });
        }
      })();
    });
  }

  private meterValue(t: number): number {
    const m = this.meter;
    if (!m) return 0;
    const k = t / m.period;
    return k <= 1 ? k * m.max : Math.max(0, (2 - k) * m.max);
  }

  private showMeter(): void {
    this.hideMeter();
    const putt = this.club === 'putter';
    const max = putt ? 1 : 1.1;
    const el = document.createElement('div');
    el.className = 'golf-meter';
    el.innerHTML = `<div class="gm-bar"><div class="gm-red" style="height:${putt ? 0 : ((max - 1) / max) * 100}%"></div><div class="gm-mark" style="bottom:${(1 / max) * 100}%"></div><div class="gm-fill"></div></div><div class="gm-val">0%</div><div class="gm-club">${CLUBS[this.club].name}</div>`;
    document.getElementById('ui')!.appendChild(el);
    this.meter = { el, fill: el.querySelector<HTMLElement>('.gm-fill')!, t: 0, max, period: putt ? 1.7 : 1.3, running: true };
  }

  private hideMeter(): void {
    if (!this.meter) return;
    const el = this.meter.el;
    this.meter.running = false;
    setTimeout(() => el.remove(), 700);
    this.meter = null;
  }

  /** Mostra a bola a seguir a simulação, com a câmara a acompanhar. */
  private async animateShot(g: GolferState, r: ShotResult, shot: Shot): Promise<void> {
    const s = r.samples;
    const end = s[s.length - 1]!.t;
    const putt = shot.club === 'putter';
    const dir = new THREE.Vector2(Math.sin(shot.angle), Math.cos(shot.angle));
    const start = g.pos.clone();
    let idx = 0;
    await this.tween(end, (k) => {
      const t = k * end;
      while (idx < s.length - 1 && s[idx + 1]!.t < t) idx++;
      const a = s[idx]!;
      const b = s[Math.min(s.length - 1, idx + 1)]!;
      const q = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
      const x = a.x + (b.x - a.x) * q;
      const y = a.y + (b.y - a.y) * q;
      const z = a.z + (b.z - a.z) * q;
      g.pos.set(x, z);
      g.ball.position.set(x, y + BALL_R, z);
      if (putt) {
        this.cameraTo({ x: start.x - dir.x * 4, y: heightAt(this.hole, start.x, start.y) + 2.4, z: start.y - dir.y * 4 }, { x, y, z }, { speed: 3 });
      } else if (t < r.landT) {
        this.cameraTo({ x: x - dir.x * 14, y: y + 7, z: z - dir.y * 14 }, { x: x + dir.x * 6, y: y * 0.5, z: z + dir.y * 6 }, { speed: 2.5 });
      } else {
        this.cameraTo({ x: x - dir.x * 9 + 3, y: y + 5, z: z - dir.y * 9 }, { x, y, z }, { speed: 2 });
      }
    });
    const last = s[s.length - 1]!;
    g.pos.set(last.x, last.z);
    if (r.holed) {
      await this.tween(0.25, (k) => g.ball.position.set(last.x, last.y + BALL_R - k * 0.4, last.z));
    } else this.placeBall(g);
  }

  /** Dica do caddie: taco, vento, sítio da bola, inclinação do green e perigos. */
  private caddieTip(g: GolferState, lie: Lie, dist: number): string {
    const parts: string[] = [];
    const spec = CLUBS[this.club];
    if (lie === 'green') {
      const hx = this.hole.hole.x;
      const hz = this.hole.hole.z;
      const mx = (g.pos.x + hx) / 2;
      const mz = (g.pos.y + hz) / 2;
      const grad = gradientAt(this.hole, mx, mz);
      const dx = hx - g.pos.x;
      const dz = hz - g.pos.y;
      const len = Math.hypot(dx, dz) || 1;
      const along = (grad.x * dx + grad.z * dz) / len; // > 0: a subir
      const right = (grad.x * dz - grad.z * dx) / len; // > 0: sobe para a direita → cai para a esquerda
      parts.push(`${Math.round(dist * 10) / 10} m.`);
      if (Math.abs(right) > 0.008) parts.push(`O green cai para a ${right > 0 ? 'esquerda' : 'direita'}: aponta um pouco para a ${right > 0 ? 'direita' : 'esquerda'}.`);
      if (Math.abs(along) > 0.008) parts.push(along > 0 ? 'Está a subir: dá mais força.' : 'Está a descer: devagarinho!');
    } else {
      parts.push(`${spec.name} chega a ~${Math.round(spec.carry * LIE_POWER[lie])} m (faltam ${Math.round(dist)} m).`);
      if (lie === 'rough') parts.push('Relva alta: perdes força.');
      if (lie === 'bunker') parts.push('Bunker: wedge e com força!');
      const w = this.wind.length();
      if (w >= 1) {
        const dir = new THREE.Vector2(Math.sin(this.aimAngle), Math.cos(this.aimAngle));
        const side = this.wind.x * dir.y - this.wind.y * dir.x; // > 0: empurra para a direita
        const head = this.wind.dot(dir);
        if (Math.abs(side) > 0.6) parts.push(`Vento empurra para a ${side > 0 ? 'direita' : 'esquerda'}.`);
        else if (head < -0.6) parts.push('Vento contra: leva mais taco.');
        else if (head > 0.6) parts.push('Vento a favor!');
      }
      // Água na linha de tiro?
      for (const wtr of this.hole.water) {
        const vx = wtr.x - g.pos.x;
        const vz = wtr.z - g.pos.y;
        const dir = new THREE.Vector2(Math.sin(this.aimAngle), Math.cos(this.aimAngle));
        const along = vx * dir.x + vz * dir.y;
        const off = Math.abs(vx * dir.y - vz * dir.x);
        if (along > 0 && along < spec.carry * 1.1 && off < wtr.r + 3) {
          parts.push('Cuidado com a água!');
          break;
        }
      }
    }
    return `Caddie: ${parts.join(' ')}`;
  }

  // ── Por frame ───────────────────────────────────────────

  protected override tick(dt: number, time: number): void {
    if (this.meter?.running) {
      const m = this.meter;
      m.t += dt;
      const v = this.meterValue(m.t);
      m.fill.style.height = `${(v / m.max) * 100}%`;
      m.fill.classList.toggle('over', v > 1);
      m.el.querySelector('.gm-val')!.textContent = `${Math.round(v * 100)}%`;
    }
    this.caddie.update(dt);
    const g = this.aiming;
    if (!g) return;
    const pad = this.ctx.seats.pad(g.seat);
    if (this.botAim !== null) this.aimAngle += (this.botAim - this.aimAngle) * Math.min(1, dt * 2);
    else if (!this.aimLocked) this.aimAngle -= pad.stick.x * dt * (this.club === 'putter' ? 0.5 : 0.9);
    const dir = new THREE.Vector2(Math.sin(this.aimAngle), Math.cos(this.aimAngle));
    const putting = this.club === 'putter';
    const gy = heightAt(this.hole, g.pos.x, g.pos.y);
    const look = putting ? Math.min(8, this.distToHole(g) + 1) : Math.min(CLUBS[this.club].carry * 0.35, 18);
    this.cameraTo(
      { x: g.pos.x - dir.x * (putting ? 5.5 : 7.5) - dir.y * 1.2, y: gy + (putting ? 3 : 3.2), z: g.pos.y - dir.y * (putting ? 5.5 : 7.5) + dir.x * 1.2 },
      { x: g.pos.x + dir.x * look, y: gy, z: g.pos.y + dir.y * look },
      { speed: 5 },
    );
    // Golfista ao lado da bola, de frente para ela; caddie atrás.
    const m = this.model(g.seat.id);
    const side = new THREE.Vector2(dir.y, -dir.x);
    const mx = g.pos.x - side.x * 0.9 - dir.x * 0.2;
    const mz = g.pos.y - side.y * 0.9 - dir.y * 0.2;
    m.root.position.set(mx, heightAt(this.hole, mx, mz), mz);
    m.faceYaw(Math.atan2(side.x, side.y));
    const cx = g.pos.x + dir.x * 0.6 + side.x * 2.4;
    const cz = g.pos.y + dir.y * 0.6 + side.y * 2.4;
    this.caddie.root.position.set(cx, heightAt(this.hole, cx, cz), cz);
    this.caddie.faceYaw(Math.atan2(-side.x, -side.y));
    if (this.caddieBubble) this.caddieBubble.position.set(cx, this.caddie.root.position.y + 2.6, cz);

    if (time - this.previewAt > 0.12) {
      this.previewAt = time;
      this.updatePreview(g);
    }
    (this.landRing.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(time * 5) * 0.25;
  }

  /** Trajetória e área de queda do taco escolhido (força 100 %, sem vento nem curva). */
  private updatePreview(g: GolferState): void {
    const putt = this.club === 'putter';
    let power = 1;
    if (putt) power = Math.min(1, Math.pow(this.distToHole(g) / CLUBS.putter.carry, 1 / 1.3));
    const r = simulateShot(this.hole, { x: g.pos.x, z: g.pos.y }, { club: this.club, angle: this.aimAngle, power, curve: 0, loft: 0, spin: 0 }, { x: 0, z: 0 });
    const s = r.samples;
    const upto = putt ? Math.max(2, Math.floor(s.length * 0.45)) : Math.max(2, s.findIndex((p) => p.t >= r.landT));
    this.dots.forEach((d, i) => {
      const p = s[Math.min(upto, Math.floor(((i + 1) / this.dots.length) * upto))]!;
      d.visible = true;
      d.position.set(p.x, p.y + (putt ? 0.08 : BALL_R), p.z);
      d.scale.setScalar(putt ? 0.5 : 1);
    });
    const land = s[upto]!;
    this.landRing.visible = !putt;
    const rad = Math.max(1.2, CLUBS[this.club].carry * 0.07);
    this.landRing.scale.setScalar(rad);
    this.landRing.position.set(land.x, land.y + 0.12, land.z);
    if (this.landLabel) {
      this.scene.remove(this.landLabel);
      disposeObject(this.landLabel);
      this.landLabel = null;
    }
    if (!putt) {
      this.landLabel = textSprite(`${CLUBS[this.club].name} · ${Math.round(Math.hypot(land.x - g.pos.x, land.z - g.pos.y))} m`, { height: Math.max(1, rad * 0.6), color: '#ffd23f', stroke: '#1d1433' });
      this.landLabel.position.set(land.x, land.y + rad * 0.9 + 1, land.z);
      this.scene.add(this.landLabel);
    }
    // Mini-mapa: bola, pontaria, trajetória e queda com o taco atual.
    const step = Math.max(1, Math.floor(upto / 14));
    const path: { x: number; z: number }[] = [];
    for (let i = step; i < upto; i += step) path.push({ x: s[i]!.x, z: s[i]!.z });
    this.miniMap.update({
      ball: { x: g.pos.x, z: g.pos.y },
      others: this.golfers.filter((o) => o !== g && !o.done).map((o) => ({ pos: { x: o.pos.x, z: o.pos.y }, color: getCharacter(o.seat.characterId).color })),
      aim: this.aimAngle,
      path,
      landing: { x: land.x, z: land.z },
      landingR: putt ? 0.8 : rad,
      label: `${CLUBS[this.club].name} · ${Math.round(Math.hypot(land.x - g.pos.x, land.z - g.pos.y))} m`,
    });
    this.miniMap.show(true);
  }

  private showPreview(v: boolean): void {
    if (!v) this.miniMap.show(false);
    for (const d of this.dots) d.visible = v;
    this.landRing.visible = v;
    if (!v && this.landLabel) {
      this.scene.remove(this.landLabel);
      disposeObject(this.landLabel);
      this.landLabel = null;
    }
  }

  /** Balão do caddie. */
  private say(text: string): void {
    if (this.caddieBubble) {
      this.scene.remove(this.caddieBubble);
      disposeObject(this.caddieBubble);
    }
    this.caddieBubble = textSprite(`💬 ${text}`, { height: 0.32, color: '#ffffff', stroke: '#1d1433' });
    const p = this.caddie.root.position;
    this.caddieBubble.position.set(p.x, p.y + 2.6, p.z);
    this.scene.add(this.caddieBubble);
  }

  private placeBall(g: GolferState): void {
    g.ball.position.set(g.pos.x, heightAt(this.hole, g.pos.x, g.pos.y) + BALL_R + 0.03, g.pos.y);
  }

  private updateHud(activeId?: string): void {
    const windDir = Math.round(((Math.atan2(this.wind.x, -this.wind.y) * 180) / Math.PI + 360) % 360);
    this.ctx.hud.setRound(
      `${this.hole.name.split(' · ')[0]} · Par ${this.hole.par} · Vento ${this.wind.length() < 0.5 ? '—' : `${ARROWS[Math.round(windDir / 45) % 8]} ${Math.round(this.wind.length())}`}`,
    );
    this.scoreboard(
      this.golfers.map((g) => ({
        id: g.seat.id,
        text: `${g.done ? '✔' : `🏌 ${g.strokes}`} · ${relativeToPar(g.total, g.par - (g.done ? 0 : this.hole.par))}`,
        active: g.seat.id === activeId,
      })),
    );
  }

  // ── Cenário ─────────────────────────────────────────────

  /** Assenta uma geometria (já em coordenadas do mundo, deitada) no relevo. */
  private drape(geo: THREE.BufferGeometry, lift: number): THREE.BufferGeometry {
    const pos = geo.attributes.position!;
    for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(this.hole, pos.getX(i), pos.getZ(i)) + lift);
    geo.computeVertexNormals();
    return geo;
  }

  private flatPiece(geo: THREE.BufferGeometry, x: number, z: number, rotY: number, color: string, lift: number, extra: THREE.MeshToonMaterialParameters = {}): THREE.Mesh {
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(rotY);
    geo.translate(x, 0, z);
    const m = mesh(this.drape(geo, lift), toonUnique(color, extra), { cast: false, receive: true });
    this.holeGroup.add(m);
    return m;
  }

  private buildHole(hole: GolfHole, index: number): void {
    for (const c of [...this.holeGroup.children]) {
      this.holeGroup.remove(c);
      disposeObject(c);
    }
    const g = this.holeGroup;
    this.flatPiece(new THREE.PlaneGeometry(260, 300, 130, 150), 0, -95, 0, '#4f9a45', 0);

    // Fairway: segmentos + círculos nas juntas.
    this.path = [];
    for (let i = 0; i < hole.fairway.length - 1; i++) {
      const a = hole.fairway[i]!;
      const b = hole.fairway[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      this.flatPiece(new THREE.PlaneGeometry(hole.fairwayWidth, len, 6, Math.ceil(len / 2)), (a.x + b.x) / 2, (a.z + b.z) / 2, Math.atan2(b.x - a.x, b.z - a.z), '#78c95e', 0.03);
      this.flatPiece(new THREE.CircleGeometry(hole.fairwayWidth / 2, 24), a.x, a.z, 0, '#78c95e', 0.03);
      for (let d = 0; d < len; d += 2) this.path.push(new THREE.Vector2(a.x + ((b.x - a.x) * d) / len, a.z + ((b.z - a.z) * d) / len));
    }
    this.path.push(new THREE.Vector2(hole.hole.x, hole.hole.z));
    this.flatPiece(new THREE.CircleGeometry(hole.greenRadius + 1.4, 48, 0), hole.hole.x, hole.hole.z, 0, '#86d468', 0.05);
    this.flatPiece(new THREE.CircleGeometry(hole.greenRadius, 48), hole.hole.x, hole.hole.z, 0, '#a2ea7c', 0.07);
    for (const b of hole.bunkers) this.flatPiece(new THREE.CircleGeometry(b.r, 28), b.x, b.z, 0, '#f2d58b', 0.06);
    for (const w of hole.water) {
      const water = mesh(new THREE.CircleGeometry(w.r, 40), toonUnique('#2fa8e0', { transparent: true, opacity: 0.88 }), { cast: false, receive: true });
      water.rotation.x = -Math.PI / 2;
      water.position.set(w.x, heightAt(hole, w.x, w.z) + 0.3, w.z);
      g.add(water);
    }
    // Setas da inclinação do green (para baixo).
    for (let x = -hole.greenRadius; x <= hole.greenRadius; x += 2.2) {
      for (let z = -hole.greenRadius; z <= hole.greenRadius; z += 2.2) {
        if (Math.hypot(x, z) > hole.greenRadius - 1 || Math.hypot(x, z) < 1) continue;
        const px = hole.hole.x + x;
        const pz = hole.hole.z + z;
        const grad = gradientAt(hole, px, pz);
        const k = Math.hypot(grad.x, grad.z);
        if (k < 0.005) continue;
        const arrow = mesh(new THREE.ConeGeometry(0.12, 0.45, 3), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: Math.min(0.6, 0.2 + k * 8) }), { cast: false });
        arrow.rotation.x = Math.PI / 2;
        const holder = new THREE.Group();
        holder.add(arrow);
        holder.position.set(px, heightAt(hole, px, pz) + 0.1, pz);
        holder.rotation.y = Math.atan2(-grad.x, -grad.z);
        g.add(holder);
      }
    }
    // Tee
    const tee = mesh(new THREE.BoxGeometry(4, 0.12, 4), toon('#6fbf55'), { cast: false, receive: true });
    tee.position.set(0, heightAt(hole, 0, 0) + 0.04, 0);
    g.add(tee);
    for (const sx of [-1.4, 1.4]) {
      const marker = mesh(new THREE.SphereGeometry(0.15, 10, 8), toon('#ff3b5c'));
      marker.position.set(sx, heightAt(hole, sx, 0) + 0.2, 0.6);
      g.add(marker);
    }
    // Buraco e bandeira
    const hy = heightAt(hole, hole.hole.x, hole.hole.z);
    const cup = mesh(new THREE.CircleGeometry(0.24, 20), toon('#1b1033'), { cast: false });
    cup.rotation.x = -Math.PI / 2;
    cup.position.set(hole.hole.x, hy + 0.08, hole.hole.z);
    const pole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2), toon('#ffffff'));
    pole.position.set(hole.hole.x, hy + 1.6, hole.hole.z);
    const flag = mesh(new THREE.PlaneGeometry(1.1, 0.7), toonUnique('#ff3b5c', { side: THREE.DoubleSide }));
    flag.position.set(hole.hole.x + 0.55, hy + 2.8, hole.hole.z);
    const num = textSprite(String(index + 1), { height: 0.5, color: '#ffffff', stroke: '#ff3b5c' });
    num.position.set(hole.hole.x + 0.55, hy + 2.8, hole.hole.z + 0.02);
    g.add(cup, pole, flag, num);

    // Árvores no rough, longe do fairway e do green
    const rng = createRng(500 + index);
    for (let i = 0, placed = 0; i < 700 && placed < 80; i++) {
      const x = (rng.next() - 0.5) * 130;
      const z = 15 - rng.next() * (Math.abs(hole.hole.z) + 40);
      const lie = lieAt(hole, x, z);
      if (lie !== 'rough' && lie !== 'out') continue;
      if (lie === 'rough' && rng.next() < 0.6) continue;
      if (Math.hypot(x - hole.hole.x, z - hole.hole.z) < hole.greenRadius + 5) continue;
      if (Math.hypot(x, z) < 7) continue;
      const r = rng.next();
      const tree =
        (r < 0.62
          ? pickProp(rng.next() < 0.8 ? PROPS.trees : PROPS.treesFall, rng.next(), { height: 4 + rng.next() * 3.5 })
          : r < 0.85
            ? pickProp(PROPS.plants, rng.next(), { height: 0.7 + rng.next() * 0.8 })
            : pickProp([...PROPS.rocks, ...PROPS.natureBits.filter((k) => /log|stump/.test(k))], rng.next(), { height: 0.6 + rng.next() * 1 })) ??
        (rng.next() < 0.6 ? palmTree(rng, 1 + rng.next() * 0.6) : bush(rng));
      tree.rotation.y = rng.next() * Math.PI * 2;
      tree.position.set(x, heightAt(hole, x, z), z);
      g.add(tree);
      placed++;
    }
  }

  override dispose(): void {
    this.miniMap.dispose();
    this.meter?.el.remove();
    for (const gs of this.golfers) gs.ball.geometry.dispose();
    this.caddie.dispose();
    disposeObject(this.club3d);
    super.dispose();
  }
}
