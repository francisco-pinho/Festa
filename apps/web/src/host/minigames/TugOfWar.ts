/**
 * "Cabo de Guerra": carrega em A e B alternadamente para puxar a corda. No meio há um buraco:
 * quem vai à frente e é arrastado até lá cai lá dentro (larga a corda). Os de trás continuam a
 * puxar, mas ficam com menos gente. Perde a equipa que cair toda (ou, no fim do tempo, a que tiver
 * menos gente de pé / estiver a perder).
 * Modos: duelo (1 contra 1), equipas (2 contra 2) e 1 contra 3 — o que está sozinho é maior e mais forte.
 * A corda passa pelas mãos de cada um (curva refeita a cada frame), cai no chão atrás do último
 * e os pés não deslizam: cada um dá passos (para a frente ou para trás) quando a corda o leva.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { getCharacter } from '@festa/game';
import { CharacterModel } from '../three/CharacterModel';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { damp } from '../three/tweens';
import { setupSky } from '../stages/environment';
import { ropeTexture } from './JumpRope';
import { themeGround, themeScenery } from './scenery';
import type { MinigameContext, MinigameDef, MinigameRun, MinigameScore, MinigameSeat } from './types';

/** Raio do buraco. */
const HOLE_R = 1.3;
/** Distância do da frente à fita (no início) e entre colegas de equipa. */
const GAP = 3.4;
const SLOT = 1.25;
/** Quanto cada puxão mexe a corda. */
const PULL = 0.09;
/** Passo: a partir de que distância à corda dá um passo, e quanto tempo leva. */
const STEP = 0.3;
const STEP_T = 0.26;
const ROPE_R = 0.065;

interface Puller {
  seat: MinigameSeat;
  model: CharacterModel;
  /** -1 = esquerda, 1 = direita. */
  side: -1 | 1;
  /** Lugar na fila (0 = à frente). */
  slot: number;
  /** Força de cada puxão (o que está sozinho no 1 contra 3 puxa mais). */
  str: number;
  x: number;
  step: { from: number; to: number; t: number } | null;
  lean: number;
  last: 'a' | 'b' | null;
  botClock: number;
  /** A cair no buraco (ou já lá dentro). */
  fall: { t: number; vy: number; x0: number } | null;
}

class TugOfWarRun implements MinigameRun {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 300);
  private readonly duration: number;
  private running = false;
  private ended = false;
  private elapsed = 0;
  /** Posição da fita: positivo = a corda vai para a direita (a direita está a ganhar). */
  private pos = 0;
  private readonly pullers: Puller[] = [];
  private rope: THREE.Mesh;
  private readonly ropeTex: THREE.Texture;
  private readonly ribbon: THREE.Mesh;
  private shake = 0;
  private clock = 0;
  private readonly floaters: { s: THREE.Sprite; life: number }[] = [];
  private readonly camBase: THREE.Vector3;
  private readonly camLookBase: THREE.Vector3;

  constructor(private readonly ctx: MinigameContext) {
    setupSky(this.scene, { fog: [60, 170] });
    this.duration = ctx.seats.length > 2 ? 30 : 25;
    this.buildGround();
    themeScenery(this.scene, ctx.rng, ctx.theme, 10, { behind: true, count: 30 });

    // Equipas: duelo = 1.º à esquerda, 2.º à direita; equipas/1 contra 3 = azuis à esquerda, vermelhos à direita.
    const left: MinigameSeat[] = [];
    const right: MinigameSeat[] = [];
    if (ctx.seats.length <= 2 || ctx.mode === 'ffa') ctx.seats.slice(0, 2).forEach((s, i) => (i === 0 ? left : right).push(s));
    else for (const s of ctx.seats) (s.team === 'red' ? right : left).push(s);
    const strength = (mine: number, theirs: number) => (mine === 1 && theirs > 1 ? theirs * 0.93 : 1);
    for (const [list, side, other] of [[left, -1, right], [right, 1, left]] as const) {
      list.forEach((seat, slot) => {
        const def = getCharacter(seat.characterId);
        const model = new CharacterModel(def);
        model.setHighlight(def.color, 0.5, !(seat.team && ctx.mode !== 'ffa'));
        const str = strength(list.length, other.length);
        if (str > 1) model.root.scale.setScalar(1.35); // sozinho contra três: maior e mais forte
        model.root.rotation.order = 'YXZ'; // para inclinar para trás (rotation.x) depois de virar
        model.faceYaw(side === -1 ? Math.PI / 2 : -Math.PI / 2, true);
        model.setAnim('batIdle');
        const label = textSprite(seat.name, { height: 0.45, color: '#ffffff', stroke: '#1d1433' });
        label.position.y = 2.75;
        model.root.add(label);
        if (seat.team && ctx.mode !== 'ffa') {
          const ring = mesh(new THREE.TorusGeometry(0.75, 0.09, 8, 28), toon(seat.team === 'blue' ? '#2f7dff' : '#ff3b5c'), { cast: false });
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.05;
          model.root.add(ring);
        }
        const x = side * (GAP + slot * SLOT);
        model.root.position.set(x, 0, 0);
        this.scene.add(model.root);
        this.pullers.push({ seat, model, side, slot, str, x, step: null, lean: 0, last: null, botClock: 0.5 + ctx.rng.next() * 0.3, fall: null });
      });
    }

    // Corda de sisal (refeita a cada frame) e a fita vermelha ao meio.
    this.ropeTex = ropeTexture().clone();
    this.ropeTex.needsUpdate = true;
    this.rope = mesh(new THREE.BufferGeometry(), toonUnique('#ffffff', { map: this.ropeTex }), { cast: true });
    this.scene.add(this.rope);
    const rib = new THREE.PlaneGeometry(0.22, 0.6);
    rib.translate(0, -0.3, 0);
    this.ribbon = mesh(rib, toonUnique('#ff3b5c', { side: THREE.DoubleSide }), { cast: false });
    this.scene.add(this.ribbon);

    const wide = Math.max(left.length, right.length) > 1;
    this.camBase = wide ? new THREE.Vector3(0, 5.2, 15) : new THREE.Vector3(0, 4.4, 12.5);
    this.camLookBase = new THREE.Vector3(0, wide ? 1.1 : 1.3, 0);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camLookBase);
    this.layoutRope(0);
  }

  /** Chão com um buraco a sério ao meio: paredes de terra a escurecer, fundo escuro, orla de lama e torrões. */
  private buildGround(): void {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 60, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, HOLE_R, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const groundGeo = new THREE.ShapeGeometry(shape, 64);
    groundGeo.rotateX(-Math.PI / 2);
    this.scene.add(mesh(groundGeo, toon(themeGround(this.ctx.theme)), { cast: false, receive: true }));

    // Lama à volta (anel mais escuro) e orla levantada.
    const mudGeo = new THREE.RingGeometry(HOLE_R, HOLE_R + 1.1, 48);
    mudGeo.rotateX(-Math.PI / 2);
    const mud = mesh(mudGeo, toon('#6b4a2a'), { cast: false, receive: true });
    mud.position.y = 0.01;
    this.scene.add(mud);
    const lip = mesh(new THREE.TorusGeometry(HOLE_R + 0.04, 0.11, 6, 48), toon('#5a3b20'), { cast: false });
    lip.rotation.x = Math.PI / 2;
    lip.scale.z = 0.5;
    lip.position.y = 0.03;
    this.scene.add(lip);

    // Paredes do buraco: terra castanha em cima, a ficar preta lá em baixo.
    const DEPTH = 3.2;
    const wallGeo = new THREE.CylinderGeometry(HOLE_R, HOLE_R * 0.8, DEPTH, 40, 6, true);
    const colors: number[] = [];
    const p = wallGeo.attributes.position!;
    const top = new THREE.Color('#5a3b20');
    const bottom = new THREE.Color('#0d0805');
    for (let i = 0; i < p.count; i++) {
      const k = (p.getY(i) + DEPTH / 2) / DEPTH;
      const c = bottom.clone().lerp(top, k * k);
      colors.push(c.r, c.g, c.b);
    }
    wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const wall = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
    wall.position.y = -DEPTH / 2;
    this.scene.add(wall);
    const floorGeo = new THREE.CircleGeometry(HOLE_R * 0.8, 32);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ color: '#0a0604' }));
    floor.position.y = -DEPTH + 0.01;
    this.scene.add(floor);

    // Torrões de terra e pedrinhas à volta.
    for (let i = 0; i < 16; i++) {
      const a = this.ctx.rng.next() * Math.PI * 2;
      const r = HOLE_R + 0.25 + this.ctx.rng.next() * 1.1;
      const clod = mesh(new THREE.DodecahedronGeometry(0.08 + this.ctx.rng.next() * 0.1, 0), toon(i % 3 ? '#5a3b20' : '#7a6a5a'), { cast: false });
      clod.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r);
      clod.scale.y = 0.6;
      clod.rotation.set(this.ctx.rng.next() * 3, this.ctx.rng.next() * 3, 0);
      this.scene.add(clod);
    }
    // Linhas das equipas no chão.
    for (const side of [-1, 1]) {
      const line = mesh(new THREE.BoxGeometry(0.15, 0.03, 3), toonUnique(side < 0 ? '#2f7dff' : '#ff3b5c'), { cast: false });
      line.position.set(side * (HOLE_R + 1.4), 0.02, 0);
      this.scene.add(line);
    }
  }

  start(): void {
    this.running = true;
  }

  get finished(): boolean {
    return this.ended;
  }

  timeLeft(): number {
    return Math.max(0, this.duration - this.elapsed);
  }

  private standing(side: -1 | 1): Puller[] {
    return this.pullers.filter((p) => p.side === side && !p.fall).sort((a, b) => a.slot - b.slot);
  }

  scores(): MinigameScore[] {
    return this.pullers.map((p) => {
      if (p.fall) return { id: p.seat.id, value: '🕳️' };
      const lead = p.side * this.pos;
      return { id: p.seat.id, value: lead > 0.05 ? '💪 a ganhar' : lead < -0.05 ? '😣' : '—' };
    });
  }

  /** Lado que ganhou (ou null se empate). */
  private winningSide(): -1 | 1 | null {
    const l = this.standing(-1).length;
    const r = this.standing(1).length;
    if (l !== r) return l > r ? -1 : 1;
    if (Math.abs(this.pos) < 0.15) return null;
    return this.pos < 0 ? -1 : 1;
  }

  winners(): string[] {
    const side = this.winningSide();
    return side === null ? [] : this.pullers.filter((p) => p.side === side).map((p) => p.seat.id);
  }

  private endGame(): void {
    if (this.ended) return;
    this.ended = true;
    this.running = false;
    const side = this.winningSide();
    for (const p of this.pullers) {
      if (p.fall) continue;
      p.step = null;
      p.model.setAnim(side === null ? 'idle' : p.side === side ? 'cheer' : 'sad');
    }
  }

  private pull(p: Puller): void {
    sound.play('tick', { vol: 0.4, pitch: 0.6 + Math.random() * 0.3 });
    this.pos += p.side * PULL * p.str;
    p.lean = 0.35;
    this.shake = Math.min(1, this.shake + 0.35);
  }

  /** Onde cada um devia estar, dada a posição da corda. */
  private targetX(p: Puller): number {
    return this.pos + p.side * (GAP + p.slot * SLOT);
  }

  private stepGame(dt: number): void {
    const skill = this.ctx.botSkill;
    for (const p of this.pullers) {
      if (p.fall) continue;
      const pad = this.ctx.pad(p.seat.id);
      if (this.ctx.isBot(p.seat.id)) {
        p.botClock -= dt;
        if (p.botClock <= 0) {
          this.ctx.botPad(p.seat.id).press(p.last === 'a' ? 'b' : 'a');
          p.botClock = (1 / (4.5 + skill * 4.5)) * (0.7 + this.ctx.rng.next() * 0.6);
        }
      }
      for (const b of ['a', 'b'] as const) {
        if (!pad.consumePress(b)) continue;
        // Só conta se alternar entre A e B.
        if (p.last === b) continue;
        p.last = b;
        this.pull(p);
      }
    }
    // Quem vai à frente e chega ao buraco cai lá dentro (larga a corda).
    for (const side of [-1, 1] as const) {
      const front = this.standing(side)[0];
      if (!front) continue;
      if (side * this.targetX(front) < HOLE_R - 0.15) {
        front.fall = { t: 0, vy: 2.5, x0: front.x };
        front.step = null;
        front.model.setAnim('fall');
        sound.play('whoosh', { pitch: 0.7 });
        this.ctx.vibrate(front.seat.id, 400);
        this.float('Caiu no buraco!', front.x, '#ff6b7a');
        for (const o of this.standing(side)) this.ctx.vibrate(o.seat.id, 120);
        if (!this.standing(side).length) this.endGame();
      }
    }
  }

  private float(text: string, x: number, color: string): void {
    const s = textSprite(text, { height: 0.6, color, stroke: '#1d1433' });
    s.position.set(x, 3.2, 0.5);
    this.scene.add(s);
    this.floaters.push({ s, life: 1.4 });
  }

  /** Passos (sem deslizar), inclinação para trás e queda no buraco. */
  private animate(dt: number): void {
    for (const p of this.pullers) {
      const root = p.model.root;
      if (p.fall) {
        // Cai para dentro do buraco e desaparece lá em baixo.
        const f = p.fall;
        f.t += dt;
        f.vy -= 22 * dt;
        const k = Math.min(1, f.t / 0.35);
        p.x = f.x0 + (p.side * 0.2 - f.x0) * k;
        root.position.set(p.x, root.position.y + f.vy * dt, 0);
        root.rotation.x = 0;
        if (root.position.y < -1.2 && f.vy < 0 && !root.userData.thud) {
          root.userData.thud = true;
          sound.play('punch', { pitch: 0.55, vol: 0.8 });
        }
        if (root.position.y < -3) root.visible = false;
        continue;
      }
      if (!this.ended) {
        const want = this.targetX(p);
        if (!p.step && Math.abs(want - p.x) > STEP) {
          p.step = { from: p.x, to: want, t: 0 };
          // Para onde está virado: a esquerda olha para +x. Andar para lá é para a frente.
          const forward = Math.sign(want - p.x) === -p.side;
          p.model.setAnim(forward ? 'walk' : 'walkBack');
          sound.play('step', { vol: 0.25, pitch: 0.8 + Math.random() * 0.4 });
        }
        if (p.step) {
          p.step.t += dt / STEP_T;
          const k = Math.min(1, p.step.t);
          p.x = p.step.from + (p.step.to - p.step.from) * (k * k * (3 - 2 * k));
          if (k >= 1) {
            p.step = null;
            if (Math.abs(this.targetX(p) - p.x) <= STEP) p.model.setAnim('batIdle');
          }
        }
      }
      p.lean = Math.max(0, p.lean - dt);
      // Inclina-se para trás a puxar (mais quando puxa, menos quando está a ser arrastado).
      const dragged = p.step && Math.sign(p.step.to - p.step.from) === -p.side;
      const lean = this.ended ? 0 : (dragged ? 0.08 : 0.24) + p.lean * 0.5;
      root.rotation.x += (-lean - root.rotation.x) * damp(10, dt);
      root.position.set(p.x, 0, 0);
    }
  }

  /** A corda passa pelas mãos de todos, tem a fita ao meio e cai no chão atrás do último. */
  private layoutRope(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 3);
    const handPos = (p: Puller) => {
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      p.model.root.updateMatrixWorld(true);
      p.model.hand('left').getWorldPosition(a);
      p.model.hand('right').getWorldPosition(b);
      return a.add(b).multiplyScalar(0.5).setZ(0);
    };
    const sidePoints = (side: -1 | 1): THREE.Vector3[] => {
      const list = this.standing(side);
      if (!list.length) {
        // Ninguém a segurar deste lado: a ponta fica caída junto ao buraco.
        return [new THREE.Vector3(side * (HOLE_R + 0.35), 0.05, 0.25), new THREE.Vector3(side * (HOLE_R + 1.2), 0.05, 0.5)];
      }
      const pts = list.map(handPos);
      const last = pts[pts.length - 1]!;
      // Ponta solta atrás do último: desce até ao chão e fica lá estendida.
      pts.push(new THREE.Vector3(last.x + side * 0.7, last.y * 0.45, 0.05));
      pts.push(new THREE.Vector3(last.x + side * 1.4, 0.05, 0.15));
      pts.push(new THREE.Vector3(last.x + side * 2.4, 0.05, 0.3));
      return pts;
    };
    const left = sidePoints(-1);
    const right = sidePoints(1);
    const lf = left[0]!;
    const rf = right[0]!;
    const mid = lf.clone().add(rf).multiplyScalar(0.5);
    const slack = this.standing(-1).length && this.standing(1).length ? 0.06 : 0.6;
    mid.y = Math.max(0.05, mid.y - slack + Math.sin(this.clock * 38) * this.shake * 0.05);
    const pts = [...left.reverse(), mid, ...right];
    // Entre as mãos dos colegas, a corda está esticada mas dá uma barriguinha.
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const old = this.rope.geometry;
    this.rope.geometry = new THREE.TubeGeometry(curve, 90, ROPE_R, 6);
    old.dispose();
    this.ropeTex.repeat.set(curve.getLength() * 7, 1);
    this.ribbon.position.copy(mid);
    this.ribbon.rotation.set(0, 0, Math.sin(this.clock * 6) * 0.15 * (0.3 + this.shake));
  }

  update(dt: number, _time: number): void {
    this.clock += dt;
    if (this.running) {
      this.elapsed += dt;
      this.stepGame(dt);
      if (this.elapsed >= this.duration) this.endGame();
    } else if (!this.ended) {
      // Antes de começar, ignora carregadelas antecipadas.
      for (const p of this.pullers) {
        this.ctx.pad(p.seat.id).consumePress('a');
        this.ctx.pad(p.seat.id).consumePress('b');
      }
    }
    this.animate(dt);
    for (const p of this.pullers) p.model.update(dt);
    this.layoutRope(dt);
    // A câmara acompanha um bocadinho a corda.
    const cx = (this.ribbon.position.x || 0) * 0.35;
    this.camera.position.x += (this.camBase.x + cx - this.camera.position.x) * damp(3, dt);
    this.camera.lookAt(this.camLookBase.x + cx, this.camLookBase.y, this.camLookBase.z);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]!;
      f.life -= dt;
      f.s.position.y += dt;
      (f.s.material as THREE.SpriteMaterial).opacity = Math.min(1, f.life * 2);
      if (f.life <= 0) {
        this.scene.remove(f.s);
        disposeObject(f.s);
        this.floaters.splice(i, 1);
      }
    }
  }

  hideCharacters(): void {
    for (const p of this.pullers) p.model.root.visible = false;
  }

  dispose(): void {
    for (const p of this.pullers) p.model.dispose();
    this.ropeTex.dispose();
    disposeObject(this.scene);
  }
}

const CONTROLS = 'Ⓐ Ⓑ Ⓐ Ⓑ… à vez';
const BUTTONS: MinigameDef['buttons'] = [
  { id: 'a', label: 'Puxa A' },
  { id: 'b', label: 'Puxa B' },
];

/** Duelo (1 contra 1). */
export const TugOfWar: MinigameDef = {
  id: 'cabo',
  rounds: 3,
  name: 'Cabo de Guerra',
  modes: ['ffa'],
  duel: true,
  description: () => 'Carrega em A e B à vez, o mais depressa que conseguires, para puxar a corda! Quem for arrastado até ao buraco cai lá dentro. Repetir o mesmo botão não conta.',
  controls: CONTROLS,
  stick: false,
  buttons: BUTTONS,
  create: (ctx) => new TugOfWarRun(ctx),
};

/** Equipas (2 contra 2) e 1 contra 3. */
export const TugOfWarTeams: MinigameDef = {
  id: 'cabo-equipas',
  rounds: 2,
  name: 'Cabo de Guerra',
  modes: ['teams', 'oneVsAll'],
  description: (mode) =>
    mode === 'oneVsAll'
      ? 'Um contra três! Quem está sozinho é maior e mais forte. Carreguem em A e B à vez para puxar: quem vai à frente e chega ao buraco cai, e os de trás ficam a puxar sozinhos!'
      : 'Equipa contra equipa! Carreguem em A e B à vez para puxar: quem vai à frente e chega ao buraco cai, e o colega fica a puxar sozinho!',
  controls: CONTROLS,
  stick: false,
  buttons: BUTTONS,
  create: (ctx) => new TugOfWarRun(ctx),
};
