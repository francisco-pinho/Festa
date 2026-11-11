/**
 * Personagem 3D com esqueleto e animações (modelos KayKit, CC0).
 *
 * Mantém a interface antiga (root, setAnim, faceTowards, faceYaw, setFaded,
 * update, dispose) para o resto do jogo não mudar, e acrescenta:
 *  - mais animações (saltar, socos, defender, esquivar, lançar, cair, levantar…);
 *  - `hand('left'|'right')` / `attach()` para segurar objetos nas mãos.
 *
 * O `root` está aos pés da personagem e ela olha para +Z.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { CharacterDef } from '@festa/game';
import { damp } from './tweens';
import { toonUnique } from './materials';
import { LOOKS, getAsset, getCharacterTexture } from './characterAssets';
import { buildAccessory } from './accessories';

export type CharacterAnim =
  | 'idle'
  | 'walk'
  | 'run'
  | 'cheer'
  | 'sad'
  | 'dizzy'
  | 'hit'
  | 'jump'
  | 'punchLeft'
  | 'punchRight'
  | 'block'
  | 'hurt'
  | 'dodgeLeft'
  | 'dodgeRight'
  | 'dodgeBack'
  | 'throw'
  | 'fall'
  | 'lie'
  | 'getUp'
  | 'sit'
  | 'fightIdle'
  | 'hook'
  | 'uppercut'
  | 'blockHit'
  | 'strafeLeft'
  | 'strafeRight'
  | 'walkBack'
  | 'batIdle'
  | 'batSwing'
  | 'crouch'
  | 'catch'
  | 'backhand'
  | 'serve';

interface AnimSpec {
  clip: string;
  loop: boolean;
  /** Velocidade de reprodução. */
  speed?: number;
  /** Ao acabar (animações de uma vez), volta a 'idle'. */
  thenIdle?: boolean;
}

const ANIMS: Record<CharacterAnim, AnimSpec> = {
  idle: { clip: 'Idle', loop: true },
  walk: { clip: 'Walking_A', loop: true },
  run: { clip: 'Running_A', loop: true },
  cheer: { clip: 'Cheer', loop: true },
  sad: { clip: 'Idle', loop: true, speed: 0.5 },
  dizzy: { clip: 'Hit_B', loop: true, speed: 0.6 },
  hit: { clip: 'Unarmed_Melee_Attack_Punch_A', loop: false, speed: 1.4 },
  jump: { clip: 'Jump_Full_Short', loop: false, thenIdle: true },
  punchLeft: { clip: 'Unarmed_Melee_Attack_Punch_A', loop: false, speed: 1.6, thenIdle: true },
  punchRight: { clip: 'Unarmed_Melee_Attack_Punch_B', loop: false, speed: 1.6, thenIdle: true },
  block: { clip: 'Blocking', loop: true },
  hurt: { clip: 'Hit_A', loop: false, speed: 1.3, thenIdle: true },
  dodgeLeft: { clip: 'Dodge_Left', loop: false, speed: 1.4, thenIdle: true },
  dodgeRight: { clip: 'Dodge_Right', loop: false, speed: 1.4, thenIdle: true },
  dodgeBack: { clip: 'Dodge_Backward', loop: false, speed: 1.4, thenIdle: true },
  throw: { clip: 'Throw', loop: false, speed: 1.2, thenIdle: true },
  fall: { clip: 'Death_A', loop: false },
  lie: { clip: 'Lie_Idle', loop: true },
  getUp: { clip: 'Lie_StandUp', loop: false, speed: 1.3, thenIdle: true },
  sit: { clip: 'Sit_Floor_Idle', loop: true },
  fightIdle: { clip: 'Unarmed_Idle', loop: true },
  hook: { clip: '1H_Melee_Attack_Slice_Horizontal', loop: false, speed: 1.9, thenIdle: true },
  uppercut: { clip: 'Spellcast_Raise', loop: false, speed: 2.2, thenIdle: true },
  blockHit: { clip: 'Block_Hit', loop: false, speed: 1.4, thenIdle: true },
  strafeLeft: { clip: 'Running_Strafe_Left', loop: true, speed: 0.7 },
  strafeRight: { clip: 'Running_Strafe_Right', loop: true, speed: 0.7 },
  walkBack: { clip: 'Walking_Backwards', loop: true },
  batIdle: { clip: '2H_Melee_Idle', loop: true },
  batSwing: { clip: '2H_Melee_Attack_Slice', loop: false, speed: 2.2, thenIdle: true },
  crouch: { clip: 'Sit_Chair_Idle', loop: true },
  catch: { clip: 'Block', loop: false, speed: 1.6, thenIdle: true },
  backhand: { clip: '1H_Melee_Attack_Slice_Diagonal', loop: false, speed: 1.9, thenIdle: true },
  serve: { clip: '1H_Melee_Attack_Chop', loop: false, speed: 1.6, thenIdle: true },
};

/** Altura final das personagens no mundo (topo da cabeça). */
const TARGET_HEIGHT = 2.3;

export class CharacterModel {
  readonly root = new THREE.Group();
  readonly def: CharacterDef;
  anim: CharacterAnim = 'idle';
  /** Animação para onde se volta depois das animações de uma vez (ex.: guarda no boxe). */
  restAnim: CharacterAnim = 'idle';

  private readonly body = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private readonly materials: THREE.MeshToonMaterial[] = [];
  private readonly extraGeometries: THREE.BufferGeometry[] = [];
  private readonly bones: { head?: THREE.Object3D; chest?: THREE.Object3D; left?: THREE.Object3D; right?: THREE.Object3D } = {};
  private propeller: THREE.Object3D | null = null;
  private targetYaw = 0;
  private t = Math.random() * 10;
  private flashTime = 0;
  /** Recuo da cabeça ao levar um soco (rad), decai sozinho. */
  private headKick = new THREE.Vector2();

  constructor(def: CharacterDef) {
    this.def = def;
    const look = LOOKS[def.id] ?? { base: 'Rogue' as const, hat: false, accessory: false };
    const asset = getAsset(look.base);
    this.model = cloneSkinned(asset.scene);

    const texture = getCharacterTexture(def.id);
    const material = toonUnique('#ffffff', { map: texture });
    this.materials.push(material);
    this.model.traverse((o) => {
      const parentName = o.parent?.name ?? '';
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        // Sem armas/escudos/livros nas mãos.
        if (parentName.startsWith('handslot')) m.visible = false;
        if (/_(Hat|Helmet)$/.test(m.name)) m.visible = look.hat;
        m.material = material;
        m.castShadow = true;
        m.frustumCulled = false; // malhas com esqueleto: a caixa não acompanha a animação
      }
    });
    this.bones.head = this.model.getObjectByName('head');
    this.bones.chest = this.model.getObjectByName('chest');
    // O GLTFLoader tira os pontos dos nomes: 'handslot.l' passa a 'handslotl'.
    this.bones.left = this.model.getObjectByName('handslotl') ?? this.model.getObjectByName('handslot.l');
    this.bones.right = this.model.getObjectByName('handslotr') ?? this.model.getObjectByName('handslot.r');

    // Escala normalizada + forma do corpo
    const s = TARGET_HEIGHT / asset.height;
    const shape = def.body === 'chubby' ? new THREE.Vector3(1.12, 0.97, 1.1) : def.body === 'tall' ? new THREE.Vector3(0.96, 1.06, 0.96) : new THREE.Vector3(1, 1, 1);
    this.body.scale.set(s * shape.x, s * shape.y, s * shape.z);
    this.body.add(this.model);
    this.root.add(this.body);

    if (look.accessory) this.addAccessory();

    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [name, clip] of asset.clips) this.actions.set(name, this.mixer.clipAction(clip));
    this.mixer.addEventListener('finished', () => {
      if (ANIMS[this.anim].thenIdle) this.setAnim(this.restAnim);
    });
    this.play('idle', 0);
    this.mixer.update(Math.random() * 2); // cada um começa num ponto diferente
  }

  /** Muda de animação com uma transição suave. */
  setAnim(anim: CharacterAnim): void {
    if (anim === this.anim && ANIMS[anim].loop) return;
    this.anim = anim;
    this.play(anim, 0.18);
  }

  private play(anim: CharacterAnim, fade: number): void {
    const spec = ANIMS[anim];
    const action = this.actions.get(spec.clip);
    if (!action) return;
    action.reset();
    action.setLoop(spec.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !spec.loop;
    action.timeScale = spec.speed ?? 1;
    action.enabled = true;
    if (this.current && this.current !== action) {
      action.crossFadeFrom(this.current, fade, false);
    }
    action.play();
    this.current = action;
  }

  /** Osso onde se prendem objetos (raquete, taco, bola, luva…). */
  hand(side: 'left' | 'right'): THREE.Object3D {
    return (side === 'left' ? this.bones.left : this.bones.right) ?? this.root;
  }

  /** Prende um objeto à cabeça (boné, capacete…), com a escala compensada. */
  attachHead(obj: THREE.Object3D): void {
    const head = this.bones.head ?? this.root;
    this.root.updateMatrixWorld(true);
    const ws = new THREE.Vector3();
    head.getWorldScale(ws);
    const rootScale = new THREE.Vector3();
    this.root.getWorldScale(rootScale);
    obj.scale.multiplyScalar(rootScale.x / (ws.x || 1));
    head.add(obj);
  }

  /** Prende um objeto a uma mão. A escala do esqueleto é compensada. */
  attach(obj: THREE.Object3D, side: 'left' | 'right'): void {
    const hand = this.hand(side);
    this.root.updateMatrixWorld(true);
    const ws = new THREE.Vector3();
    hand.getWorldScale(ws);
    const rootScale = new THREE.Vector3();
    this.root.getWorldScale(rootScale);
    obj.scale.multiplyScalar(rootScale.x / (ws.x || 1));
    hand.add(obj);
  }

  /** Vira-se suavemente para um ponto no plano XZ (coordenadas do mundo). */
  faceTowards(x: number, z: number): void {
    const p = new THREE.Vector3();
    this.root.getWorldPosition(p);
    if (Math.hypot(x - p.x, z - p.z) < 1e-3) return;
    this.targetYaw = Math.atan2(x - p.x, z - p.z);
  }

  faceYaw(yaw: number, instant = false): void {
    this.targetYaw = yaw;
    if (instant) this.root.rotation.y = yaw;
  }

  /** Flash de cor (ex.: vermelho ao levar um soco). */
  flash(color: THREE.ColorRepresentation = '#ff2a2a', seconds = 0.25): void {
    this.flashTime = seconds;
    for (const m of this.materials) m.emissive.set(color);
  }

  /** A cabeça recua (x = para trás, y = para o lado), como num soco. */
  kickHead(back: number, side = 0): void {
    this.headKick.set(back, side);
  }

  /** Posição da cabeça no mundo. */
  headPosition(target = new THREE.Vector3()): THREE.Vector3 {
    const head = this.bones.head ?? this.root;
    head.getWorldPosition(target);
    if (!this.bones.head) target.y += 1.8;
    return target;
  }

  /** Personagem "apagada" (eliminada / apanhada). */
  setFaded(faded: boolean): void {
    for (const m of this.materials) {
      m.transparent = faded;
      m.opacity = faded ? 0.35 : 1;
      m.needsUpdate = true;
    }
  }

  update(dt: number): void {
    this.t += dt;
    let dy = this.targetYaw - this.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.root.rotation.y += dy * damp(10, dt);

    this.mixer.update(dt);

    // Poses extra por cima da animação
    if (this.anim === 'sad') {
      this.bones.head?.rotateX(0.45);
      this.bones.chest?.rotateX(0.18);
    } else if (this.anim === 'dizzy') {
      this.bones.head?.rotateZ(Math.sin(this.t * 6) * 0.3);
      this.bones.chest?.rotateZ(Math.sin(this.t * 6 + 1) * 0.12);
    }
    if (this.headKick.lengthSq() > 1e-4) {
      this.bones.head?.rotateX(-this.headKick.x);
      this.bones.head?.rotateZ(this.headKick.y);
      this.bones.chest?.rotateX(-this.headKick.x * 0.35);
      this.headKick.multiplyScalar(1 - damp(7, dt));
    }
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      const k = Math.max(0, this.flashTime / 0.25);
      for (const m of this.materials) m.emissiveIntensity = k * 0.9;
      if (this.flashTime <= 0) for (const m of this.materials) m.emissive.set('#000000');
    }
    if (this.propeller) this.propeller.rotation.y += dt * (this.anim === 'cheer' ? 30 : 8);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const m of this.materials) m.dispose();
    for (const g of this.extraGeometries) g.dispose();
    // As geometrias do modelo são partilhadas entre clones: não se apagam aqui.
  }

  // ── Acessório na cabeça ─────────────────────────────────

  private addAccessory(): void {
    const head = this.bones.head;
    if (!head) return;
    let headMesh: THREE.Object3D | undefined;
    this.model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && /_Head(_Hooded)?$/.test(o.name)) headMesh = o;
    });
    if (!headMesh) return;
    this.root.updateMatrixWorld(true);
    // Caixa da cabeça na pose de repouso, no espaço do `root`.
    const box = new THREE.Box3().setFromObject(headMesh);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    box.applyMatrix4(inv);
    const radius = (box.max.x - box.min.x) / 2;
    const center = box.getCenter(new THREE.Vector3());
    // Os acessórios foram desenhados para cabeça de raio 0,52 com origem 0,38 abaixo do centro.
    const k = radius / 0.52;
    const originInRoot = center.clone().add(new THREE.Vector3(0, -0.38 * k, 0));

    const mat = (c: THREE.ColorRepresentation) => {
      const m = toonUnique(c);
      this.materials.push(m);
      return m;
    };
    const acc = buildAccessory(this.def, mat, (p) => (this.propeller = p));
    acc.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.extraGeometries.push((o as THREE.Mesh).geometry);
    });

    // Converte posição/rotação/escala do espaço do root para o espaço do osso da cabeça.
    const worldPos = originInRoot.applyMatrix4(this.root.matrixWorld);
    const headWorldQuat = head.getWorldQuaternion(new THREE.Quaternion());
    const headWorldScale = head.getWorldScale(new THREE.Vector3());
    const rootWorldScale = this.root.getWorldScale(new THREE.Vector3());
    head.worldToLocal(worldPos);
    acc.position.copy(worldPos);
    acc.quaternion.copy(headWorldQuat).invert().multiply(this.root.getWorldQuaternion(new THREE.Quaternion()));
    acc.scale.setScalar((k * rootWorldScale.x) / (headWorldScale.x || 1));
    head.add(acc);
  }
}
