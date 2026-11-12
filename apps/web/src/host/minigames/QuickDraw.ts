/**
 * "Saque Rápido" (duelo de bananas): os dois estão frente a frente com uma pistola-banana.
 * O árbitro ao meio tem uma pistola de bandeira: quando dispara e sai a bandeira VERMELHA, Ⓐ dispara!
 * O primeiro a disparar acerta no outro (em câmara lenta, a seguir a banana), que perde uma vida (❤️)
 * e reage de uma de várias maneiras (cai de costas, voa, gira tonto, banana na cara).
 * Disparar antes da vermelha é falso arranque: a banana escorrega-te e perdes tu a vida. A partir da
 * 2.ª vez o árbitro às vezes engana com a bandeira AMARELA (não se dispara!). Cada um tem 3 vidas.
 * Cenário: estrado de madeira com bandeirinhas, barris e tochas, com o tema do mapa à volta.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import { CharacterModel } from '../three/CharacterModel';
import { NARRATOR } from '../three/characterAssets';
import { disposeObject, mesh, textSprite, toon, toonUnique } from '../three/materials';
import { PROPS, pickProp } from '../three/props';
import { damp } from '../three/tweens';
import { DuelMinigame, type Duelist } from './DuelMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { bunting, swayBunting } from './scenery';

const LIVES = 3;
/** Altura do estrado onde estão os duelistas. */
const FLOOR = 0.25;
const SPACING = 3.6;
/** Velocidade do tempo durante o voo da banana (câmara lenta). */
const SLOWMO = 0.18;

interface Shot {
  ball: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  target: Duelist;
  trailT: number;
}

type ReactKind = 'knockdown' | 'launch' | 'spin' | 'splat';

interface Reaction {
  d: Duelist;
  kind: ReactKind;
  t: number;
  stage: number;
  x0: number;
  splat?: THREE.Object3D;
}

/** Banana em arco (pistola ou projétil). */
function banana(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.TorusGeometry(0.32, 0.09, 8, 16, Math.PI * 0.9), toonUnique('#ffd93b', { emissive: '#ffcc00', emissiveIntensity: 0.15 }));
  body.rotation.z = Math.PI * 0.55;
  const tip = mesh(new THREE.SphereGeometry(0.06, 8, 6), toon('#5b3a1e'), { cast: false });
  tip.position.set(-0.28, -0.12, 0);
  g.add(body, tip);
  g.scale.setScalar(scale);
  return g;
}

/** Banana esborrachada (casca aberta e polpa) para colar na cara. Fica virada para +Z. */
function bananaSplat(): THREE.Group {
  const g = new THREE.Group();
  const pulp = mesh(new THREE.SphereGeometry(0.16, 12, 8), toon('#fff3b0'), { cast: false });
  pulp.scale.set(1, 0.85, 0.35);
  g.add(pulp);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const peel = mesh(new THREE.SphereGeometry(0.1, 10, 6), toon('#ffd93b'), { cast: false });
    peel.scale.set(0.7, 2.1, 0.3);
    peel.position.set(Math.sin(a) * 0.2, Math.cos(a) * 0.2, -0.02);
    peel.rotation.z = -a;
    g.add(peel);
  }
  return g;
}

class QuickDrawRun extends DuelMinigame {
  protected readonly duration = 90;
  private phase: 'ready' | 'fake' | 'go' | 'result' = 'ready';
  private t = 0;
  private goAt = 0;
  private fakeAt = -1;
  private turn = 0;
  private readonly lives = new Map<string, number>();
  private readonly hearts = new Map<string, THREE.Sprite>();
  private readonly botAt = new Map<string, number>();
  private readonly referee: CharacterModel;
  private sign: THREE.Sprite;
  private readonly shots: Shot[] = [];

  // Pistola de bandeira do árbitro.
  private readonly gun = new THREE.Group();
  private readonly flagPole: THREE.Mesh;
  private readonly flagCloth: THREE.Mesh;
  private readonly clothBase: Float32Array;
  private flagOut = 0;
  private flagTarget = 0;

  // Câmara lenta e câmara que segue a banana.
  private timeScale = 1;
  private camMode: 'base' | 'chase' | 'target' = 'base';
  private camHold = 0;
  private camDir = 1;
  private camTarget: Duelist | null = null;
  private readonly basePos = new THREE.Vector3(0, 4.2, 10.5);
  private readonly baseLook = new THREE.Vector3(0, 1.6, -0.5);
  private readonly camLook = new THREE.Vector3(0, 1.6, -0.5);

  private readonly reactions: Reaction[] = [];
  private lastReact: ReactKind | null = null;
  private readonly puffs: { m: THREE.Mesh; life: number; max: number; grow: number }[] = [];
  private readonly trailGeo = new THREE.SphereGeometry(0.07, 8, 6);
  private readonly pennants: THREE.Mesh[] = [];
  private clock = 0;

  constructor(ctx: MinigameContext) {
    super(ctx, { ground: '#e3c18b', spacing: SPACING, scenery: { radius: 8, count: 30 } });
    this.buildStage();

    // Árbitro ao meio, atrás, num estrado mais alto, com a pistola de bandeira na mão.
    this.referee = new CharacterModel(NARRATOR);
    this.referee.root.position.set(0, FLOOR + 0.4, -2.6);
    this.referee.faceYaw(0, true);
    this.scene.add(this.referee.root);
    const metal = toon('#3b3f4a');
    const body = mesh(new THREE.BoxGeometry(0.14, 0.3, 0.13), metal);
    body.position.y = 0.12;
    const barrel = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.4, 10), metal);
    barrel.position.y = 0.45;
    const muzzle = mesh(new THREE.TorusGeometry(0.05, 0.016, 6, 14), toon('#c9a227'));
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.y = 0.65;
    const grip = mesh(new THREE.BoxGeometry(0.11, 0.26, 0.1), toon('#8a5a2b'));
    grip.position.set(0, -0.04, -0.11);
    grip.rotation.x = 0.5;
    const flag = new THREE.Group();
    flag.position.y = 0.65;
    const poleGeo = new THREE.CylinderGeometry(0.02, 0.02, 1, 6);
    poleGeo.translate(0, 0.5, 0);
    this.flagPole = mesh(poleGeo, toon('#e8e2d0'));
    this.flagPole.scale.y = 0.001;
    const clothGeo = new THREE.PlaneGeometry(0.75, 0.48, 12, 4);
    clothGeo.translate(0.375, 0, 0);
    this.clothBase = Float32Array.from(clothGeo.attributes.position!.array as Float32Array);
    this.flagCloth = mesh(clothGeo, toonUnique('#ff2a2a', { emissive: '#ff2a2a', emissiveIntensity: 0.3, side: THREE.DoubleSide }));
    this.flagCloth.position.y = 0.72;
    this.flagCloth.scale.x = 0.001;
    this.flagCloth.visible = false;
    flag.add(this.flagPole, this.flagCloth);
    this.gun.add(body, barrel, muzzle, grip, flag);
    this.scene.add(this.gun);

    this.sign = textSprite('Atenção à bandeira…', { height: 0.8, color: '#ffffff', stroke: '#1d1433' });
    this.sign.position.set(0, 4.8, -2);
    this.scene.add(this.sign);
    for (const d of this.duelists) {
      d.model.root.position.y = FLOOR;
      this.lives.set(d.seat.id, LIVES);
      d.model.attach(banana(1.2), 'right');
      this.showHearts(d);
    }
    this.camera.position.copy(this.basePos);
    this.camera.lookAt(this.baseLook);
  }

  /** Estrado de madeira, bandeirinhas, barris, tochas e cerca atrás. */
  private buildStage(): void {
    const rng = this.ctx.rng;
    const deck = mesh(new THREE.BoxGeometry(13.6, FLOOR, 5.2), toon('#a8743f'), { cast: false, receive: true });
    deck.position.set(0, FLOOR / 2, -1);
    this.scene.add(deck);
    // Tábuas: frestas escuras ao comprido e a orla da frente.
    for (let i = 0; i < 9; i++) {
      const gap = mesh(new THREE.BoxGeometry(13.6, 0.01, 0.035), toon('#5e3b1d'), { cast: false });
      gap.position.set(0, FLOOR + 0.005, -3.6 + i * 0.58);
      this.scene.add(gap);
    }
    const trim = mesh(new THREE.BoxGeometry(13.9, FLOOR + 0.06, 0.18), toon('#6b4524'), { cast: false });
    trim.position.set(0, (FLOOR + 0.06) / 2, 1.65);
    this.scene.add(trim);
    const podium = mesh(new THREE.BoxGeometry(1.4, 0.4, 1.1), toon('#8a5a2b'), { receive: true });
    podium.position.set(0, FLOOR + 0.2, -2.6);
    this.scene.add(podium);

    // Bandeirinhas entre dois mastros, atrás do árbitro.
    const span = 6.8;
    for (const sx of [-1, 1]) {
      const mast = mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 8), toon('#6b4524'));
      mast.position.set(sx * span, FLOOR + 2, -3.7);
      this.scene.add(mast);
    }
    this.pennants.push(...bunting(this.scene, new THREE.Vector3(-span, FLOOR + 3.7, -3.7), new THREE.Vector3(span, FLOOR + 3.7, -3.7)));

    // Barris e caixotes nos cantos de trás, tochas à frente, cerca baixa atrás do estrado.
    const barrels = ['q-props/Barrel', 'q-props/Barrel_Apples', 'kenney-pirate/barrel', 'kaykit-medieval/barrel', 'q-props/Crate_Wooden', 'kenney-pirate/crate'];
    for (const [x, z, h] of [[-6, -2.6, 1.1], [-5.2, -3.3, 0.9], [6, -2.6, 1.1], [5.3, -3.3, 0.9], [-1.6, -3.4, 0.8], [1.7, -3.3, 0.8]] as const) {
      const o = pickProp(barrels, rng.next(), { height: h });
      if (!o) continue;
      o.position.set(x, FLOOR, z);
      o.rotation.y = rng.next() * Math.PI * 2;
      this.scene.add(o);
    }
    for (const x of [-6.5, 6.5]) {
      const torch = pickProp(['q-props/Torch_Metal', 'kaykit-halloween/post_lantern', 'kaykit-city/streetlight'], rng.next(), { height: 1.8 });
      if (!torch) continue;
      torch.position.set(x, FLOOR, 1.2);
      this.scene.add(torch);
      const light = new THREE.PointLight('#ffb15c', 3, 6);
      light.position.set(x, FLOOR + 1.9, 1.2);
      this.scene.add(light);
    }
    for (let x = -7; x <= 7; x += 2.2) {
      const f = pickProp(PROPS.fences, rng.next(), { width: 2.2 });
      if (!f) continue;
      f.position.set(x, 0, -4.6);
      this.scene.add(f);
    }
  }

  private showHearts(d: Duelist, hit = false): void {
    const old = this.hearts.get(d.seat.id);
    if (old) {
      d.model.root.remove(old);
      disposeObject(old);
    }
    const n = this.lives.get(d.seat.id) ?? 0;
    const s = textSprite('❤️'.repeat(n) + '🖤'.repeat(LIVES - n), { height: 0.6, color: '#ffffff', stroke: '#1d1433' });
    s.position.y = 3.3;
    d.model.root.add(s);
    this.hearts.set(d.seat.id, s);
    if (hit) {
      // Corações a tremer quando se perde um.
      const base = s.scale.clone();
      let k = 0;
      const id = setInterval(() => {
        k++;
        s.scale.copy(base).multiplyScalar(1 + Math.sin(k) * 0.12 * Math.max(0, 1 - k / 12));
        if (k > 12) {
          s.scale.copy(base);
          clearInterval(id);
        }
      }, 30);
    }
  }

  override start(): void {
    super.start();
    this.newTurn();
  }

  private setSign(text: string, color = '#ffffff'): void {
    this.scene.remove(this.sign);
    disposeObject(this.sign);
    const s = textSprite(text, { height: 0.8, color, stroke: '#1d1433' });
    s.position.copy(this.sign.position);
    this.sign = s;
    this.scene.add(s);
  }

  private newTurn(): void {
    this.turn++;
    this.phase = 'ready';
    this.t = 0;
    this.goAt = 2 + this.ctx.rng.next() * 3;
    // Bandeira amarela a enganar (a partir da 2.ª vez, às vezes).
    this.fakeAt = this.turn >= 2 && this.ctx.rng.next() < 0.45 ? 0.8 + this.ctx.rng.next() * (this.goAt - 1.3) : -1;
    this.flagTarget = 0;
    this.referee.setAnim('idle');
    this.setSign('Atenção à bandeira…');
    this.botAt.clear();
    for (const d of this.duelists) {
      d.model.setAnim('block');
      if (this.isBot(d) && this.ctx.rng.next() < (1 - this.ctx.botSkill) * 0.12) this.botAt.set(d.seat.id, this.ctx.rng.next() * this.goAt);
    }
  }

  private setFlagColor(color: string): void {
    const m = this.flagCloth.material as THREE.MeshToonMaterial;
    m.color.set(color);
    m.emissive.set(color);
  }

  /** O árbitro dispara a pistola: estalo, fumo e a bandeira sai disparada do cano. */
  private popFlag(color: string): void {
    this.setFlagColor(color);
    this.flagTarget = 1;
    sound.play('pop');
    const p = new THREE.Vector3();
    this.gun.localToWorld(p.set(0, 0.7, 0));
    this.puff(p, '#ffffff', 0.5, 0.1);
  }

  private puff(at: THREE.Vector3, color: string, life: number, size: number, grow = 2.5): void {
    const m = new THREE.Mesh(this.trailGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    m.position.copy(at);
    m.scale.setScalar(size / 0.07);
    this.scene.add(m);
    this.puffs.push({ m, life, max: life, grow });
  }

  scores(): MinigameScore[] {
    return this.duelists.map((d) => ({ id: d.seat.id, value: '❤️'.repeat(this.lives.get(d.seat.id) ?? 0) || '💀' }));
  }

  winners(): string[] {
    const [a, b] = this.duelists as [Duelist, Duelist];
    const la = this.lives.get(a.seat.id)!;
    const lb = this.lives.get(b.seat.id)!;
    return la === lb ? [] : [la > lb ? a.seat.id : b.seat.id];
  }

  /** O atirador dispara: a banana voa em câmara lenta, com a câmara atrás dela, e acerta no outro. */
  private fire(shooter: Duelist, ms: number): void {
    this.phase = 'result';
    this.t = 0;
    const target = this.other(shooter);
    shooter.model.setAnim('punchRight');
    sound.play('whoosh', { pitch: 0.55, vol: 1.2 });
    const from = shooter.model.root.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const to = target.model.root.position.clone().add(new THREE.Vector3(0, 1.45, 0));
    const ball = banana(0.9);
    ball.position.copy(from);
    this.scene.add(ball);
    this.shots.push({ ball, from, to, t: 0, target, trailT: 0 });
    this.setSign(`${shooter.seat.name}: ${ms} ms!`, '#ffd23f');
    this.ctx.vibrate(shooter.seat.id, 60);
    this.timeScale = SLOWMO;
    this.camMode = 'chase';
    this.camDir = -shooter.side;
    this.camTarget = target;
  }

  /** Falso arranque: a banana escorrega e quem disparou cai de costas e perde a vida. */
  private falseStart(d: Duelist): void {
    this.phase = 'result';
    this.t = 0;
    this.setSign(`${d.seat.name}: falso arranque!`, '#ff6b7a');
    sound.play('aww');
    this.hurt(d, 'knockdown');
  }

  private hurt(d: Duelist, kind?: ReactKind): void {
    const n = Math.max(0, (this.lives.get(d.seat.id) ?? 0) - 1);
    this.lives.set(d.seat.id, n);
    this.showHearts(d, true);
    d.model.flash('#ff2a2a', 0.35);
    this.float('−1 ❤️', d.side * SPACING, 3.9, '#ff5a5f', 0.8);
    sound.play('hit');
    this.ctx.vibrate(d.seat.id, 300);
    if (!kind) {
      // Reação ao acaso, sem repetir a anterior.
      const kinds = (['knockdown', 'launch', 'spin', 'splat'] as const).filter((k) => k !== this.lastReact);
      kind = kinds[Math.floor(this.ctx.rng.next() * kinds.length)]!;
    }
    this.lastReact = kind;
    this.reactions.push({ d, kind, t: 0, stage: 0, x0: d.side * SPACING });
  }

  /** Reações a levar com a banana (correm no tempo do jogo). */
  private updateReactions(dt: number): void {
    for (let i = this.reactions.length - 1; i >= 0; i--) {
      const r = this.reactions[i]!;
      r.t += dt;
      const { model } = r.d;
      const root = model.root;
      const side = r.d.side;
      const yaw0 = side === -1 ? Math.PI / 2 : -Math.PI / 2;
      let done = false;
      /** Volta a andar para o sítio (no fim das reações que o deixam longe). */
      const walkBack = (from: number, t0: number, len: number) => {
        const k = Math.min(1, (r.t - t0) / len);
        root.position.x = r.x0 + (from - r.x0) * (1 - k);
        if (k >= 1) done = true;
      };
      switch (r.kind) {
        case 'knockdown': {
          // Cai de costas, escorrega um bocado, levanta-se e volta ao sítio.
          if (r.stage === 0) {
            model.setAnim('fall');
            r.stage = 1;
          }
          const k = Math.min(1, r.t / 0.5);
          if (r.t < 2.1) root.position.x = r.x0 + side * 0.9 * (1 - (1 - k) ** 2);
          if (r.stage === 1 && r.t >= 1.2) {
            model.setAnim('getUp');
            r.stage = 2;
          }
          if (r.stage === 2 && r.t >= 2.1) {
            model.setAnim('walk');
            r.stage = 3;
          }
          if (r.stage === 3) walkBack(r.x0 + side * 0.9, 2.1, 0.55);
          break;
        }
        case 'launch': {
          // Sai a voar para trás em arco, aterra, levanta-se e volta.
          if (r.stage === 0) {
            model.setAnim('fall');
            r.stage = 1;
          }
          const k = Math.min(1, r.t / 0.7);
          if (r.stage === 1) {
            root.position.x = r.x0 + side * 1.9 * k;
            root.position.y = FLOOR + Math.sin(k * Math.PI) * 1.3;
            if (k >= 1) {
              root.position.y = FLOOR;
              sound.play('punch', { pitch: 0.7, vol: 0.7 });
              this.puff(new THREE.Vector3(root.position.x, FLOOR + 0.2, 0), '#d9c7a6', 0.5, 0.25, 4);
              r.stage = 2;
            }
          }
          if (r.stage === 2 && r.t >= 1.4) {
            model.setAnim('getUp');
            r.stage = 3;
          }
          if (r.stage === 3 && r.t >= 2.35) {
            model.setAnim('walk');
            r.stage = 4;
          }
          if (r.stage === 4) walkBack(r.x0 + side * 1.9, 2.35, 0.7);
          break;
        }
        case 'spin': {
          // Gira duas vezes com o impacto e fica tonto.
          if (r.stage === 0) {
            model.setAnim('dizzy');
            r.stage = 1;
          }
          const k = Math.min(1, r.t / 0.9);
          const e = 1 - (1 - k) ** 3;
          model.faceYaw(yaw0 + e * Math.PI * 4, true);
          root.position.x = r.x0 + side * 0.5 * Math.sin(k * Math.PI);
          if (r.t >= 1.8) done = true;
          break;
        }
        case 'splat': {
          // A banana esborracha-se na cara: a cabeça vai para trás e fica com a banana colada.
          if (r.stage === 0) {
            model.setAnim('hurt');
            model.kickHead(0.9);
            sound.play('splash', { vol: 0.35, pitch: 1.6 });
            r.splat = this.stickOnFace(r.d, yaw0);
            r.stage = 1;
          }
          root.position.x = r.x0 + side * 0.35 * Math.sin(Math.min(1, r.t / 0.35) * Math.PI);
          if (r.stage === 1 && r.t >= 0.6) {
            model.setAnim('dizzy');
            r.stage = 2;
          }
          if (r.t >= 1.9) done = true;
          break;
        }
      }
      if (done) {
        root.position.set(r.x0, FLOOR, 0);
        model.faceYaw(yaw0, true);
        model.setAnim('idle');
        if (r.splat) {
          r.splat.removeFromParent();
          disposeObject(r.splat);
        }
        this.reactions.splice(i, 1);
      }
    }
  }

  /** Cola a banana esborrachada à frente da cara (presa à cabeça, segue as animações). */
  private stickOnFace(d: Duelist, yaw: number): THREE.Object3D {
    const splat = bananaSplat();
    d.model.attachHead(splat);
    const head = splat.parent!;
    d.model.root.updateMatrixWorld(true);
    const hw = new THREE.Vector3();
    head.getWorldPosition(hw);
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const target = hw.clone().addScaledVector(fwd, 0.3).add(new THREE.Vector3(0, 0.12, 0));
    splat.position.copy(head.worldToLocal(target));
    const hq = new THREE.Quaternion();
    head.getWorldQuaternion(hq);
    splat.quaternion.copy(hq.invert().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0))));
    return splat;
  }

  protected step(dt: number): void {
    this.t += dt;
    const skill = this.ctx.botSkill;
    for (const s of [...this.shots]) {
      s.t += dt / 0.28;
      const k = Math.min(1, s.t);
      s.ball.position.lerpVectors(s.from, s.to, k);
      s.ball.position.y += Math.sin(k * Math.PI) * 0.5;
      s.ball.rotation.z += dt * 25;
      // Rasto amarelo atrás da banana.
      s.trailT -= dt;
      if (s.trailT <= 0) {
        s.trailT = 0.012;
        this.puff(s.ball.position, '#ffe066', 0.12, 0.07, 0);
      }
      if (k >= 1) {
        this.scene.remove(s.ball);
        disposeObject(s.ball);
        this.shots.splice(this.shots.indexOf(s), 1);
        this.puff(s.to, '#fff3b0', 0.35, 0.2, 5);
        this.hurt(s.target);
        // Fim da câmara lenta: a câmara fica um bocado no atingido.
        this.camMode = 'target';
        this.camHold = 1.6;
      }
    }
    this.updateReactions(dt);
    for (const d of this.duelists) {
      const at = this.botAt.get(d.seat.id);
      if (at !== undefined && this.phase !== 'result' && this.t >= at) {
        this.botPress(d, 'a');
        this.botAt.delete(d.seat.id);
      }
    }
    if (this.phase === 'ready' || this.phase === 'fake') {
      // Bandeira amarela: sai da pistola e volta a entrar (não se dispara!).
      if (this.fakeAt > 0 && this.t >= this.fakeAt && this.phase === 'ready') {
        this.phase = 'fake';
        this.referee.setAnim('uppercut');
        this.popFlag('#ffd23f');
        this.setSign('Amarela! Não dispares!', '#ffd23f');
      }
      if (this.phase === 'fake' && this.t >= this.fakeAt + 0.8) {
        this.phase = 'ready';
        this.flagTarget = 0;
        this.fakeAt = -1;
        this.setSign('Atenção à bandeira…');
      }
      for (const d of this.duelists) {
        if (this.pressed(d, 'a') || this.pressed(d, 'b')) {
          this.falseStart(d);
          return;
        }
      }
      if (this.t >= this.goAt && this.phase === 'ready' && this.flagOut < 0.1) {
        this.phase = 'go';
        this.t = 0;
        this.referee.setAnim('cheer');
        this.popFlag('#ff2a2a');
        this.setSign('🚩 VERMELHA! Dispara!', '#ff3b5c');
        sound.play('go');
        for (const d of this.duelists) {
          this.ctx.vibrate(d.seat.id, 40);
          if (this.isBot(d)) this.botAt.set(d.seat.id, 0.2 + (1 - skill) * 0.4 + this.ctx.rng.next() * 0.15);
        }
      }
    } else if (this.phase === 'go') {
      for (const d of this.duelists) {
        if (this.pressed(d, 'a') || this.pressed(d, 'b')) {
          this.fire(d, Math.round(this.t * 1000));
          return;
        }
      }
    } else if (this.t > 1.8 && !this.shots.length && !this.reactions.length && this.camMode !== 'target') {
      this.flagTarget = 0;
      if ([...this.lives.values()].some((l) => l <= 0)) this.endGame();
      else this.newTurn();
    }
  }

  override update(dt: number, time: number): void {
    // O tempo do jogo (personagens, banana, reações) anda mais devagar durante a câmara lenta.
    if (!this.shots.length && this.timeScale < 1) this.timeScale = Math.min(1, this.timeScale + dt * 3);
    super.update(dt * this.timeScale, time);
    this.clock += dt;
    this.updateGun(dt);
    this.updateCamera(dt);
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      p.life -= dt * (this.shots.length ? this.timeScale * 5 : 1);
      p.m.scale.multiplyScalar(1 + p.grow * dt);
      (p.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (p.life / p.max) * 0.8);
      if (p.life <= 0) {
        this.scene.remove(p.m);
        (p.m.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
      }
    }
    swayBunting(this.pennants, this.clock);
  }

  /** A pistola está na mão do árbitro (sempre de cano para cima) e a bandeira sai/entra e abana. */
  private updateGun(dt: number): void {
    this.referee.update(dt);
    this.referee.hand('right').getWorldPosition(this.gun.position);
    this.gun.rotation.set(-0.15, 0, -0.1);
    const target = this.flagTarget;
    this.flagOut += (target - this.flagOut) * Math.min(1, dt * (target > this.flagOut ? 16 : 10));
    this.flagPole.scale.y = Math.max(0.001, this.flagOut);
    const cloth = Math.max(0, Math.min(1, (this.flagOut - 0.55) / 0.45));
    this.flagCloth.visible = cloth > 0.01;
    this.flagCloth.scale.set(Math.max(0.001, cloth), Math.max(0.001, cloth), 1);
    this.flagCloth.position.y = 0.72 * this.flagOut;
    if (this.flagCloth.visible) {
      const pos = this.flagCloth.geometry.attributes.position!;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = this.clothBase[i]!;
        arr[i + 2] = Math.sin(x * 9 - this.clock * 11) * 0.06 * (x / 0.75);
      }
      pos.needsUpdate = true;
    }
  }

  private updateCamera(dt: number): void {
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    const shot = this.shots[0];
    let rate = 4;
    if (this.camMode === 'chase' && shot) {
      // Ao lado e um pouco atrás da banana.
      pos.copy(shot.ball.position).add(new THREE.Vector3(-this.camDir * 2.3, 0.5, 2.2));
      look.copy(shot.ball.position).add(new THREE.Vector3(this.camDir * 1.4, -0.1, 0));
      rate = 7;
    } else if (this.camMode === 'target' && this.camTarget) {
      const p = this.camTarget.model.root.position;
      pos.set(p.x - this.camDir * 3, 1.9, 3.6);
      look.set(p.x, 1.1, 0);
      rate = 3;
      this.camHold -= dt;
      if (this.camHold <= 0) this.camMode = 'base';
    } else {
      pos.copy(this.basePos);
      look.copy(this.baseLook);
      rate = this.camMode === 'chase' ? 7 : 3;
    }
    const k = damp(rate, dt);
    this.camera.position.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.lookAt(this.camLook);
  }

  override dispose(): void {
    this.referee.dispose();
    this.trailGeo.dispose();
    super.dispose();
  }
}

export const QuickDraw: MinigameDef = {
  id: 'saque',
  rounds: 1,
  name: 'Saque Rápido',
  modes: ['ffa'],
  duel: true,
  noCountdown: true,
  description: () =>
    'Duelo de bananas! Quando a pistola do árbitro disparar a bandeira VERMELHA, dispara com Ⓐ. Quem disparar primeiro tira uma vida ao outro. Se disparares antes (ou na bandeira AMARELA), perdes tu a vida! 3 vidas cada.',
  controls: 'Ⓐ Disparar (só na bandeira vermelha!)',
  stick: false,
  buttons: [{ id: 'a', label: 'Disparar' }],
  create: (ctx) => new QuickDrawRun(ctx),
};
