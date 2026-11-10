/**
 * Dado 3D de 6 faces. Gira no ar até ser "batido"; depois assenta a mostrar
 * o valor virado para cima (e ligeiramente para a câmara).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from './materials';
import { damp } from './tweens';

/** Ordem das faces no BoxGeometry: +x, -x, +y, -y, +z, -z (opostos somam 7). */
const FACE_VALUES = [1, 6, 2, 5, 3, 4];

/** Rotação que põe a face com `value` virada para +Y. */
const UP_ROTATION: Record<number, THREE.Euler> = {
  1: new THREE.Euler(0, 0, Math.PI / 2),
  6: new THREE.Euler(0, 0, -Math.PI / 2),
  2: new THREE.Euler(0, 0, 0),
  5: new THREE.Euler(Math.PI, 0, 0),
  3: new THREE.Euler(-Math.PI / 2, 0, 0),
  4: new THREE.Euler(Math.PI / 2, 0, 0),
};

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
};

let faceMaterials: THREE.MeshStandardMaterial[] | null = null;
function getFaceMaterials(): THREE.MeshStandardMaterial[] {
  faceMaterials ??= FACE_VALUES.map(
    (value) =>
      new THREE.MeshStandardMaterial({
        roughness: 0.35,
        map: canvasTexture(128, (ctx, s) => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, s, s);
          ctx.fillStyle = value === 1 ? '#ff3b5c' : '#2b1d3a';
          for (const [x, y] of PIPS[value]!) {
            ctx.beginPath();
            ctx.arc(x * s, y * s, s * (value === 1 ? 0.14 : 0.09), 0, Math.PI * 2);
            ctx.fill();
          }
        }),
      }),
  );
  return faceMaterials;
}

export class Dice {
  readonly root = new THREE.Group();
  private readonly cube: THREE.Mesh;
  private spinning = true;
  private readonly spinAxis = new THREE.Vector3(Math.random(), 1, Math.random()).normalize();
  private target: THREE.Quaternion | null = null;
  private t = Math.random() * 10;
  value: number | null = null;

  constructor(size = 0.9) {
    this.cube = new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 4, size * 0.16), getFaceMaterials());
    this.cube.castShadow = true;
    this.root.add(this.cube);
  }

  /** Para o dado num valor. `yaw` roda-o para a face ficar virada para a câmara. */
  settle(value: number, yaw = 0): void {
    this.value = value;
    this.spinning = false;
    const up = new THREE.Quaternion().setFromEuler(UP_ROTATION[value]!);
    // Inclina um pouco para a câmara ver a face de cima.
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, yaw, 0, 'YXZ'));
    this.target = tilt.multiply(up);
  }

  update(dt: number): void {
    this.t += dt;
    if (this.spinning) {
      this.cube.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(this.spinAxis, dt * 14));
      this.cube.position.y = Math.sin(this.t * 5) * 0.08;
    } else if (this.target) {
      this.cube.quaternion.slerp(this.target, damp(12, dt));
      this.cube.position.y *= 1 - damp(10, dt);
    }
  }

  dispose(): void {
    this.cube.geometry.dispose();
  }
}
