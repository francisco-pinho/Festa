/**
 * «Fotografia Certa» (todos contra todos): passam animais pelo prado (ovelhas, pássaros,
 * borboletas…) e o jogo pede um: «Fotografa o pássaro amarelo!». Cada um mexe a sua moldura
 * (da sua cor) com o joystick e tira a foto com Ⓐ — uma foto por pedido. Quanto mais centrado
 * estiver o animal certo, mais pontos (até 100). 3 pedidos; ganha quem somar mais.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { getCharacter } from '@festa/game';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

const PLANE_Z = -8;
const REQUESTS = 3;
const REQUEST_TIME = 9;
const FRAME = 2.2;

type Kind = 'sheepWhite' | 'sheepBlack' | 'birdYellow' | 'birdBlue' | 'butterfly';
const KIND_NAME: Record<Kind, string> = {
  sheepWhite: 'a ovelha branca',
  sheepBlack: 'a ovelha preta',
  birdYellow: 'o pássaro amarelo',
  birdBlue: 'o pássaro azul',
  butterfly: 'a borboleta',
};

interface Subject {
  kind: Kind;
  obj: THREE.Group;
  x: number;
  y: number;
  z: number;
  vx: number;
  phase: number;
  flies: boolean;
}

function makeSubject(kind: Kind): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'sheepWhite' || kind === 'sheepBlack') {
    const wool = toon(kind === 'sheepWhite' ? '#f7f5ef' : '#2b2733');
    const body = mesh(new THREE.SphereGeometry(0.7, 14, 10), wool);
    body.scale.set(1.3, 0.9, 0.9);
    body.position.y = 0.9;
    const head = mesh(new THREE.SphereGeometry(0.3, 10, 8), toon('#3a3340'));
    head.position.set(0.9, 1.05, 0);
    g.add(body, head);
    for (const lx of [-0.45, 0.45]) {
      const leg = mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.6, 6), toon('#3a3340'));
      leg.position.set(lx, 0.3, 0);
      g.add(leg);
    }
  } else if (kind === 'butterfly') {
    for (const s of [-1, 1]) {
      const wing = mesh(new THREE.CircleGeometry(0.45, 12), toonUnique('#ff6fb5', { side: THREE.DoubleSide }), { cast: false });
      wing.position.set(0, 0, s * 0.3);
      wing.rotation.y = Math.PI / 2;
      wing.userData.wing = s;
      g.add(wing);
    }
    const body = mesh(new THREE.CapsuleGeometry(0.06, 0.4, 4, 8), toon('#3a3150'));
    body.rotation.z = Math.PI / 2;
    g.add(body);
  } else {
    const color = kind === 'birdYellow' ? '#ffd23f' : '#3fa7ff';
    const body = mesh(new THREE.SphereGeometry(0.4, 12, 10), toon(color));
    body.scale.set(1.3, 1, 1);
    const beak = mesh(new THREE.ConeGeometry(0.1, 0.25, 6), toon('#ff8c1a'));
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.6, 0.05, 0);
    g.add(body, beak);
    for (const s of [-1, 1]) {
      const wing = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.6), toon(color), { cast: false });
      wing.position.set(0, 0.15, s * 0.45);
      wing.userData.wing = s;
      g.add(wing);
    }
  }
  return g;
}

class PhotoRun extends RowMinigame {
  protected readonly duration = REQUESTS * (REQUEST_TIME + 2.5) + 2;
  private readonly subjects: Subject[] = [];
  private readonly frames = new Map<string, THREE.Group>();
  private readonly aim = new Map<string, THREE.Vector2>();
  private readonly shot = new Map<string, number>();
  private readonly total = new Map<string, number>();
  private readonly botPlan = new Map<string, { off: THREE.Vector2; at: number }>();
  private request = 0;
  private target: Kind = 'birdYellow';
  private phase: 'shoot' | 'result' = 'result';
  private t = 0;
  private sign: THREE.Sprite | null = null;
  private flash: THREE.Mesh;

  constructor(ctx: MinigameContext) {
    super(ctx, { spacing: 2.3 });
    // Fotógrafos à frente, de costas para nós, a olhar para o prado.
    this.row.forEach((r, i) => {
      r.model.root.position.z = 2.5;
      r.model.faceYaw(Math.PI, true);
      this.total.set(r.seat.id, 0);
      const color = getCharacter(r.seat.characterId).color;
      const frame = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
      const bar = (w: number, h: number, x: number, y: number) => {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        b.position.set(x, y, 0);
        b.renderOrder = 20;
        frame.add(b);
      };
      const s = FRAME / 2;
      bar(FRAME, 0.1, 0, s);
      bar(FRAME, 0.1, 0, -s);
      bar(0.1, FRAME, -s, 0);
      bar(0.1, FRAME, s, 0);
      bar(0.35, 0.06, 0, 0);
      bar(0.06, 0.35, 0, 0);
      frame.position.z = PLANE_Z + 0.5;
      this.scene.add(frame);
      this.frames.set(r.seat.id, frame);
      this.aim.set(r.seat.id, new THREE.Vector2(-6 + i * 3, 2.5));
    });
    // Cercas e flores no prado
    for (let i = -10; i <= 10; i += 2) {
      const post = mesh(new THREE.BoxGeometry(0.15, 1, 0.15), toon('#a8743f'));
      post.position.set(i, 0.5, -13);
      this.scene.add(post);
    }
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthTest: false }));
    this.flash.renderOrder = 30;
    this.camera.position.set(0, 4, 9);
    this.camera.lookAt(0, 2.2, PLANE_Z);
    this.flash.position.set(0, 3, 6);
    this.flash.lookAt(this.camera.position);
    this.scene.add(this.flash);
    this.setSign('Prepara a câmara!', '#ffd23f');
  }

  private setSign(text: string, color = '#ffffff'): void {
    if (this.sign) {
      this.scene.remove(this.sign);
      disposeObject(this.sign);
    }
    this.sign = textSprite(text, { height: 0.9, color, stroke: '#1d1433' });
    this.sign.position.set(0, 7, PLANE_Z + 1);
    this.scene.add(this.sign);
  }

  scores(): MinigameScore[] {
    return this.row.map((r) => ({ id: r.seat.id, value: `📸 ${this.total.get(r.seat.id) ?? 0} pts` }));
  }

  winners(): string[] {
    const best = Math.max(...this.total.values());
    const top = this.row.filter((r) => this.total.get(r.seat.id) === best);
    return best === 0 || (top.length === this.row.length && this.row.length > 1) ? [] : top.map((r) => r.seat.id);
  }

  private clearSubjects(): void {
    for (const s of this.subjects) {
      this.scene.remove(s.obj);
      disposeObject(s.obj);
    }
    this.subjects.length = 0;
  }

  private newRequest(): void {
    this.request++;
    this.phase = 'shoot';
    this.t = 0;
    this.shot.clear();
    this.botPlan.clear();
    this.clearSubjects();
    const kinds: Kind[] = ['sheepWhite', 'sheepBlack', 'birdYellow', 'birdBlue', 'butterfly'];
    this.target = kinds[Math.floor(this.ctx.rng.next() * kinds.length)]!;
    // O alvo e uns quantos «distratores» a passar (alguns parecidos com o alvo).
    const list: Kind[] = [this.target];
    for (let i = 0; i < 4 + this.request; i++) list.push(kinds[Math.floor(this.ctx.rng.next() * kinds.length)]!);
    for (const kind of list) {
      const flies = kind.startsWith('bird') || kind === 'butterfly';
      const dir = this.ctx.rng.next() < 0.5 ? 1 : -1;
      const speed = (flies ? 2.2 : 1.4) + this.ctx.rng.next() * 1.4 + this.request * 0.4;
      const obj = makeSubject(kind);
      const s: Subject = {
        kind,
        obj,
        x: -dir * (8 + this.ctx.rng.next() * 6),
        y: flies ? 2.5 + this.ctx.rng.next() * 2.5 : 0,
        z: PLANE_Z + (this.ctx.rng.next() - 0.5) * 2,
        vx: dir * speed,
        phase: this.ctx.rng.next() * 6,
        flies,
      };
      obj.rotation.y = dir > 0 ? 0 : Math.PI;
      this.scene.add(obj);
      this.subjects.push(s);
    }
    this.setSign(`Fotografa ${KIND_NAME[this.target]}!`, '#ffd23f');
    sound.play('banner');
    for (const r of this.row) {
      this.pressed(r, 'a');
      if (this.isBot(r)) {
        const err = (1 - this.ctx.botSkill) * 1.3 + 0.15;
        this.botPlan.set(r.seat.id, { off: new THREE.Vector2((this.ctx.rng.next() - 0.5) * err, (this.ctx.rng.next() - 0.5) * err), at: 2.5 + this.ctx.rng.next() * 4 });
      }
    }
  }

  /** Centro do animal no plano das molduras (os voadores são mais pequenos: o centro é o corpo). */
  private centerOf(s: Subject): THREE.Vector2 {
    return new THREE.Vector2(s.x, s.y + (s.flies ? 0 : 0.9));
  }

  private snap(r: Rower): void {
    if (this.shot.has(r.seat.id)) return;
    const aim = this.aim.get(r.seat.id)!;
    // O animal mais perto do centro da moldura conta; se não for o pedido, vale 0.
    let best: Subject | null = null;
    let bd = Infinity;
    for (const s of this.subjects) {
      const d = this.centerOf(s).distanceTo(aim);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    const inFrame = bd < FRAME * 0.6;
    const pts = best && inFrame && best.kind === this.target ? Math.max(5, Math.round(100 - bd * 70)) : 0;
    this.shot.set(r.seat.id, pts);
    this.total.set(r.seat.id, (this.total.get(r.seat.id) ?? 0) + pts);
    sound.play('click', { pitch: 0.7 });
    (this.flash.material as THREE.MeshBasicMaterial).opacity = 0.35;
    this.float(pts ? `📸 ${pts}` : '📸 0', aim.x, aim.y + 1.6, pts >= 70 ? '#4cd964' : pts ? '#ffd23f' : '#ff6b7a', 0.6, PLANE_Z + 1);
    this.ctx.vibrate(r.seat.id, 40);
  }

  protected step(dt: number): void {
    this.t += dt;
    if (this.phase === 'result') {
      if (this.t > (this.request === 0 ? 1.5 : 2.5)) {
        if (this.request >= REQUESTS) return this.endGame();
        this.newRequest();
      }
      return;
    }
    for (const s of this.subjects) {
      s.x += s.vx * dt;
      s.phase += dt;
      const bob = s.flies ? Math.sin(s.phase * 3) * 0.6 : Math.abs(Math.sin(s.phase * 6)) * 0.12;
      s.obj.position.set(s.x, s.y + bob, s.z);
      s.obj.traverse((o) => {
        if (o.userData.wing) o.rotation.x = Math.sin(s.phase * 20) * 0.7 * (o.userData.wing as number);
      });
    }
    for (const r of this.row) {
      const aim = this.aim.get(r.seat.id)!;
      if (this.isBot(r)) {
        const plan = this.botPlan.get(r.seat.id);
        const tgt = this.subjects.find((s) => s.kind === this.target);
        if (plan && tgt && !this.shot.has(r.seat.id)) {
          const want = this.centerOf(tgt).add(plan.off);
          aim.lerp(want, Math.min(1, dt * (2 + this.ctx.botSkill * 3)));
          if (this.t > plan.at && aim.distanceTo(want) < 0.4) this.snap(r);
        }
      } else if (!this.shot.has(r.seat.id)) {
        const pad = this.ctx.pad(r.seat.id);
        aim.x += pad.stick.x * 7 * dt;
        aim.y -= pad.stick.y * 7 * dt;
        if (this.pressed(r, 'a')) this.snap(r);
      }
      aim.x = Math.max(-10, Math.min(10, aim.x));
      aim.y = Math.max(0.6, Math.min(6.5, aim.y));
    }
    if (this.t > REQUEST_TIME || this.row.every((r) => this.shot.has(r.seat.id))) {
      for (const r of this.row) if (!this.shot.has(r.seat.id)) this.shot.set(r.seat.id, 0);
      this.phase = 'result';
      this.t = 0;
      const best = Math.max(...this.row.map((r) => this.shot.get(r.seat.id) ?? 0));
      this.setSign(best ? `Melhor foto: ${best} pontos!` : 'Ninguém o apanhou!', best ? '#4cd964' : '#ff6b7a');
    }
  }

  protected override animate(dt: number): void {
    for (const r of this.row) {
      const f = this.frames.get(r.seat.id)!;
      const a = this.aim.get(r.seat.id)!;
      f.position.x = a.x;
      f.position.y = a.y;
      f.visible = this.phase === 'shoot' && !this.shot.has(r.seat.id);
    }
    const m = this.flash.material as THREE.MeshBasicMaterial;
    m.opacity = Math.max(0, m.opacity - dt * 2);
  }
}

export const PhotoShoot: MinigameDef = {
  id: 'fotografia',
  rounds: 1,
  name: 'Fotografia Certa',
  modes: ['ffa'],
  description: () =>
    'Passam animais pelo prado e o jogo pede um. Mexe a tua moldura com o joystick e tira a foto com Ⓐ — só uma por pedido! Quanto mais centrado o animal certo, mais pontos.',
  controls: '🕹️ Apontar · Ⓐ Fotografar',
  stick: true,
  buttons: [{ id: 'a', label: 'Fotografar' }],
  create: (ctx) => new PhotoRun(ctx),
};
