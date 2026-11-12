/**
 * «Balão Rebentão»: enche o balão com a bomba de ar, mas no tempo certo! Ao lado de cada um há um
 * medidor com um marcador a subir e a descer: Ⓐ na zona verde dá uma bombada forte, na amarela
 * média e na vermelha quase nada (e entre bombadas há uma pausa, por isso carregar à toa não serve).
 * Também se pode abanar o telemóvel: cada abanão é uma bombada (quanto mais abanas, mais enche).
 * O primeiro a rebentar o balão ganha. Em equipas, cada equipa enche um balão gigante em conjunto.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { getCharacter } from '@festa/game';
import { mesh, toon, toonUnique } from '../three/materials';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { rankBy } from './rank';

interface BalloonObj {
  group: THREE.Group;
  /** Um balão por jogador (em equipa enchem todos juntos: o ar é partilhado). */
  balls: THREE.Mesh[];
  knots: THREE.Mesh[];
  /** Meio do grupo (para os textos). */
  x: number;
  /** Quem enche este balão. */
  owners: Rower[];
  air: number;
  need: number;
  popped: boolean;
  poppedAt: number;
}

interface Gauge {
  marker: THREE.Mesh;
  phase: number;
  speed: number;
  cooldown: number;
}

const GAUGE_H = 1.8;
const GREEN = 0.84;
const YELLOW = 0.58;
/** Posição do marcador (0 em baixo, 1 em cima). */
const level = (g: Gauge) => (Math.sin(g.phase) + 1) / 2;

class BalloonRun extends RowMinigame {
  protected readonly duration = 35;
  private readonly gauges = new Map<string, Gauge>();
  private readonly balloons: BalloonObj[] = [];
  private order = 0;
  private readonly botNext = new Map<string, number>();

  constructor(ctx: MinigameContext) {
    super(ctx, { spacing: 2.6 });
    const teams = ctx.mode !== 'ffa';
    const groups: Rower[][] = teams
      ? (['blue', 'red'] as const).map((t) => this.row.filter((r) => r.seat.team === t)).filter((g) => g.length)
      : this.row.map((r) => [r]);
    for (const owners of groups) {
      const x = owners.reduce((s, r) => s + r.x, 0) / owners.length;
      const color = teams ? (owners[0]!.seat.team === 'blue' ? '#2f7dff' : '#ff3b5c') : getCharacter(owners[0]!.seat.characterId).color;
      const group = new THREE.Group();
      const balls: THREE.Mesh[] = [];
      const knots: THREE.Mesh[] = [];
      const ballMat = toonUnique(color, { emissive: color, emissiveIntensity: 0.15 });
      for (const r of owners) {
        // Balão e bomba de ar à frente de cada jogador.
        const ball = mesh(new THREE.SphereGeometry(1, 24, 18), ballMat);
        ball.scale.set(0.3, 0.36, 0.3);
        const knot = mesh(new THREE.ConeGeometry(0.08, 0.16, 8), toon(color), { cast: false });
        ball.position.set(r.x, 1, -1.6);
        knot.position.set(r.x, 1, -1.6);
        group.add(ball, knot);
        balls.push(ball);
        knots.push(knot);
        const pump = mesh(new THREE.CylinderGeometry(0.16, 0.2, 1, 12), toon('#c9ccd4'));
        pump.position.set(r.x + 0.7, 0.5, -0.8);
        this.scene.add(pump);
      }
      this.scene.add(group);
      this.balloons.push({ group, balls, knots, x, owners, air: 0, need: teams ? 26 * owners.length : 30, popped: false, poppedAt: 0 });
    }
    // Medidor de cada jogador: vermelho em baixo, amarelo, verde em cima; o marcador branco sobe e desce.
    for (const r of this.row) {
      const g = new THREE.Group();
      const part = (from: number, to: number, color: string) => {
        const m = mesh(new THREE.BoxGeometry(0.22, (to - from) * GAUGE_H, 0.1), toonUnique(color, { emissive: color, emissiveIntensity: 0.25 }), { cast: false });
        m.position.y = ((from + to) / 2) * GAUGE_H;
        g.add(m);
      };
      part(0, YELLOW, '#ff5a5f');
      part(YELLOW, GREEN, '#ffd23f');
      part(GREEN, 1, '#4cd964');
      const marker = mesh(new THREE.BoxGeometry(0.42, 0.07, 0.14), toonUnique('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 }), { cast: false });
      g.add(marker);
      g.position.set(r.x + 1, 0.4, 0.3);
      this.scene.add(g);
      // Cada ronda começa com o marcador em baixo (seno = -1).
      this.gauges.set(r.seat.id, { marker, phase: -Math.PI / 2, speed: 3.2, cooldown: 0 });
    }
  }

  private balloonOf(r: Rower): BalloonObj | undefined {
    return this.balloons.find((b) => b.owners.includes(r));
  }

  scores(): MinigameScore[] {
    return this.row.map((r) => {
      const b = this.balloonOf(r)!;
      return { id: r.seat.id, value: b.popped ? `💥 ${b.poppedAt}.º` : `🎈 ${Math.round((b.air / b.need) * 100)}%` };
    });
  }

  override ranking(): string[][] {
    // Quem rebentou (pela ordem) e depois o balão mais cheio.
    return rankBy(this.row.map((r) => r.seat.id), (id) => {
      const b = this.balloons.find((x) => x.owners.some((o) => o.seat.id === id))!;
      return b.popped ? 1e6 - b.poppedAt : b.air / b.need;
    });
  }

  winners(): string[] {
    const first = this.balloons.find((b) => b.poppedAt === 1);
    if (first) return first.owners.map((r) => r.seat.id);
    // Ninguém rebentou: ganha quem tem o balão mais cheio.
    const best = Math.max(...this.balloons.map((b) => b.air / b.need));
    const top = this.balloons.filter((b) => b.air / b.need === best);
    return best > 0 && top.length === 1 ? top[0]!.owners.map((r) => r.seat.id) : [];
  }

  protected step(dt: number): void {
    for (const r of this.row) {
      const b = this.balloonOf(r)!;
      if (b.popped) continue;
      const g = this.gauges.get(r.seat.id)!;
      g.cooldown -= dt;
      let press = false;
      if (this.isBot(r)) {
        // Bot: espera pelo marcador perto do topo (mais certeiro quanto maior a dificuldade).
        let want = this.botNext.get(r.seat.id);
        if (want === undefined) {
          want = Math.min(0.99, GREEN + 0.08 - (1 - this.ctx.botSkill) * 0.45 * this.ctx.rng.next());
          this.botNext.set(r.seat.id, want);
        }
        if (g.cooldown <= 0 && level(g) >= want) {
          press = true;
          this.botNext.delete(r.seat.id);
        }
      } else press = this.pressed(r, 'a');
      if (!press || g.cooldown > 0) continue;
      g.cooldown = 0.25;
      const lv = level(g);
      // A cada bombada o marcador muda de velocidade (para não ficar sempre igual).
      g.speed = 2.4 + this.ctx.rng.next() * 3.2;
      const zone = lv >= GREEN ? 'verde' : lv >= YELLOW ? 'amarela' : 'vermelha';
      const pumps = zone === 'verde' ? 3 : zone === 'amarela' ? 1.6 : 0.8;
      if (zone === 'verde') this.float('✨', r.x + 1, 2.6, '#4cd964', 0.5);
      this.ctx.vibrate(r.seat.id, zone === 'verde' ? 40 : 15);
      b.air += pumps;
      r.model.setAnim(r.model.anim === 'punchLeft' ? 'punchRight' : 'punchLeft');
      if (b.air >= b.need) {
        b.popped = true;
        b.poppedAt = ++this.order;
        sound.play('firework');
        for (const o of b.owners) {
          this.ctx.vibrate(o.seat.id, 250);
          o.model.setAnim(b.poppedAt === 1 ? 'cheer' : 'idle');
        }
        this.float(b.poppedAt === 1 ? '💥 1.º!' : `💥 ${b.poppedAt}.º`, b.x, 3.2, '#ffd23f', 0.9);
        b.group.visible = false;
        if (b.poppedAt === 1) this.elapsed = Math.max(this.elapsed, this.duration - 2.5);
      } else if (b.air > b.need * 0.8) this.ctx.vibrate(r.seat.id, 15);
    }
    if (this.balloons.every((b) => b.popped)) this.endGame();
  }

  protected override animate(dt: number, time: number): void {
    for (const g of this.gauges.values()) {
      if (this.running) g.phase += g.speed * dt;
      g.marker.position.y = level(g) * GAUGE_H;
    }
    for (const b of this.balloons) {
      const k = Math.min(1, b.air / b.need);
      const s = 0.3 + k * 1.1;
      const shake = k > 0.8 ? Math.sin(time * 40) * 0.04 * (k - 0.8) * 5 : 0;
      for (const ball of b.balls) {
        ball.scale.set(s + shake, s * 1.18, s - shake);
        ball.position.y = 1 + s * 1.18;
      }
      for (const knot of b.knots) knot.position.y = 1;
    }
  }
}

export const Balloon: MinigameDef = {
  id: 'balao',
  rounds: 3,
  name: 'Balão Rebentão',
  modes: ['ffa', 'teams', 'oneVsAll'],
  description: (mode) =>
    mode === 'ffa'
      ? 'Abana o telemóvel (ou carrega em Ⓐ) para encher o balão: quanto mais abanas, mais enche! Se a bombada calhar com o marcador na zona verde, vale a dobrar. Quem o rebentar primeiro ganha!'
      : mode === 'oneVsAll'
        ? 'Um contra todos: o solitário enche o seu balão sozinho, os outros enchem um balão gigante juntos (precisa de mais ar). Abana o telemóvel (ou Ⓐ), de preferência no verde! Quem rebentar primeiro ganha.'
        : 'Cada equipa enche um balão gigante em conjunto: abanem os telemóveis (ou Ⓐ), melhor ainda com o marcador no verde! A primeira a rebentá-lo ganha.',
  controls: '📳 Abanar o telemóvel = bombear · Ⓐ Bombear · Verde vale mais',
  stick: false,
  buttons: [{ id: 'a', label: 'Bombear' }],
  shake: true,
  create: (ctx) => new BalloonRun(ctx),
};
