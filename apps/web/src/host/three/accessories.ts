/**
 * Acessórios das personagens (folha, orelhas, coroa, hélice…), feitos com formas simples.
 * Coordenadas pensadas para uma cabeça de raio ~0,52 com o centro a 0,38 acima da origem;
 * quem os usa ajusta a escala e a posição à cabeça do modelo.
 */
import * as THREE from 'three';
import type { CharacterDef } from '@festa/game';
import { mesh } from './materials';

export function buildAccessory(
  def: CharacterDef,
  mat: (color: THREE.ColorRepresentation) => THREE.MeshToonMaterial,
  onPropeller: (o: THREE.Object3D) => void,
): THREE.Object3D {
  const main = mat(def.color);
  const accent = mat(def.accent);
  const dark = mat('#2b1d3a');
  const g = new THREE.Group();
  const top = 0.86;
  switch (def.accessory) {
    case 'leaf': {
      const stem = mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.18), mat('#6b3e1f'));
      stem.position.y = top + 0.06;
      const leaf = mesh(new THREE.SphereGeometry(0.2, 12, 8), mat('#5cc95c'));
      leaf.scale.set(1, 0.25, 0.55);
      leaf.position.set(0.14, top + 0.16, 0);
      leaf.rotation.z = 0.5;
      g.add(stem, leaf);
      break;
    }
    case 'bunnyEars':
    case 'catEars': {
      for (const side of [1, -1]) {
        if (def.accessory === 'bunnyEars') {
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
      const ball = mesh(new THREE.SphereGeometry(0.09, 12, 10), mat(def.accent));
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
      const cap = mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ff5a5f'));
      cap.position.y = top - 0.12;
      const stem = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16), dark);
      stem.position.y = top + 0.04;
      const blades = new THREE.Group();
      for (const r of [0, Math.PI / 2]) {
        const blade = mesh(new THREE.BoxGeometry(0.6, 0.02, 0.09), mat('#ffcc00'));
        blade.rotation.y = r;
        blades.add(blade);
      }
      blades.position.y = top + 0.12;
      onPropeller(blades);
      g.add(cap, stem, blades);
      break;
    }
    case 'crown': {
      const gold = mat('#ffcc33');
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
      const pom = mesh(new THREE.SphereGeometry(0.11, 10, 8), mat('#ffffff'));
      pom.position.y = top + 0.06;
      g.add(hat, rim, pom);
      break;
    }
    case 'flower': {
      const center = mesh(new THREE.SphereGeometry(0.07, 10, 8), mat('#ffcc00'));
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
