/**
 * Boxe 3D, "rei do ringue": quem ganha fica no ringue e enfrenta o próximo.
 *
 *  - Lutadores com luvas presas às mãos (seguem as animações do esqueleto).
 *  - Mover com o joystick: avançar/recuar e rodar à volta do adversário (ficam sempre virados um para o outro).
 *  - Socos pelo gesto: direto (jab com a esquerda), gancho e uppercut — a distância conta.
 *  - Barra de soco (energia): socos com a barra cheia batem muito mais.
 *  - Defender (segurar) e esquivar (botões ou inclinar o telemóvel); esquivar abre um contra-ataque.
 *  - Dano bem visível: flash vermelho, faíscas, cabeça a recuar, número de dano, câmara a tremer, vibração.
 *  - Bots dão "sinais" antes de atacar (luva a brilhar, recuar, baixar o ombro, agachar).
 *  - Arena com público que reage, árbitro que conta as quedas e sino entre rondas.
 */
import { sound } from '../../audio/Sound';
import * as THREE from 'three';
import { CHARACTERS, getCharacter } from '@festa/game';
import {
  BOXING,
  PUNCHES,
  boxingRanking,
  getUpCount,
  healthAfterGettingUp,
  judgesScore,
  punchDamage,
  punchKind,
  punchPower,
  punchRange,
  type FighterRecord,
  type Hand,
  type PunchGesture,
  type PunchKind,
} from '@festa/game/sports/boxing';
import { CharacterModel, type CharacterAnim } from '../../three/CharacterModel';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../../three/materials';
import { ease } from '../../three/tweens';
import { SportStage } from '../SportStage';
import type { SportContext, SportStanding } from '../types';
import type { Seat } from '../../game/Seats';

const RING = 4.2;
const FLOOR = 0.51;
const START_GAP = 1.6;
const MOVE_SPEED = 2.4;

interface ActivePunch {
  kind: PunchKind;
  hand: Hand;
  power: number;
  t: number;
  /** Sinal antes do soco (só bots). */
  tell: number;
  phase: 'tell' | 'windup' | 'recovery';
  counter: boolean;
}

interface Fighter {
  seat: Seat;
  model: CharacterModel;
  gloves: Record<Hand, THREE.Mesh>;
  pos: THREE.Vector2;
  push: THREE.Vector2;
  health: number;
  shownHealth: number;
  energy: number;
  knockdowns: number;
  damage: number;
  punch: ActivePunch | null;
  stun: number;
  down: boolean;
  dodge: { dir: -1 | 1; t: number } | null;
  dodgeCd: number;
  counterT: number;
  lastTilt: number;
  bot: { timer: number; strafe: number; strafeT: number; want: number; guard: number; reacted: ActivePunch | null };
}

interface Spark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

export class BoxingStage extends SportStage {
  private readonly records = new Map<string, FighterRecord>();
  private fight: [Fighter, Fighter] | null = null;
  private fighting = false;
  private clock = 0;
  private round = 0;
  private offSwing: (() => void) | null = null;
  private readonly gloveCache = new Map<string, Record<Hand, THREE.Mesh>>();
  private readonly sparks: Spark[] = [];
  private readonly floaters: { sprite: THREE.Sprite; life: number }[] = [];
  private shake = 0;
  private camSide = 1;
  private readonly camPerp = new THREE.Vector2(0, 1);
  private excitement = 0;
  private crowd!: { bodies: THREE.InstancedMesh; heads: THREE.InstancedMesh; base: THREE.Matrix4[]; phase: number[] };
  private referee!: CharacterModel;
  private refTarget = new THREE.Vector3(0, FLOOR, -2);
  private bell!: THREE.Group;
  private bellRing = 0;
  private hudEl: HTMLElement | null = null;
  /** Durante a contagem: carregadelas do jogador no chão para se levantar mais cedo. */
  private getUpMash = 0;

  constructor(ctx: SportContext) {
    super(ctx);
    this.buildArena();
    for (const p of ctx.players) this.records.set(p.id, { id: p.id, wins: 0, kos: 0, damage: 0 });
  }

  async play(): Promise<SportStanding[]> {
    this.offSwing = this.ctx.hub.events.on('swing', ({ player, swing }) => {
      const f = this.fight?.find((x) => x.seat.id === player.id);
      if (!f) return;
      if (f.down) {
        this.getUpMash++;
        return;
      }
      this.startPunch(f, punchKind(swing.hand ?? 'right', (swing.kind ?? 'straight') as PunchGesture), swing.hand ?? 'right', swing.power);
    });
    this.cameraTo({ x: 7, y: 6, z: 9 }, { x: 0, y: 1.3, z: 0 }, { instant: true });
    this.cameraTo({ x: 0, y: 3, z: 7 }, { x: 0, y: 1.4, z: 0 }, { speed: 0.8 });
    await this.ctx.hud.banner('Boxe!', { sub: 'Rei do ringue: quem ganha fica', hold: 2 });

    let champion = this.players[0]!;
    for (let i = 1; i < this.players.length; i++) {
      champion = await this.runFight(champion, this.players[i]!);
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
    const fa = this.makeFighter(a, -1);
    const fb = this.makeFighter(b, 1);
    this.fight = [fa, fb];
    this.ctx.hud.setScoreboard(null);
    this.showFightHud(fa, fb);
    for (const p of this.players) {
      const f = this.fight.find((x) => x.seat.id === p.id);
      this.setLayout(
        p,
        f
          ? {
              kind: 'motion',
              action: 'punch',
              aim: true,
              aimLabel: 'Mover',
              guard: true,
              dodge: true,
              prompt: `Contra ${f === fa ? b.name : a.name}!`,
              hint: 'Soco em frente = direto · de lado = gancho · de baixo para cima = uppercut · inclina para esquivar',
            }
          : { kind: 'wait', message: `A ver: ${a.name} 🥊 ${b.name}` },
      );
    }
    // Entrada: cada um no seu canto, o árbitro ao centro.
    this.refTarget.set(0, FLOOR, -2.6);
    await this.walkTo([fa, fb], START_GAP + 1.2, 0);
    await this.ctx.hud.banner(`${a.name} vs ${b.name}`, { sub: 'Vida no topo · barra amarela = força dos socos', hold: 2 });

    let winner: Fighter | null = null;
    let ko = false;
    for (this.round = 1; this.round <= BOXING.rounds && !winner; this.round++) {
      this.clock = BOXING.roundSeconds;
      this.resetPositions();
      await this.walkTo([fa, fb], START_GAP, 0.6);
      await this.ctx.hud.banner(`Ronda ${this.round}`, { hold: 1 });
      this.ringBell();
      await this.ctx.hud.big('LUTA!', 0.7);
      this.refTarget.set(0, FLOOR, -2.4);
      this.fighting = true;
      while (this.clock > 0) {
        await this.wait(0.1);
        const down = this.fight.find((f) => f.down);
        if (down) {
          this.fighting = false;
          const out = await this.countdown(down);
          if (out) {
            winner = this.fight.find((f) => f !== down)!;
            ko = true;
            break;
          }
          this.resetPositions();
          await this.walkTo([fa, fb], START_GAP, 0.5);
          this.fighting = true;
        }
      }
      this.fighting = false;
      this.ringBell();
      if (!winner && this.round < BOXING.rounds) {
        await this.ctx.hud.banner('Fim da ronda', { sub: 'Recuperam um pouco de vida', hold: 1.5 });
        for (const f of this.fight) {
          f.health = Math.min(BOXING.maxHealth, f.health + BOXING.maxHealth * BOXING.recoverBetweenRounds);
          f.energy = BOXING.maxEnergy;
        }
      }
    }
    if (!winner) winner = judgesScore(fa.health, fa.damage, fa.knockdowns) >= judgesScore(fb.health, fb.damage, fb.knockdowns) ? fa : fb;
    const loser = this.fight.find((f) => f !== winner)!;
    const rw = this.records.get(winner.seat.id)!;
    rw.wins++;
    if (ko) rw.kos++;
    for (const f of this.fight) this.records.get(f.seat.id)!.damage += Math.round(f.damage);
    winner.model.restAnim = 'idle';
    loser.model.restAnim = 'idle';
    winner.model.setAnim('cheer');
    if (!loser.down) loser.model.setAnim('sad');
    // O árbitro levanta o braço do vencedor.
    this.refTarget.set(winner.pos.x - this.camPerp.x * 1.2 + 0.6, FLOOR, winner.pos.y - this.camPerp.y * 1.2);
    this.excitement = 1.5;
    this.ctx.seats.vibrate(winner.seat, [100, 50, 100, 50, 300]);
    const focus = winner.model.root.position;
    this.cameraTo({ x: focus.x + this.camSide * 0.5, y: 2.4, z: focus.z + 4 }, { x: focus.x, y: 1.6, z: focus.z }, { speed: 2 });
    await this.ctx.hud.banner(ko ? 'K.O.!' : 'Decisão dos juízes', { sub: `${winner.seat.name} ganha!`, hold: 2.8, color: '#ffd23f' });
    this.hideFightHud();
    this.fight = null;
    this.scoreboard(this.players.map((p) => ({ id: p.id, text: `🏆 ${this.records.get(p.id)!.wins}` })));
    return winner.seat;
  }

  private makeFighter(seat: Seat, side: -1 | 1): Fighter {
    const m = this.model(seat.id);
    m.root.visible = true;
    m.root.rotation.set(0, 0, 0);
    m.restAnim = 'fightIdle';
    m.setAnim('fightIdle');
    let gloves = this.gloveCache.get(seat.id);
    if (!gloves) {
      const color = getCharacter(seat.characterId).color;
      gloves = { left: this.makeGlove(color), right: this.makeGlove(color) };
      m.attach(gloves.left, 'left');
      m.attach(gloves.right, 'right');
      this.gloveCache.set(seat.id, gloves);
    }
    const pos = new THREE.Vector2(side * (START_GAP + 1.2), 0);
    m.root.position.set(pos.x, FLOOR, pos.y);
    return {
      seat,
      model: m,
      gloves,
      pos,
      push: new THREE.Vector2(),
      health: BOXING.maxHealth,
      shownHealth: BOXING.maxHealth,
      energy: BOXING.maxEnergy,
      knockdowns: 0,
      damage: 0,
      punch: null,
      stun: 0,
      down: false,
      dodge: null,
      dodgeCd: 0,
      counterT: 0,
      lastTilt: 0,
      bot: { timer: 1 + this.ctx.rng.next(), strafe: 1, strafeT: 1, want: 1.4, guard: 0, reacted: null },
    };
  }

  private resetPositions(): void {
    if (!this.fight) return;
    for (const f of this.fight) {
      f.punch = null;
      f.dodge = null;
      f.stun = 0;
      f.push.set(0, 0);
    }
  }

  /** Os dois caminham até ficarem a `gap` do centro, um de cada lado. */
  private async walkTo(fighters: Fighter[], gap: number, seconds: number): Promise<void> {
    const from = fighters.map((f) => f.pos.clone());
    const to = fighters.map((_, i) => new THREE.Vector2((i === 0 ? -1 : 1) * gap, 0));
    for (const f of fighters) f.model.setAnim('walk');
    if (seconds > 0)
      await this.tween(seconds, (k) => fighters.forEach((f, i) => f.pos.copy(from[i]!).lerp(to[i]!, k)), ease.inOut);
    else fighters.forEach((f, i) => f.pos.copy(to[i]!));
    for (const f of fighters) f.model.setAnim('fightIdle');
  }

  private guarding(f: Fighter): boolean {
    if (f.down || f.punch || f.dodge) return false;
    if (f.bot.guard > 0) return true;
    if (this.ctx.seats.isAuto(f.seat)) return false;
    const hp = this.ctx.seats.hubPlayer(f.seat);
    return !!hp && (hp.guarding || hp.held.b);
  }

  private startPunch(f: Fighter, kind: PunchKind, hand: Hand, gesturePower: number, tell = 0): void {
    if (!this.fighting || f.down || f.stun > 0 || f.punch || f.dodge || this.guarding(f)) return;
    const spec = PUNCHES[kind];
    const power = punchPower(f.energy, gesturePower);
    f.energy = Math.max(0, f.energy - spec.cost);
    f.punch = { kind, hand, power, t: 0, tell, phase: tell > 0 ? 'tell' : 'windup', counter: f.counterT > 0 };
    f.counterT = 0;
    if (tell <= 0) this.playPunchAnim(f);
  }

  private playPunchAnim(f: Fighter): void {
    const p = f.punch!;
    const anim: CharacterAnim = p.kind === 'hook' ? 'hook' : p.kind === 'uppercut' ? 'uppercut' : p.hand === 'left' ? 'punchLeft' : 'punchRight';
    f.model.setAnim(anim);
  }

  private startDodge(f: Fighter, dir: -1 | 1): void {
    if (!this.fighting || f.down || f.stun > 0 || f.punch || f.dodge || f.dodgeCd > 0) return;
    f.dodge = { dir, t: 0 };
    f.dodgeCd = 0.85;
    f.model.setAnim(dir < 0 ? 'dodgeLeft' : 'dodgeRight');
  }

  private resolveImpact(f: Fighter, opp: Fighter): void {
    const p = f.punch!;
    const dist = f.pos.distanceTo(opp.pos);
    const range = punchRange(p.kind, dist);
    const hitPoint = opp.model.headPosition();
    if (range === 'far') {
      sound.play('whoosh', { vol: 0.6 });
      this.float('Falhou!', hitPoint, '#b9c2d0', 0.3);
      // Gancho falhado ao longe deixa-te exposto.
      if (p.kind === 'hook' || p.kind === 'uppercut') f.stun = 0.35;
      return;
    }
    if (opp.down) return;
    if (opp.dodge && opp.dodge.t < 0.42) {
      sound.play('whoosh');
      this.float('Esquivou!', hitPoint, '#3fd0ff', 0.32);
      opp.counterT = BOXING.counterWindow;
      f.stun = 0.25;
      this.ctx.seats.vibrate(opp.seat, 25);
      return;
    }
    const blocked = this.guarding(opp);
    const dmg = punchDamage(p.kind, p.power, { blocked, counter: p.counter, range });
    opp.health = Math.max(0, opp.health - dmg);
    f.damage += dmg;
    const fwd = opp.pos.clone().sub(f.pos).normalize();
    sound.play(blocked ? 'block' : 'punch', { pitch: blocked ? 1 : 1.2 - dmg / 40 });
    if (blocked) {
      opp.model.setAnim('blockHit');
      opp.energy = Math.max(0, opp.energy - 8);
      opp.push.addScaledVector(fwd, 0.8);
      this.burst(hitPoint, '#9fd8ff', 6, 2.5);
      this.float(`🛡️ ${Math.round(dmg)}`, hitPoint, '#9fd8ff', 0.3);
      this.ctx.seats.vibrate(opp.seat, 30);
      this.shake = Math.max(this.shake, 0.05);
      return;
    }
    // Acertou em cheio.
    const heavy = dmg >= 9;
    opp.model.setAnim('hurt');
    opp.model.flash('#ff2a2a', 0.25);
    const side = p.kind === 'hook' ? (p.hand === 'left' ? 1 : -1) * 0.5 : 0;
    opp.model.kickHead(p.kind === 'uppercut' ? 0.9 : 0.35 + dmg * 0.03, side);
    opp.push.addScaledVector(fwd, 1.2 + dmg * 0.18);
    opp.stun = 0.18 + dmg / 45;
    // Um soco forte interrompe o soco do outro.
    if (opp.punch && opp.punch.phase !== 'recovery' && dmg >= 6) opp.punch = null;
    this.burst(hitPoint, p.counter ? '#ff6fb5' : '#ffd23f', heavy ? 16 : 9, heavy ? 5 : 3.5);
    this.float(p.counter ? `CONTRA! -${Math.round(dmg)}` : `-${Math.round(dmg)}`, hitPoint, p.counter ? '#ff6fb5' : heavy ? '#ff3b3b' : '#ffe14d', heavy ? 0.55 : 0.4);
    if (p.kind !== 'jab') this.float(PUNCHES[p.kind].label, hitPoint.clone().add(new THREE.Vector3(0, -0.45, 0)), '#ffffff', 0.25);
    this.shake = Math.max(this.shake, 0.08 + dmg / 60);
    this.excitement = Math.min(2, this.excitement + dmg / 18);
    this.ctx.seats.vibrate(opp.seat, heavy ? [160, 40, 160] : 90);
    this.ctx.seats.vibrate(f.seat, 35);
    if (opp.health <= 0) {
      opp.down = true;
      opp.punch = null;
      opp.dodge = null;
      this.excitement = 2;
      this.shake = 0.35;
      sound.play('cheer');
    }
  }

  private async countdown(f: Fighter): Promise<boolean> {
    f.knockdowns++;
    const m = f.model;
    m.restAnim = 'lie';
    m.setAnim('fall');
    this.ctx.seats.vibrate(f.seat, [300, 100, 300]);
    // Árbitro junto de quem caiu; câmara baixa.
    this.refTarget.set(f.pos.x * 0.5, FLOOR, f.pos.y - 1.3);
    const c = m.root.position;
    this.cameraTo({ x: c.x + this.camSide * 1.5, y: 1.8, z: c.z + 3.4 }, { x: c.x, y: 0.8, z: c.z }, { speed: 2 });
    await this.wait(0.8);
    let getUp = getUpCount(f.knockdowns, this.ctx.rng.next());
    const human = !this.ctx.seats.isAuto(f.seat);
    this.getUpMash = 0;
    if (human && getUp !== null) {
      this.ctx.hud.hint(`${f.seat.name}: dá socos para te levantares mais depressa!`, true);
      this.ctx.seats.toast(f.seat, 'Dá socos para te levantares!');
    }
    for (let n = 1; n <= 10; n++) {
      this.referee.setAnim('punchRight');
      await this.ctx.hud.big(String(n), 0.75);
      if (getUp !== null && human) getUp = Math.max(n, getUp - Math.floor(this.getUpMash / 3));
      this.getUpMash %= 3;
      if (getUp !== null && n >= getUp) {
        this.ctx.hud.hint(null, true);
        m.restAnim = 'fightIdle';
        m.setAnim('getUp');
        await this.wait(0.9);
        f.down = false;
        f.health = healthAfterGettingUp(f.knockdowns);
        f.energy = BOXING.maxEnergy * 0.6;
        await this.ctx.hud.banner('Levanta-se!', { hold: 0.9 });
        this.refTarget.set(0, FLOOR, -2.4);
        return false;
      }
    }
    this.ctx.hud.hint(null, true);
    return true;
  }

  // ── Por frame ───────────────────────────────────────────

  protected override tick(dt: number, time: number): void {
    if (this.fighting) this.clock -= dt;
    this.updateCrowd(dt, time);
    this.updateReferee(dt);
    this.updateEffects(dt);
    if (this.bellRing > 0) {
      this.bellRing -= dt;
      this.bell.rotation.z = Math.sin(this.bellRing * 40) * this.bellRing * 0.4;
    }
    if (!this.fight) return;
    const [a, b] = this.fight;
    for (const f of this.fight) {
      const opp = f === a ? b : a;
      this.stepFighter(f, opp, dt, time);
    }
    this.separate(a, b);
    for (const f of this.fight) {
      const m = f.model;
      m.root.position.set(f.pos.x, FLOOR + (f.punch?.phase === 'tell' && f.punch.kind === 'uppercut' ? -0.1 : 0), f.pos.y);
      if (!f.down) {
        const opp = f === a ? b : a;
        m.faceYaw(Math.atan2(opp.pos.x - f.pos.x, opp.pos.y - f.pos.y));
      }
    }
    this.updateCamera(a, b);
    this.updateFightHud(a, b, dt);
  }

  private stepFighter(f: Fighter, opp: Fighter, dt: number, time: number): void {
    f.stun = Math.max(0, f.stun - dt);
    f.dodgeCd = Math.max(0, f.dodgeCd - dt);
    f.counterT = Math.max(0, f.counterT - dt);
    f.bot.guard = Math.max(0, f.bot.guard - dt);
    if (f.down) return;
    const guarding = this.guarding(f);
    if (!f.punch) f.energy = Math.min(BOXING.maxEnergy, f.energy + BOXING.energyRegen * dt * (guarding ? BOXING.guardRegenFactor : 1));

    const auto = this.ctx.seats.isAuto(f.seat);
    let stickX = 0;
    let stickY = 0;
    if (this.fighting) {
      if (auto) [stickX, stickY] = this.botThink(f, opp, dt);
      else {
        const pad = this.ctx.seats.pad(f.seat);
        stickX = pad.stick.x;
        stickY = pad.stick.y;
        if (pad.consumePress('x')) this.startDodge(f, -1);
        if (pad.consumePress('y')) this.startDodge(f, 1);
        const tilt = this.ctx.seats.aim(f.seat);
        if (tilt > 0.65 && f.lastTilt <= 0.65) this.startDodge(f, 1);
        if (tilt < -0.65 && f.lastTilt >= -0.65) this.startDodge(f, -1);
        f.lastTilt = tilt;
      }
    }

    // Soco: sinal → preparação → impacto → recuperação.
    const p = f.punch;
    if (p) {
      p.t += dt;
      const spec = PUNCHES[p.kind];
      if (p.phase === 'tell') {
        const glow = 0.4 + Math.sin(time * 30) * 0.4;
        (f.gloves[p.hand].material as THREE.MeshToonMaterial).emissiveIntensity = glow;
        if (p.t >= p.tell) {
          (f.gloves[p.hand].material as THREE.MeshToonMaterial).emissiveIntensity = 0;
          p.phase = 'windup';
          p.t = 0;
          this.playPunchAnim(f);
        }
      } else if (p.phase === 'windup' && p.t >= spec.windup) {
        p.phase = 'recovery';
        p.t = 0;
        this.resolveImpact(f, opp);
      } else if (p.phase === 'recovery' && p.t >= spec.recovery) {
        f.punch = null;
      }
    }

    // Esquiva: salto para o lado.
    const fwd = opp.pos.clone().sub(f.pos);
    const dist = fwd.length() || 1;
    fwd.divideScalar(dist);
    const right = new THREE.Vector2(-fwd.y, fwd.x);
    if (f.dodge) {
      f.dodge.t += dt;
      if (f.dodge.t < 0.3) f.pos.addScaledVector(right, f.dodge.dir * 2 * dt);
      if (f.dodge.t > 0.5) f.dodge = null;
    }

    // Movimento.
    const busy = !!f.dodge || f.stun > 0 || !this.fighting;
    const speed = MOVE_SPEED * (guarding ? 0.5 : f.punch ? 0.25 : 1);
    if (!busy) {
      f.pos.addScaledVector(fwd, -stickY * speed * dt);
      f.pos.addScaledVector(right, stickX * speed * dt);
    }
    // Empurrão dos socos.
    f.pos.addScaledVector(f.push, dt);
    f.push.multiplyScalar(Math.max(0, 1 - dt * 6));
    const lim = RING - 0.55;
    f.pos.x = THREE.MathUtils.clamp(f.pos.x, -lim, lim);
    f.pos.y = THREE.MathUtils.clamp(f.pos.y, -lim, lim);

    // Animação de base.
    const m = f.model;
    const oneShot = ['punchLeft', 'punchRight', 'hook', 'uppercut', 'hurt', 'blockHit', 'dodgeLeft', 'dodgeRight', 'getUp', 'fall'].includes(m.anim);
    if (!oneShot || (m.anim === m.restAnim)) {
      let anim: CharacterAnim = 'fightIdle';
      if (f.stun > 0.3) anim = 'dizzy';
      else if (guarding) anim = 'block';
      else if (!busy && Math.hypot(stickX, stickY) > 0.25) {
        if (Math.abs(stickY) > Math.abs(stickX)) anim = stickY < 0 ? 'walk' : 'walkBack';
        else anim = stickX > 0 ? 'strafeRight' : 'strafeLeft';
      }
      if (m.anim !== anim) m.setAnim(anim);
    }
  }

  /** Não deixa os lutadores entrarem um no outro. */
  private separate(a: Fighter, b: Fighter): void {
    const d = b.pos.clone().sub(a.pos);
    const len = d.length();
    if (len >= BOXING.minDistance || len === 0) return;
    const push = (BOXING.minDistance - len) / 2;
    d.divideScalar(len);
    a.pos.addScaledVector(d, -push);
    b.pos.addScaledVector(d, push);
  }

  /** IA: devolve o "joystick" do bot e decide socos, defesas e esquivas. */
  private botThink(f: Fighter, opp: Fighter, dt: number): [number, number] {
    const rng = this.ctx.rng;
    const skill = this.ctx.botSkill;
    const bot = f.bot;
    const dist = f.pos.distanceTo(opp.pos);

    // Reage aos socos do adversário (uma vez por soco).
    const op = opp.punch;
    if (op && op.phase !== 'recovery' && bot.reacted !== op && !f.punch) {
      bot.reacted = op;
      if (rng.next() < 0.2 + 0.6 * skill) {
        if (rng.next() < 0.35 + 0.35 * skill && f.dodgeCd <= 0) this.startDodge(f, rng.next() < 0.5 ? -1 : 1);
        else bot.guard = 0.45 + rng.next() * 0.3;
      }
    }

    // Contra-ataque logo a seguir a esquivar.
    if (f.counterT > 0 && !f.punch && dist < 2.2) {
      this.startPunch(f, dist < 1.6 ? 'hook' : 'straight', 'right', 0.9, 0.05);
    }

    bot.timer -= dt;
    const ready = f.energy > 35 + skill * 35;
    if (bot.timer <= 0 && !f.punch && bot.guard <= 0) {
      bot.timer = (0.5 + rng.next() * 1.1) * (1.4 - skill * 0.6);
      if (ready) {
        let kind: PunchKind | null = null;
        const r = rng.next();
        if (dist < 1.45) kind = r < 0.4 ? 'uppercut' : r < 0.75 ? 'hook' : 'jab';
        else if (dist < 1.75) kind = r < 0.45 ? 'hook' : r < 0.75 ? 'straight' : 'jab';
        else if (dist < 2.4) kind = r < 0.55 ? 'jab' : 'straight';
        if (kind) {
          const hand: Hand = kind === 'jab' ? 'left' : rng.next() < 0.5 ? 'left' : 'right';
          // Sinal antes do soco: mais longo nos bots fáceis (dá para ler e reagir).
          const tell = (0.16 + (1 - skill) * 0.32) * (kind === 'jab' ? 0.6 : 1);
          this.startPunch(f, kind, kind === 'straight' ? 'right' : hand, 0.5 + rng.next() * 0.5, tell);
        }
      }
    }

    // Movimento: mantém uma distância de combate e anda à roda.
    bot.strafeT -= dt;
    if (bot.strafeT <= 0) {
      bot.strafeT = 0.8 + rng.next() * 1.8;
      bot.strafe = rng.next() < 0.5 ? -1 : 1;
      bot.want = ready ? 1.25 + rng.next() * 0.4 : 2.1 + rng.next() * 0.5;
    }
    const sy = THREE.MathUtils.clamp((bot.want - dist) * 1.5, -1, 1); // + = recuar
    return [bot.strafe * 0.45, sy];
  }

  private updateCamera(a: Fighter, b: Fighter): void {
    if (!this.fighting) return;
    const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5);
    const line = b.pos.clone().sub(a.pos);
    const dist = line.length() || 1;
    line.divideScalar(dist);
    let perp = new THREE.Vector2(-line.y, line.x);
    // Mantém o mesmo lado (a câmara não salta para o outro lado do ringue).
    if (perp.y * this.camSide < 0) perp = perp.multiplyScalar(-1);
    this.camSide = Math.sign(perp.y) || 1;
    this.camPerp.copy(perp);
    // O árbitro fica do outro lado, a ver o combate sem tapar a câmara.
    const refX = THREE.MathUtils.clamp(mid.x - perp.x * 2.3, -RING + 0.6, RING - 0.6);
    const refZ = THREE.MathUtils.clamp(mid.y - perp.y * 2.3, -RING + 0.6, RING - 0.6);
    this.refTarget.set(refX, FLOOR, refZ);
    const back = 5.6 + dist * 1.1;
    this.cameraTo({ x: mid.x + perp.x * back, y: 3.1, z: mid.y + perp.y * back }, { x: mid.x, y: 1.35, z: mid.y }, { speed: 4 });
  }

  override update(dt: number, time: number): void {
    super.update(dt, time);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 0.9);
      const s = this.shake;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
  }

  // ── Efeitos ─────────────────────────────────────────────

  private burst(at: THREE.Vector3, color: string, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.05 + Math.random() * 0.05), new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(at);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.scene.add(m);
      this.sparks.push({ mesh: m, vel: v, life: 0.35 + Math.random() * 0.25 });
    }
    // Estrela de impacto
    const star = textSprite('💥', { height: 0.7 });
    star.position.copy(at);
    this.scene.add(star);
    this.floaters.push({ sprite: star, life: 0.3 });
  }

  private float(text: string, at: THREE.Vector3, color: string, height: number): void {
    const sprite = textSprite(text, { height, color, stroke: '#1d1433' });
    sprite.position.copy(at).add(new THREE.Vector3(0, 0.4, 0));
    this.scene.add(sprite);
    this.floaters.push({ sprite, life: 1 });
  }

  private updateEffects(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.life -= dt;
      s.vel.y -= 9 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, s.life * 3);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        disposeObject(s.mesh);
        this.sparks.splice(i, 1);
      }
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]!;
      f.life -= dt;
      f.sprite.position.y += dt * 0.9;
      (f.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, f.life * 2.5);
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        disposeObject(f.sprite);
        this.floaters.splice(i, 1);
      }
    }
  }

  private ringBell(): void {
    sound.play('bell');
    this.bellRing = 1.2;
    this.ctx.hud.hint('🔔 Ding ding!', false);
    void this.wait(1.2).then(() => this.ctx.hud.hint(null, false));
  }

  private updateCrowd(dt: number, time: number): void {
    this.excitement = Math.max(0.15, this.excitement - dt * 0.35);
    const { bodies, heads, base, phase } = this.crowd;
    const m = new THREE.Matrix4();
    const hop = new THREE.Matrix4();
    for (let i = 0; i < base.length; i++) {
      const h = Math.max(0, Math.sin(time * (4 + this.excitement * 3) + phase[i]!)) * 0.12 * this.excitement;
      hop.makeTranslation(0, h, 0);
      m.multiplyMatrices(hop, base[i]!);
      bodies.setMatrixAt(i, m);
      hop.makeTranslation(0, h + 0.62, 0);
      m.multiplyMatrices(hop, base[i]!);
      heads.setMatrixAt(i, m);
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }

  private updateReferee(dt: number): void {
    const r = this.referee.root;
    const d = this.refTarget.clone().sub(r.position);
    d.y = 0;
    const len = d.length();
    if (len > 0.1) {
      r.position.addScaledVector(d.normalize(), Math.min(len, dt * 2.6));
      this.referee.faceYaw(Math.atan2(d.x, d.z));
      if (this.referee.anim === 'idle' || this.referee.anim === 'fightIdle') this.referee.setAnim('walk');
    } else {
      if (this.referee.anim === 'walk') this.referee.setAnim('idle');
      // Olha para os lutadores.
      if (this.fight) {
        const mid = this.fight[0].pos.clone().add(this.fight[1].pos).multiplyScalar(0.5);
        this.referee.faceYaw(Math.atan2(mid.x - r.position.x, mid.y - r.position.z));
      }
    }
    this.referee.update(dt);
  }

  // ── Placar do combate (HTML) ────────────────────────────

  private showFightHud(a: Fighter, b: Fighter): void {
    this.hideFightHud();
    const el = document.createElement('div');
    el.className = 'fight-hud';
    const side = (f: Fighter, cls: string) => `
      <div class="fighter ${cls}" style="--c:${getCharacter(f.seat.characterId).color}">
        <div class="name">${esc(f.seat.name)}<span class="kd"></span></div>
        <div class="hp"><div class="trail"></div><div class="fill"></div></div>
        <div class="en"><div class="fill"></div></div>
      </div>`;
    el.innerHTML = `${side(a, 'left')}<div class="mid"><div class="rnd"></div><div class="time"></div></div>${side(b, 'right')}`;
    document.getElementById('ui')!.appendChild(el);
    this.hudEl = el;
    this.ctx.hud.setRound(null);
  }

  private hideFightHud(): void {
    this.hudEl?.remove();
    this.hudEl = null;
  }

  private updateFightHud(a: Fighter, b: Fighter, dt: number): void {
    const el = this.hudEl;
    if (!el) return;
    [a, b].forEach((f, i) => {
      const box = el.querySelectorAll<HTMLElement>('.fighter')[i]!;
      const hp = (f.health / BOXING.maxHealth) * 100;
      f.shownHealth += (hp - f.shownHealth) * Math.min(1, dt * 2.5);
      box.querySelector<HTMLElement>('.hp .fill')!.style.width = `${hp}%`;
      box.querySelector<HTMLElement>('.hp .trail')!.style.width = `${Math.max(hp, f.shownHealth)}%`;
      const en = box.querySelector<HTMLElement>('.en .fill')!;
      en.style.width = `${(f.energy / BOXING.maxEnergy) * 100}%`;
      en.classList.toggle('full', f.energy >= BOXING.maxEnergy * 0.95);
      box.querySelector<HTMLElement>('.kd')!.textContent = ' ' + '⬤'.repeat(f.knockdowns) + '◯'.repeat(Math.max(0, BOXING.knockdownsForKO - f.knockdowns));
      box.classList.toggle('counter', f.counterT > 0);
    });
    el.querySelector<HTMLElement>('.rnd')!.textContent = `Ronda ${Math.min(this.round, BOXING.rounds)}/${BOXING.rounds}`;
    el.querySelector<HTMLElement>('.time')!.textContent = String(Math.max(0, Math.ceil(this.clock)));
  }

  override dispose(): void {
    this.offSwing?.();
    this.hideFightHud();
    this.referee.dispose();
    super.dispose();
  }

  // ── Cenário ─────────────────────────────────────────────

  private makeGlove(color: string): THREE.Mesh {
    const g = mesh(new THREE.SphereGeometry(0.17, 16, 12), toonUnique(color, { emissive: '#ffffff', emissiveIntensity: 0 }));
    g.scale.set(1, 1.05, 1.2);
    const cuff = mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.12, 12), toon('#ffffff'));
    cuff.position.y = -0.14;
    g.add(cuff);
    return g;
  }

  private buildArena(): void {
    this.scene.background = new THREE.Color('#120a24');
    this.scene.fog = new THREE.Fog('#120a24', 20, 50);
    this.sun.intensity = 0.5;
    this.scene.add(new THREE.AmbientLight('#8a7fff', 0.5));

    // Ringue: base, lona com logótipo, cantos e cordas.
    const base = mesh(new THREE.BoxGeometry(RING * 2 + 0.8, 0.5, RING * 2 + 0.8), toon('#2f3a8f'), { receive: true });
    base.position.y = 0.25;
    const logo = document.createElement('canvas');
    logo.width = logo.height = 512;
    const g = logo.getContext('2d')!;
    g.fillStyle = '#f4f1ea';
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = '#2f7dff';
    g.lineWidth = 14;
    g.beginPath();
    g.arc(256, 256, 120, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#ff3b5c';
    g.font = 'bold 72px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('FESTA', 256, 256);
    const tex = new THREE.CanvasTexture(logo);
    tex.colorSpace = THREE.SRGBColorSpace;
    const canvas = mesh(new THREE.BoxGeometry(RING * 2, 0.02, RING * 2), new THREE.MeshToonMaterial({ map: tex }), { cast: false, receive: true });
    canvas.position.y = FLOOR;
    this.scene.add(base, canvas);
    const postColors = ['#ff3b5c', '#2f7dff', '#ffffff', '#ffffff'];
    const corners: [number, number][] = [[1, 1], [-1, -1], [1, -1], [-1, 1]];
    corners.forEach(([cx, cz], i) => {
      const post = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6), toon('#cfd3da'));
      post.position.set(cx * RING, 1.3, cz * RING);
      const pad = mesh(new THREE.BoxGeometry(0.3, 1.1, 0.3), toon(postColors[i]!));
      pad.position.set(cx * (RING - 0.1), 1.25, cz * (RING - 0.1));
      this.scene.add(post, pad);
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
    const floor = mesh(new THREE.PlaneGeometry(90, 90), toon('#1e1438'), { cast: false, receive: true });
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Mesa do sino.
    const table = mesh(new THREE.BoxGeometry(1.6, 0.8, 0.7), toon('#3b2566'));
    table.position.set(RING + 1.6, 0.4, RING + 1.2);
    this.bell = new THREE.Group();
    const dome = mesh(new THREE.SphereGeometry(0.28, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toonUnique('#ffd23f', { emissive: '#7a5a00', emissiveIntensity: 0.4 }));
    const stand = mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.25), toon('#6b4423'));
    stand.position.y = -0.12;
    this.bell.add(dome, stand);
    this.bell.position.set(RING + 1.6, 1.05, RING + 1.2);
    this.scene.add(table, this.bell);

    // Público: bancadas em degraus à volta (instanced).
    const spots: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const palette = ['#ff5a5f', '#3fa7ff', '#ffd23f', '#4cd964', '#b36bff', '#ff9f43', '#f2f2f2'];
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      for (let row = 0; row < 4; row++) {
        const d = RING + 2.6 + row * 1.1;
        const y = 0.3 + row * 0.55;
        const n = 18 + row * 2;
        for (let i = 0; i < n; i++) {
          const along = (i / (n - 1) - 0.5) * (d * 2 - 1);
          const x = dx !== 0 ? dx * d : along;
          const z = dz !== 0 ? dz * d : along;
          if (dx === 1 && dz === 0 && row === 0 && along > RING - 1 && along < RING + 3) continue; // espaço da mesa do sino
          const mtx = new THREE.Matrix4().compose(new THREE.Vector3(x + (rnd() - 0.5) * 0.3, y, z + (rnd() - 0.5) * 0.3), new THREE.Quaternion(), new THREE.Vector3(1, 0.9 + rnd() * 0.3, 1));
          spots.push(mtx);
          colors.push(new THREE.Color(palette[Math.floor(rnd() * palette.length)]!));
        }
      }
      const stand = mesh(new THREE.BoxGeometry(dx ? 4.6 : RING * 2 + 12, 2.4, dx ? RING * 2 + 12 : 4.6), toon('#2a1d4d'), { receive: true });
      stand.position.set(dx * (RING + 4.3), -0.2, dz * (RING + 4.3));
      this.scene.add(stand);
    }
    const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.35, 4, 8), new THREE.MeshToonMaterial(), spots.length);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshToonMaterial({ color: '#f3c9a0' }), spots.length);
    spots.forEach((m, i) => {
      bodies.setMatrixAt(i, m);
      bodies.setColorAt(i, colors[i]!);
    });
    this.scene.add(bodies, heads);
    this.crowd = { bodies, heads, base: spots, phase: spots.map(() => rnd() * Math.PI * 2) };

    // Árbitro (camisa às riscas = laço preto e etiqueta).
    const used = new Set(this.players.map((p) => p.characterId));
    const refDef = CHARACTERS.find((c) => !used.has(c.id)) ?? CHARACTERS[0]!;
    this.referee = new CharacterModel(refDef);
    this.referee.root.scale.setScalar(0.92);
    this.referee.root.position.set(0, FLOOR, -2);
    const tie = mesh(new THREE.BoxGeometry(0.28, 0.1, 0.08), toon('#111111'));
    tie.position.set(0, 1.55, 0.28);
    this.referee.root.add(tie);
    const tag = textSprite('Árbitro', { height: 0.3, color: '#ffffff', stroke: '#1d1433' });
    tag.position.y = 2.6;
    this.referee.root.add(tag);
    this.scene.add(this.referee.root);

    // Luzes: holofote por cima e luzes coloridas nos cantos.
    const spot = new THREE.SpotLight('#fff3dc', 160, 30, 0.6, 0.4);
    spot.position.set(0, 12, 2);
    spot.target.position.set(0, 0.5, 0);
    spot.castShadow = true;
    this.scene.add(spot, spot.target);
    for (const [x, z, c] of [[8, 8, '#ff3b5c'], [-8, -8, '#2f7dff'], [-8, 8, '#b36bff'], [8, -8, '#ffd23f']] as const) {
      const l = new THREE.PointLight(c, 30, 18);
      l.position.set(x, 6, z);
      this.scene.add(l);
    }
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
