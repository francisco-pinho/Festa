/**
 * Personagem 3D construída em código (formas simples, estilo "chibi") com
 * animações procedimentais: idle, walk, run, cheer, sad, dizzy, hit.
 *
 * O `root` está aos pés da personagem e ela olha para +Z.
 * Movimentos no mundo (saltar de casa em casa, cair…) são feitos por quem a usa
 * mexendo em `root.position`; aqui só se anima o corpo.
 */
import * as THREE from 'three';
import type { CharacterDef } from '@festa/game';
import { damp } from './tweens';
import { mesh, toonUnique } from './materials';

export type CharacterAnim = 'idle' | 'walk' | 'run' | 'cheer' | 'sad' | 'dizzy' | 'hit';

const SKIN_DARK = '#2b1d3a';

export class CharacterModel {
  readonly root = new THREE.Group();
  readonly def: CharacterDef;
  anim: CharacterAnim = 'idle';

  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly eyes = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private propeller: THREE.Object3D | null = null;
  private readonly materials: THREE.MeshToonMaterial[] = [];

  private t = Math.random() * 10;
  private animTime = 0;
  private nextBlink = 1 + Math.random() * 3;
  private targetYaw = 0;

  constructor(def: CharacterDef) {
    this.def = def;
    this.build();
    this.root.add(this.body);
  }

  setAnim(anim: CharacterAnim): void {
    if (anim === this.anim) return;
    this.anim = anim;
    this.animTime = 0;
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
    this.animTime += dt;
    const k = damp(14, dt);
    const t = this.t;

    // Rotação (caminho mais curto)
    let dy = this.targetYaw - this.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.root.rotation.y += dy * damp(10, dt);

    // Pose alvo
    let legL = 0, legR = 0;
    let armLz = 0.25, armRz = -0.25, armLx = 0, armRx = 0;
    let headX = 0, headZ = 0, headY = 0;
    let bodyY = 0, bodyRotZ = 0, squash = 1, bodyRotY = 0;

    switch (this.anim) {
      case 'idle': {
        bodyY = Math.sin(t * 2.4) * 0.025;
        squash = 1 + Math.sin(t * 2.4) * 0.02;
        armLz = 0.3 + Math.sin(t * 2.4) * 0.05;
        armRz = -0.3 - Math.sin(t * 2.4) * 0.05;
        headZ = Math.sin(t * 0.9) * 0.06;
        break;
      }
      case 'walk':
      case 'run': {
        const fast = this.anim === 'run';
        const f = fast ? 16 : 11;
        const amp = fast ? 0.9 : 0.6;
        legL = Math.sin(t * f) * amp;
        legR = -legL;
        armLx = -legL * 0.9;
        armRx = legL * 0.9;
        armLz = 0.35;
        armRz = -0.35;
        bodyY = Math.abs(Math.sin(t * f)) * (fast ? 0.12 : 0.07);
        bodyRotZ = Math.sin(t * f) * 0.05;
        headX = fast ? 0.12 : 0.04;
        break;
      }
      case 'cheer': {
        const hop = Math.abs(Math.sin(t * 7));
        bodyY = hop * 0.35;
        squash = 1 + (hop < 0.15 ? -0.08 : 0.04);
        armLz = 2.5 + Math.sin(t * 14) * 0.25;
        armRz = -2.5 - Math.sin(t * 14) * 0.25;
        headX = -0.15;
        legL = legR = hop > 0.5 ? -0.3 : 0;
        break;
      }
      case 'sad': {
        squash = 0.93;
        headX = 0.45;
        headZ = Math.sin(t * 1.2) * 0.08;
        armLz = 0.08;
        armRz = -0.08;
        bodyY = -0.03;
        break;
      }
      case 'dizzy': {
        bodyRotZ = Math.sin(t * 5) * 0.18;
        headZ = Math.sin(t * 5 + 1) * 0.25;
        headY = Math.sin(t * 3) * 0.3;
        armLz = 0.9 + Math.sin(t * 6) * 0.3;
        armRz = -0.9 + Math.sin(t * 6) * 0.3;
        break;
      }
      case 'hit': {
        // Salta com o punho no ar (para bater nos dados).
        armRz = -2.9;
        armLz = 0.4;
        headX = -0.35;
        legL = -0.4;
        legR = 0.3;
        break;
      }
    }
    if (this.anim === 'cheer') bodyRotY = Math.sin(t * 3.5) * 0.25;

    this.legL.rotation.x += (legL - this.legL.rotation.x) * k;
    this.legR.rotation.x += (legR - this.legR.rotation.x) * k;
    this.armL.rotation.z += (armLz - this.armL.rotation.z) * k;
    this.armR.rotation.z += (armRz - this.armR.rotation.z) * k;
    this.armL.rotation.x += (armLx - this.armL.rotation.x) * k;
    this.armR.rotation.x += (armRx - this.armR.rotation.x) * k;
    this.head.rotation.x += (headX - this.head.rotation.x) * k;
    this.head.rotation.z += (headZ - this.head.rotation.z) * k;
    this.head.rotation.y += (headY - this.head.rotation.y) * k;
    this.body.position.y += (bodyY - this.body.position.y) * k;
    this.body.rotation.z += (bodyRotZ - this.body.rotation.z) * k;
    this.body.rotation.y += (bodyRotY - this.body.rotation.y) * k;
    const sy = this.body.scale.y + (squash - this.body.scale.y) * k;
    this.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));

    // Piscar os olhos
    this.nextBlink -= dt;
    const blinking = this.nextBlink < 0.12 && this.anim !== 'dizzy';
    this.eyes.scale.y = blinking ? 0.1 : this.anim === 'dizzy' ? 0.6 : 1;
    if (this.nextBlink < 0) this.nextBlink = 2 + Math.random() * 3;

    if (this.propeller) this.propeller.rotation.y += dt * (this.anim === 'cheer' ? 30 : 8);
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }

  // ── Construção ──────────────────────────────────────────

  private mat(color: THREE.ColorRepresentation): THREE.MeshToonMaterial {
    const m = toonUnique(color);
    this.materials.push(m);
    return m;
  }

  private build(): void {
    const d = this.def;
    const main = this.mat(d.color);
    const accent = this.mat(d.accent);
    const dark = this.mat(SKIN_DARK);
    const white = this.mat('#ffffff');
    const cheek = this.mat('#ff8fa3');

    const bodyScale =
      d.body === 'tall' ? new THREE.Vector3(0.9, 1.2, 0.9)
      : d.body === 'chubby' ? new THREE.Vector3(1.2, 0.95, 1.1)
      : new THREE.Vector3(1, 1, 0.95);

    // Pernas
    for (const [leg, x] of [[this.legL, 0.2], [this.legR, -0.2]] as const) {
      leg.position.set(x * bodyScale.x, 0.45, 0);
      const m = mesh(new THREE.CapsuleGeometry(0.14, 0.22, 4, 10), main);
      m.position.y = -0.22;
      const foot = mesh(new THREE.SphereGeometry(0.17, 12, 10), dark);
      foot.scale.set(1, 0.6, 1.35);
      foot.position.set(0, -0.4, 0.06);
      leg.add(m, foot);
      this.body.add(leg);
    }

    // Tronco + barriga
    const torso = mesh(new THREE.SphereGeometry(0.45, 20, 16), main);
    torso.scale.copy(bodyScale);
    torso.position.y = 0.85;
    const belly = mesh(new THREE.SphereGeometry(0.32, 16, 12), accent);
    belly.scale.set(bodyScale.x, bodyScale.y, 0.45);
    belly.position.set(0, 0.8, 0.3 * bodyScale.z);
    this.body.add(torso, belly);

    // Braços
    for (const [arm, side] of [[this.armL, 1], [this.armR, -1]] as const) {
      arm.position.set(side * 0.43 * bodyScale.x, 0.85 + 0.25 * bodyScale.y, 0);
      const a = mesh(new THREE.CapsuleGeometry(0.1, 0.26, 4, 8), main);
      a.position.y = -0.22;
      const hand = mesh(new THREE.SphereGeometry(0.13, 12, 10), white);
      hand.position.y = -0.45;
      arm.add(a, hand);
      this.body.add(arm);
    }

    // Cabeça
    this.head.position.y = 0.85 + 0.42 * bodyScale.y;
    const skull = mesh(new THREE.SphereGeometry(0.52, 24, 18), main);
    skull.position.y = 0.38;
    this.head.add(skull);

    // Olhos
    this.eyes.position.set(0, 0.45, 0);
    for (const side of [1, -1]) {
      const eye = mesh(new THREE.SphereGeometry(0.115, 14, 12), white, { cast: false });
      eye.scale.set(1, 1.3, 0.55);
      eye.position.set(side * 0.18, 0, 0.44);
      const pupil = mesh(new THREE.SphereGeometry(0.07, 12, 10), dark, { cast: false });
      pupil.scale.set(1, 1.3, 0.6);
      pupil.position.set(side * 0.18, -0.01, 0.5);
      const shine = mesh(new THREE.SphereGeometry(0.022, 8, 6), white, { cast: false });
      shine.position.set(side * 0.18 + 0.025, 0.035, 0.535);
      this.eyes.add(eye, pupil, shine);
    }
    this.head.add(this.eyes);

    for (const side of [1, -1]) {
      const c = mesh(new THREE.SphereGeometry(0.07, 10, 8), cheek, { cast: false });
      c.scale.set(1.3, 0.8, 0.4);
      c.position.set(side * 0.3, 0.28, 0.43);
      this.head.add(c);
    }
    const mouth = mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 14, Math.PI), dark, { cast: false });
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, 0.27, 0.5);
    this.head.add(mouth);

    this.head.add(this.buildAccessory(main, accent, dark));
    this.body.add(this.head);
  }

  private buildAccessory(
    main: THREE.Material,
    accent: THREE.Material,
    dark: THREE.Material,
  ): THREE.Object3D {
    const g = new THREE.Group();
    const top = 0.86;
    switch (this.def.accessory) {
      case 'leaf': {
        const stem = mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.18), this.mat('#6b3e1f'));
        stem.position.y = top + 0.06;
        const leaf = mesh(new THREE.SphereGeometry(0.2, 12, 8), this.mat('#5cc95c'));
        leaf.scale.set(1, 0.25, 0.55);
        leaf.position.set(0.14, top + 0.16, 0);
        leaf.rotation.z = 0.5;
        g.add(stem, leaf);
        break;
      }
      case 'bunnyEars':
      case 'catEars': {
        for (const side of [1, -1]) {
          if (this.def.accessory === 'bunnyEars') {
            const ear = mesh(new THREE.CapsuleGeometry(0.1, 0.42, 4, 8), main);
            ear.position.set(side * 0.2, top + 0.22, -0.05);
            ear.rotation.z = -side * 0.18;
            const inner = mesh(new THREE.CapsuleGeometry(0.05, 0.34, 4, 8), accent, { cast: false });
            inner.position.set(0, 0, 0.06);
            ear.add(inner);
            g.add(ear);
          } else {
            const ear = mesh(new THREE.ConeGeometry(0.16, 0.3, 4), main);
            ear.position.set(side * 0.3, top - 0.02, 0);
            ear.rotation.z = -side * 0.35;
            g.add(ear);
          }
        }
        break;
      }
      case 'antenna': {
        const rod = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35), dark);
        rod.position.y = top + 0.12;
        const ball = mesh(new THREE.SphereGeometry(0.09, 12, 10), this.mat(this.def.accent));
        (ball.material as THREE.MeshToonMaterial).emissive = new THREE.Color('#fff7a0');
        (ball.material as THREE.MeshToonMaterial).emissiveIntensity = 0.6;
        ball.position.y = top + 0.32;
        g.add(rod, ball);
        break;
      }
      case 'horns': {
        for (const side of [1, -1]) {
          const horn = mesh(new THREE.ConeGeometry(0.08, 0.28, 10), accent);
          horn.position.set(side * 0.25, top - 0.04, 0.05);
          horn.rotation.z = -side * 0.5;
          g.add(horn);
        }
        break;
      }
      case 'propeller': {
        const cap = mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mat('#ff5a5f'));
        cap.position.y = top - 0.12;
        const stem = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16), dark);
        stem.position.y = top + 0.04;
        const blades = new THREE.Group();
        for (const r of [0, Math.PI / 2]) {
          const blade = mesh(new THREE.BoxGeometry(0.6, 0.02, 0.09), this.mat('#ffcc00'));
          blade.rotation.y = r;
          blades.add(blade);
        }
        blades.position.y = top + 0.12;
        this.propeller = blades;
        g.add(cap, stem, blades);
        break;
      }
      case 'crown': {
        const gold = this.mat('#ffcc33');
        const band = mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.12, 16, 1, true), gold);
        band.position.y = top - 0.02;
        g.add(band);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const spike = mesh(new THREE.ConeGeometry(0.06, 0.16, 6), gold);
          spike.position.set(Math.sin(a) * 0.22, top + 0.1, Math.cos(a) * 0.22);
          g.add(spike);
        }
        break;
      }
      case 'mohawk': {
        for (let i = 0; i < 4; i++) {
          const spike = mesh(new THREE.ConeGeometry(0.08, 0.3, 8), accent);
          spike.position.set(0, top + 0.02 - Math.abs(i - 1.5) * 0.04, 0.25 - i * 0.17);
          spike.rotation.x = -0.3 + i * 0.2;
          g.add(spike);
        }
        break;
      }
      case 'beanie': {
        const hat = mesh(new THREE.SphereGeometry(0.54, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), accent);
        hat.position.y = top - 0.5;
        const rim = mesh(new THREE.TorusGeometry(0.47, 0.06, 8, 24), accent);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = top - 0.36;
        const pom = mesh(new THREE.SphereGeometry(0.11, 10, 8), this.mat('#ffffff'));
        pom.position.y = top + 0.06;
        g.add(hat, rim, pom);
        break;
      }
      case 'flower': {
        const center = mesh(new THREE.SphereGeometry(0.07, 10, 8), this.mat('#ffcc00'));
        center.position.set(0.25, top - 0.02, 0.2);
        g.add(center);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const petal = mesh(new THREE.SphereGeometry(0.075, 10, 8), accent);
          petal.position.set(0.25 + Math.cos(a) * 0.1, top - 0.02 + Math.sin(a) * 0.1, 0.18);
          g.add(petal);
        }
        break;
      }
    }
    return g;
  }
}
