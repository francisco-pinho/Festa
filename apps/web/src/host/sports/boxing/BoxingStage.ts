/**
 * Boxe 3D, "rei do ringue": quem ganha fica no ringue e enfrenta o próximo.
 * Socos com a esquerda (rápido) e a direita (forte); segurar o botão de defesa
 * bloqueia quase todo o dano. Quedas com contagem; à 3.ª é KO.
 */
import * as THREE from 'three';
import { getCharacter } from '@festa/game';
import {
  BOXING,
  boxingRanking,
  getUpCount,
  healthAfterGettingUp,
  punchDamage,
  type FighterRecord,
  type Hand,
} from '@festa/game/sports/boxing';
import { mesh, toon, toonUnique } from '../../three/materials';
import { ease } from '../../three/tweens';
import { SportStage } from '../SportStage';
import type { SportContext, SportStanding } from '../types';
import type { Seat } from '../../game/Seats';

const RING = 4.2;
const GAP = 1.4; // distância de cada lutador ao centro

interface Fighter {
  seat: Seat;
  side: 1 | -1;
  gloves: Record<Hand, THREE.Mesh>;
  health: number;
  knockdowns: number;
  cooldown: Record<Hand, number>;
  punch: { hand: Hand; t: number; power: number; landed: boolean } | null;
  stun: number;
  down: boolean;
  botTimer: number;
  botGuard: number;
  damage: number;
}

export class BoxingStage extends SportStage {
  private readonly records = new Map<string, FighterRecord>();
  private fight: [Fighter, Fighter] | null = null;
  private fighting = false;
  private clock = 0;
  private offSwing: (() => void) | null = null;
  private readonly gloveCache = new Map<string, Record<Hand, THREE.Mesh>>();

  constructor(ctx: SportContext) {
    super(ctx);
    this.buildRing();
    for (const p of ctx.players) this.records.set(p.id, { id: p.id, wins: 0, kos: 0, damage: 0 });
  }

  async play(): Promise<SportStanding[]> {
    this.offSwing = this.ctx.hub.events.on('swing', ({ player, swing }) => {
      const f = this.fight?.find((x) => x.seat.id === player.id);
      if (f) this.throwPunch(f, swing.hand ?? 'right', swing.power);
    });
    this.cameraTo({ x: 0, y: 4.2, z: 7.5 }, { x: 0, y: 1.3, z: 0 }, { instant: true });
    await this.ctx.hud.banner('Boxe!', { sub: 'Rei do ringue: quem ganha fica', hold: 2 });

    let champion = this.players[0]!;
    for (let i = 1; i < this.players.length; i++) {
      const challenger = this.players[i]!;
      const winner = await this.runFight(champion, challenger);
      champion = winner;
    }
    this.offSwing?.();
    const ranked = boxingRanking([...this.records.values()]);
    return ranked.map((r) => ({
      id: r.id,
      rank: r.rank,
      score: `${r.wins} vitória${r.wins === 1 ? '' : 's'}${r.kos ? ` · ${r.kos} KO` : ''}`,
    }));
  }

  // ── Combate ─────────────────────────────────────────────

  private async runFight(a: Seat, b: Seat): Promise<Seat> {
    for (const m of this.models.values()) m.root.visible = false;
    const fa = this.makeFighter(a, 1);
    const fb = this.makeFighter(b, -1);
    this.fight = [fa, fb];
    for (const p of this.players) {
      const f = this.fight.find((x) => x.seat.id === p.id);
      this.setLayout(
        p,
        f
          ? { kind: 'motion', action: 'punch', aim: false, hands: true, guard: true, prompt: `Contra ${f === fa ? b.name : a.name}!`, hint: 'Esquerda = rápido · Direita = forte · Segura 🛡️ para defender' }
          : { kind: 'wait', message: `A ver: ${a.name} 🥊 ${b.name}` },
      );
    }
    await this.ctx.hud.banner(`${a.name} vs ${b.name}`, { hold: 2 });

    let winner: Fighter | null = null;
    let ko = false;
    for (let round = 1; round <= BOXING.rounds && !winner; round++) {
      this.clock = BOXING.roundSeconds;
      this.updateHud(round);
      await this.ctx.hud.banner(`Ronda ${round}`, { hold: 1.2 });
      await this.ctx.hud.big('LUTA!', 0.7);
      this.fighting = true;
      while (this.clock > 0) {
        await this.wait(0.1);
        this.updateHud(round);
        const down = this.fight.find((f) => f.down);
        if (down) {
          this.fighting = false;
          const out = await this.countdown(down);
          if (out) {
            winner = this.fight.find((f) => f !== down)!;
            ko = true;
            break;
          }
          this.fighting = true;
        }
      }
      this.fighting = false;
      if (!winner && round < BOXING.rounds) {
        await this.ctx.hud.banner('Fim da ronda', { hold: 1.5 });
        for (const f of this.fight) f.health = Math.min(BOXING.maxHealth, f.health + BOXING.maxHealth * BOXING.recoverBetweenRounds);
      }
    }
    if (!winner) {
      // Decisão por pontos: vida restante e dano feito.
      const score = (f: Fighter) => f.health + f.damage * 0.5 - f.knockdowns * 25;
      winner = score(fa) >= score(fb) ? fa : fb;
    }
    const loser = this.fight.find((f) => f !== winner)!;
    const rw = this.records.get(winner.seat.id)!;
    rw.wins++;
    if (ko) rw.kos++;
    for (const f of this.fight) this.records.get(f.seat.id)!.damage += Math.round(f.damage);
    this.model(winner.seat.id).setAnim('cheer');
    this.model(loser.seat.id).setAnim('sad');
    this.ctx.seats.vibrate(winner.seat, [100, 50, 100, 50, 300]);
    await this.ctx.hud.banner(ko ? 'K.O.!' : 'Decisão dos juízes', { sub: `${winner.seat.name} ganha!`, hold: 2.5, color: '#ffd23f' });
    this.fight = null;
    return winner.seat;
  }

  private makeFighter(seat: Seat, side: 1 | -1): Fighter {
    const m = this.model(seat.id);
    m.root.visible = true;
    m.root.rotation.set(0, 0, 0);
    m.root.position.set(side * GAP, 0.5, 0);
    m.faceYaw(side === 1 ? -Math.PI / 2 : Math.PI / 2, true);
    m.setAnim('idle');
    let gloves = this.gloveCache.get(seat.id);
    if (!gloves) {
      const color = getCharacter(seat.characterId).color;
      gloves = { left: this.makeGlove(color), right: this.makeGlove(color) };
      this.gloveCache.set(seat.id, gloves);
      m.root.add(gloves.left, gloves.right);
    }
    return {
      seat,
      side,
      gloves,
      health: BOXING.maxHealth,
      knockdowns: 0,
      cooldown: { left: 0, right: 0 },
      punch: null,
      stun: 0,
      down: false,
      botTimer: 1 + this.ctx.rng.next(),
      botGuard: 0,
      damage: 0,
    };
  }

  private guarding(f: Fighter): boolean {
    if (f.botGuard > 0) return true;
    if (this.ctx.seats.isAuto(f.seat)) return false;
    return this.ctx.seats.hubPlayer(f.seat)?.guarding ?? false;
  }

  private throwPunch(f: Fighter, hand: Hand, power: number): void {
    if (!this.fighting || f.down || f.stun > 0 || f.punch || f.cooldown[hand] > 0 || this.guarding(f)) return;
    f.cooldown[hand] = BOXING.cooldown[hand];
    f.punch = { hand, t: 0, power, landed: false };
  }

  private async countdown(f: Fighter): Promise<boolean> {
    f.knockdowns++;
    const m = this.model(f.seat.id);
    const root = m.root;
    m.setAnim('dizzy');
    await this.tween(0.4, (t) => (root.rotation.z = -f.side * t * (Math.PI / 2.2)), ease.bounceOut);
    const getUp = getUpCount(f.knockdowns, this.ctx.rng.next());
    this.ctx.seats.vibrate(f.seat, [300, 100, 300]);
    for (let n = 1; n <= 10; n++) {
      await this.ctx.hud.big(String(n), 0.75);
      if (getUp !== null && n === getUp) {
        await this.tween(0.4, (t) => (root.rotation.z = -f.side * (1 - t) * (Math.PI / 2.2)));
        f.down = false;
        f.health = healthAfterGettingUp(f.knockdowns);
        m.setAnim('idle');
        this.updateHud(0);
        await this.ctx.hud.banner('Levanta-se!', { hold: 0.9 });
        return false;
      }
    }
    return true;
  }

  // ── Por frame ───────────────────────────────────────────

  protected override tick(dt: number, time: number): void {
    if (this.fighting) this.clock -= dt;
    if (!this.fight) return;
    const [a, b] = this.fight;
    for (const f of this.fight) {
      const opp = f === a ? b : a;
      f.cooldown.left = Math.max(0, f.cooldown.left - dt);
      f.cooldown.right = Math.max(0, f.cooldown.right - dt);
      f.stun = Math.max(0, f.stun - dt);
      f.botGuard = Math.max(0, f.botGuard - dt);
      if (this.fighting && (f.seat.isBot || this.ctx.seats.isAuto(f.seat))) this.botThink(f, opp, dt);

      // Animação do soco: avança 0.12s, volta 0.18s; o impacto é no pico.
      if (f.punch) {
        f.punch.t += dt;
        if (!f.punch.landed && f.punch.t >= 0.12) {
          f.punch.landed = true;
          this.landPunch(f, opp, f.punch.hand, f.punch.power);
        }
        if (f.punch.t > 0.3) f.punch = null;
      }
      this.poseGloves(f, time);
      const m = this.model(f.seat.id);
      if (!f.down) {
        m.root.position.x = f.side * GAP + (f.stun > 0 ? f.side * 0.15 : 0);
        if (f.stun <= 0 && m.anim === 'dizzy') m.setAnim('idle');
      }
    }
  }

  private landPunch(f: Fighter, opp: Fighter, hand: Hand, power: number): void {
    // Quem já está no chão (ou caiu neste mesmo instante) não acerta.
    if (opp.down || f.down) return;
    const blocked = this.guarding(opp);
    const dmg = punchDamage(power, hand, blocked);
    opp.health = Math.max(0, opp.health - dmg);
    f.damage += dmg;
    if (blocked) {
      this.ctx.seats.vibrate(opp.seat, 20);
      return;
    }
    opp.stun = 0.25 + power * 0.2;
    this.model(opp.seat.id).setAnim('dizzy');
    this.ctx.seats.vibrate(opp.seat, 90);
    this.ctx.seats.vibrate(f.seat, 30);
    if (opp.health <= 0) {
      opp.down = true;
      opp.punch = null;
    }
  }

  private botThink(f: Fighter, opp: Fighter, dt: number): void {
    const rng = this.ctx.rng;
    // Defende às vezes quando o adversário começa um soco.
    const skill = this.ctx.botSkill;
    if (opp.punch && opp.punch.t < 0.05 && f.botGuard <= 0 && rng.next() < 0.15 + 0.5 * skill) f.botGuard = 0.55;
    f.botTimer -= dt;
    if (f.botTimer <= 0) {
      f.botTimer = (0.6 + rng.next() * 0.9) * (1.5 - skill * 0.6);
      if (f.botGuard <= 0) this.throwPunch(f, rng.next() < 0.6 ? 'left' : 'right', 0.4 + rng.next() * 0.6);
    }
  }

  private poseGloves(f: Fighter, time: number): void {
    const guard = this.guarding(f);
    for (const hand of ['left', 'right'] as Hand[]) {
      const g = f.gloves[hand];
      const sideX = hand === 'left' ? 0.32 : -0.32;
      let x = sideX;
      let y = 1.15 + Math.sin(time * 4 + (hand === 'left' ? 0 : 1.5)) * 0.04;
      let z = 0.45;
      if (guard) {
        y = 1.55;
        z = 0.42;
        x = sideX * 0.6;
      }
      if (f.punch?.hand === hand) {
        const t = f.punch.t;
        const ext = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 0.18);
        z = 0.45 + ext * 0.75;
        y = 1.3;
        x = sideX * (1 - ext * 0.7);
      }
      g.position.set(x, y, z);
    }
  }

  private updateHud(round: number): void {
    if (round > 0) this.ctx.hud.setRound(`Ronda ${round}/${BOXING.rounds} · ⏱ ${Math.max(0, Math.ceil(this.clock))}`);
    const fighters = this.fight ?? [];
    this.scoreboard(
      this.players.map((p) => {
        const f = fighters.find((x) => x.seat.id === p.id);
        const rec = this.records.get(p.id)!;
        if (!f) return { id: p.id, text: `🏆 ${rec.wins}` };
        const hp = Math.round(f.health);
        const bars = Math.round(hp / 20);
        return { id: p.id, text: `${'❤'.repeat(Math.max(0, bars))}${'·'.repeat(5 - Math.max(0, bars))} ${hp}`, active: true };
      }),
    );
  }

  override dispose(): void {
    this.offSwing?.();
    super.dispose();
  }

  // ── Cenário ─────────────────────────────────────────────

  private makeGlove(color: string): THREE.Mesh {
    const g = mesh(new THREE.SphereGeometry(0.2, 14, 10), toonUnique(color));
    g.scale.set(1, 1, 1.25);
    return g;
  }

  private buildRing(): void {
    this.scene.background = new THREE.Color('#1b1033');
    this.scene.fog = new THREE.Fog('#1b1033', 18, 45);
    const base = mesh(new THREE.BoxGeometry(RING * 2 + 0.6, 0.5, RING * 2 + 0.6), toon('#2f7dff'), { receive: true });
    base.position.y = 0.25;
    const canvas = mesh(new THREE.BoxGeometry(RING * 2, 0.02, RING * 2), toon('#f2f2f2'), { cast: false, receive: true });
    canvas.position.y = 0.51;
    this.scene.add(base, canvas);
    const postColors = ['#ff3b5c', '#2f7dff', '#ffffff', '#ffffff'];
    const corners: [number, number][] = [[1, 1], [-1, -1], [1, -1], [-1, 1]];
    corners.forEach(([cx, cz], i) => {
      const post = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6), toon(postColors[i]!));
      post.position.set(cx * RING, 1.3, cz * RING);
      this.scene.add(post);
    });
    for (let h = 0; h < 3; h++) {
      const y = 0.95 + h * 0.3;
      for (const [ax, az, len, rotY] of [
        [0, RING, RING * 2, 0],
        [0, -RING, RING * 2, 0],
        [RING, 0, RING * 2, Math.PI / 2],
        [-RING, 0, RING * 2, Math.PI / 2],
      ] as const) {
        const rope = mesh(new THREE.CylinderGeometry(0.035, 0.035, len), toon(h === 1 ? '#ffffff' : '#ff3b5c'));
        rope.rotation.set(0, rotY, Math.PI / 2);
        rope.position.set(ax, y, az);
        this.scene.add(rope);
      }
    }
    const floor = mesh(new THREE.PlaneGeometry(80, 80), toon('#2a1a4a'), { cast: false, receive: true });
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    // Público (silhuetas) e holofotes
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 9 + (i % 3) * 1.5;
      const fan = mesh(new THREE.CapsuleGeometry(0.35, 0.6, 4, 8), toon(['#4b2f7a', '#3b2566', '#5a3a8f'][i % 3]!));
      fan.position.set(Math.cos(a) * r, 0.6 + (i % 3) * 0.5, Math.sin(a) * r);
      this.scene.add(fan);
    }
    const spot = new THREE.SpotLight('#fff3dc', 120, 30, 0.6, 0.4);
    spot.position.set(0, 12, 2);
    spot.target.position.set(0, 0.5, 0);
    spot.castShadow = true;
    this.scene.add(spot, spot.target);
    this.sun.intensity = 0.6;
  }
}
