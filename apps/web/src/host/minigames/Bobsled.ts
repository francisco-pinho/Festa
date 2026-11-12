/**
 * «Corrida de Bobsled» (equipas): cada equipa no seu trenó, cada um na sua pista de gelo, lado
 * a lado, a descer a montanha. No arranque, Ⓐ depressa para empurrar (mais força = sai mais rápido).
 * Depois, nas curvas o trenó é atirado para fora: inclinem-se com o joystick para o lado de dentro
 * (conta a média da equipa). Bater nas paredes trava. A primeira equipa a cortar a meta ganha.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { TEAM_COLORS } from './ArenaMinigame';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const W = 3.2; // largura da pista
const PUSH = 3.2; // segundos de empurrão
const LANE_X = 4.2; // distância de cada pista ao meio

const PATH = [
  [0, 9, 6],
  [0, 8.4, -6],
  [5, 7.4, -20],
  [6, 6.4, -34],
  [-3, 5.2, -48],
  [-6, 4.2, -62],
  [1, 3, -76],
  [5, 2, -90],
  [0, 1, -104],
  [0, 0.6, -114],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));

interface Sled {
  team: 'blue' | 'red';
  crew: Rower[];
  curve: THREE.CatmullRomCurve3;
  length: number;
  group: THREE.Group;
  s: number;
  u: number;
  uv: number;
  v: number;
  finishedAt: number;
  wallHit: number;
}

class BobsledRun extends RowMinigame {
  protected readonly duration = 40;
  private readonly sleds: Sled[] = [];
  private order = 0;
  private readonly botMash = new Map<string, number>();
  private sign: THREE.Sprite | null = null;

  constructor(ctx: MinigameContext) {
    super(ctx, { ground: null, decor: false });
    const snow = mesh(new THREE.PlaneGeometry(200, 260), toon('#f4f8ff'), { cast: false, receive: true });
    snow.rotation.x = -Math.PI / 2;
    snow.position.set(0, -0.6, -60);
    this.scene.add(snow);
    // Pinheiros ao longo da descida
    for (let i = 0; i < 40; i++) {
      const tree = new THREE.Group();
      const top = mesh(new THREE.ConeGeometry(1.2, 3.2, 8), toon(i % 2 ? '#2f8a5a' : '#3f9d4a'));
      top.position.y = 2;
      const cap = mesh(new THREE.ConeGeometry(0.7, 1.2, 8), toon('#ffffff'), { cast: false });
      cap.position.y = 3.3;
      tree.add(top, cap);
      const side = i % 2 ? 1 : -1;
      const p = PATH[Math.min(PATH.length - 1, Math.floor((i / 40) * PATH.length))]!;
      tree.position.set(p.x + side * (LANE_X + 5 + ((i * 7) % 6)), p.y - 1.5, p.z + ((i * 13) % 10) - 5);
      this.scene.add(tree);
    }
    (['blue', 'red'] as const).forEach((team, i) => {
      const crew = this.row.filter((r) => r.seat.team === team);
      if (!crew.length) return;
      const off = i === 0 ? -LANE_X : LANE_X;
      const curve = new THREE.CatmullRomCurve3(PATH.map((p) => p.clone().add(new THREE.Vector3(off, 0, 0))));
      this.buildTrack(curve, team);
      const group = new THREE.Group();
      const body = mesh(new THREE.CapsuleGeometry(0.7, 1.2 + crew.length * 0.9, 6, 14), toonUnique(TEAM_COLORS[team]));
      body.rotation.x = Math.PI / 2;
      body.scale.set(1, 1, 0.55);
      body.position.y = 0.35;
      const runner = mesh(new THREE.BoxGeometry(0.1, 0.1, 2.4 + crew.length * 0.9), toon('#d9dde3'));
      for (const sx of [-0.45, 0.45]) {
        const rr = runner.clone();
        rr.position.set(sx, 0, 0);
        group.add(rr);
      }
      group.add(body);
      crew.forEach((r, k) => {
        r.model.root.position.set(0, 0.25, 0.6 + (crew.length - 1) * 0.45 - k * 0.9);
        r.model.faceYaw(Math.PI, true);
        r.model.setAnim('sit');
        r.model.restAnim = 'sit';
        group.add(r.model.root);
      });
      this.scene.add(group);
      this.sleds.push({ team, crew, curve, length: curve.getLength(), group, s: 0, u: 0, uv: 0, v: 0, finishedAt: 0, wallHit: 0 });
    });
    this.setSign('Ⓐ depressa para empurrar!', '#ffd23f');
  }

  /** Pista: fita de gelo com paredes dos dois lados. */
  private buildTrack(curve: THREE.CatmullRomCurve3, team: 'blue' | 'red'): void {
    const N = 220;
    const pos: number[] = [];
    const idx: number[] = [];
    const wallL: THREE.Vector3[] = [];
    const wallR: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const right = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      const l = p.clone().addScaledVector(right, -W / 2);
      const r = p.clone().addScaledVector(right, W / 2);
      pos.push(l.x, l.y, l.z, r.x, r.y, r.z);
      wallL.push(l.clone().setY(l.y + 0.35));
      wallR.push(r.clone().setY(r.y + 0.35));
      if (i < N) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const ice = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#cfeeff', roughness: 0.1, clearcoat: 1, side: THREE.DoubleSide }));
    ice.receiveShadow = true;
    this.scene.add(ice);
    for (const pts of [wallL, wallR]) {
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, 0.3, 6), toon(team === 'blue' ? '#9fc5ff' : '#ffb3c1'));
      tube.castShadow = true;
      this.scene.add(tube);
    }
    // Meta
    const end = curve.getPointAt(0.985);
    const banner = mesh(new THREE.BoxGeometry(W + 1, 0.5, 0.2), toonUnique('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.3 }), { cast: false });
    banner.position.set(end.x, end.y + 3, end.z);
    this.scene.add(banner);
  }

  private setSign(text: string, color = '#ffffff'): void {
    if (this.sign) {
      this.scene.remove(this.sign);
      disposeObject(this.sign);
      this.sign = null;
    }
    if (!text) return;
    this.sign = textSprite(text, { height: 1, color, stroke: '#1d1433' });
    this.scene.add(this.sign);
  }

  scores(): MinigameScore[] {
    return this.row.map((r) => {
      const s = this.sleds.find((x) => x.crew.includes(r));
      if (!s) return { id: r.seat.id, value: '' };
      return { id: r.seat.id, value: s.finishedAt ? `🏁 ${s.finishedAt}.º` : `🛷 ${Math.round((s.s / s.length) * 100)}%` };
    });
  }

  winners(): string[] {
    const first = this.sleds.find((s) => s.finishedAt === 1) ?? [...this.sleds].sort((a, b) => b.s / b.length - a.s / a.length)[0];
    if (!first) return [];
    if (!first.finishedAt && this.sleds.length > 1 && Math.abs(this.sleds[0]!.s - this.sleds[1]!.s) < 1) return [];
    return first.crew.map((r) => r.seat.id);
  }

  protected step(dt: number): void {
    const pushing = this.elapsed < PUSH;
    if (!pushing && this.sign && this.elapsed < PUSH + 0.1) this.setSign('');
    for (const s of this.sleds) {
      if (s.finishedAt) {
        s.v = Math.max(0, s.v - dt * 8);
        s.s = Math.min(s.length, s.s + s.v * dt);
        continue;
      }
      if (pushing) {
        // Empurrão: cada carregadela dá velocidade de saída.
        for (const r of s.crew) {
          let push = false;
          if (this.isBot(r)) {
            const t = (this.botMash.get(r.seat.id) ?? 0) - dt;
            this.botMash.set(r.seat.id, t);
            if (t <= 0) {
              push = true;
              this.botMash.set(r.seat.id, (0.2 - this.ctx.botSkill * 0.07) * (0.7 + this.ctx.rng.next() * 0.6));
            }
          } else push = this.pressed(r, 'a');
          if (push) {
            s.v = Math.min(11, s.v + 0.45 / s.crew.length);
            this.ctx.vibrate(r.seat.id, 12);
            r.model.setAnim(r.model.anim === 'punchLeft' ? 'punchRight' : 'punchLeft');
          }
        }
        s.s += s.v * 0.15 * dt;
        continue;
      }
      // Descida: a gravidade acelera, o atrito trava; nas curvas o trenó é atirado para fora.
      const t = Math.min(0.999, s.s / s.length);
      const tan = s.curve.getTangentAt(t);
      const tan2 = s.curve.getTangentAt(Math.min(0.999, t + 0.01));
      const right = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      const turn = tan2.clone().sub(tan).dot(right) / Math.max(0.01, 0.01 * s.length); // curvatura com sinal
      s.v = Math.min(22, s.v + (Math.max(0, -tan.y) * 22 - 0.25 - s.v * 0.01) * dt);
      // Inclinação da equipa (média do joystick); os bots compensam a curva.
      let lean = 0;
      for (const r of s.crew) {
        if (this.isBot(r)) {
          const want = turn * s.v * s.v * 0.05 - s.u * 0.4 + (1 - this.ctx.botSkill) * Math.sin(this.elapsed * 2 + r.x) * 0.5;
          lean += Math.max(-1, Math.min(1, want));
        } else lean += this.ctx.pad(r.seat.id).stick.x;
      }
      lean /= s.crew.length;
      s.uv += (-turn * s.v * s.v * 0.05 + lean * 1.3) * 6 * dt;
      s.uv *= Math.exp(-3 * dt);
      s.u += s.uv * dt;
      if (Math.abs(s.u) > W / 2 - 0.5) {
        s.u = Math.sign(s.u) * (W / 2 - 0.5);
        s.uv *= -0.3;
        if (s.wallHit <= 0) {
          s.v *= 0.82;
          s.wallHit = 0.4;
          sound.play('hit', { vol: 0.5 });
          for (const r of s.crew) this.ctx.vibrate(r.seat.id, 120);
        }
      }
      s.wallHit -= dt;
      s.s += s.v * dt;
      if (s.s >= s.length * 0.985) {
        s.finishedAt = ++this.order;
        sound.play(s.finishedAt === 1 ? 'win' : 'whistle');
        for (const r of s.crew) {
          r.model.setAnim('cheer');
          this.ctx.vibrate(r.seat.id, 250);
        }
        if (s.finishedAt === 1) this.elapsed = Math.max(this.elapsed, this.duration - 3);
      }
    }
    if (this.sleds.every((s) => s.finishedAt)) this.endGame();
  }

  protected override animate(dt: number): void {
    let lead: Sled | null = null;
    for (const s of this.sleds) {
      const t = Math.min(0.999, s.s / s.length);
      const p = s.curve.getPointAt(t);
      const tan = s.curve.getTangentAt(t);
      const right = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      s.group.position.copy(p).addScaledVector(right, s.u).setY(p.y + 0.15);
      s.group.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI;
      s.group.rotation.z = -s.uv * 0.08;
      if (!lead || s.s > lead.s) lead = s;
    }
    if (!lead) return;
    const t = Math.min(0.999, lead.s / lead.length);
    const p = lead.curve.getPointAt(t);
    const tan = lead.curve.getTangentAt(t);
    const mid = new THREE.Vector3(0, 0, 0);
    for (const s of this.sleds) mid.add(s.group.position);
    mid.divideScalar(Math.max(1, this.sleds.length));
    const want = new THREE.Vector3(mid.x - tan.x * 9, p.y + 6, p.z - tan.z * 9);
    this.camera.position.lerp(want, Math.min(1, dt * 3));
    this.camera.lookAt(mid.x + tan.x * 6, p.y, p.z + tan.z * 6);
    if (this.sign) this.sign.position.set(mid.x, p.y + 4, p.z - 3);
  }

  override endGame(): void {
    for (const r of this.row) r.model.restAnim = 'idle';
    super.endGame();
  }
}

export const Bobsled: MinigameDef = {
  id: 'bobsled',
  rounds: 2,
  name: 'Corrida de Bobsled',
  modes: ['teams'],
  description: () =>
    'Corrida de trenós! No arranque, Ⓐ depressa para empurrar. Depois, nas curvas, inclinem-se com o joystick para o lado de DENTRO — conta a média da equipa. Bater nas paredes trava!',
  controls: 'Ⓐ Empurrar (início) · 🕹️ Inclinar',
  stick: true,
  buttons: [{ id: 'a', label: 'Empurrar' }],
  create: (ctx) => new BobsledRun(ctx),
};
