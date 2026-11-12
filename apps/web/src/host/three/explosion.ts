/**
 * Explosão a sério (para bombas, meteoros, minas…): bola de fogo que cresce e escurece, fumo a
 * subir, estilhaços a voar, um clarão de luz e uma onda de choque no chão. Corre sozinha e
 * desaparece; basta chamar `explode(scene, posição, tamanho)` uma vez.
 */
import * as THREE from 'three';
import { sound } from '../audio/Sound';

interface Fx {
  root: THREE.Group;
  t: number;
  life: number;
  update(k: number, dt: number): void;
}

const active: Fx[] = [];
let raf = 0;
let last = 0;

function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (let i = active.length - 1; i >= 0; i--) {
    const fx = active[i]!;
    fx.t += dt;
    const k = Math.min(1, fx.t / fx.life);
    fx.update(k, dt);
    if (k >= 1) {
      fx.root.parent?.remove(fx.root);
      fx.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
      active.splice(i, 1);
    }
  }
  raf = active.length ? requestAnimationFrame(loop) : 0;
}

const sphere = new THREE.IcosahedronGeometry(1, 2);

export function explode(scene: THREE.Scene, at: THREE.Vector3, size = 1, opts: { sound?: boolean; color?: string } = {}): void {
  if (opts.sound !== false) sound.play('boom', { vol: Math.min(1, 0.5 + size * 0.3) });
  const root = new THREE.Group();
  root.position.copy(at);
  scene.add(root);
  // Bola de fogo (núcleo amarelo + camada laranja)
  const core = new THREE.Mesh(sphere.clone(), new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, depthWrite: false }));
  const fire = new THREE.Mesh(sphere.clone(), new THREE.MeshBasicMaterial({ color: opts.color ?? '#ff7a1a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  root.add(fire, core);
  // Fumo: bolas cinzentas que sobem e crescem
  const smoke: { m: THREE.Mesh; v: THREE.Vector3 }[] = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(sphere.clone(), new THREE.MeshToonMaterial({ color: i % 2 ? '#4a4450' : '#6a6470', transparent: true, depthWrite: false }));
    m.scale.setScalar(0.01);
    const a = (i / 9) * Math.PI * 2;
    smoke.push({ m, v: new THREE.Vector3(Math.cos(a) * 0.9, 1.4 + Math.random(), Math.sin(a) * 0.9).multiplyScalar(size) });
    root.add(m);
  }
  // Estilhaços a voar com gravidade
  const debris: { m: THREE.Mesh; v: THREE.Vector3; r: THREE.Vector3 }[] = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshToonMaterial({ color: i % 3 ? '#3a3150' : '#ff9a3c' }));
    const a = Math.random() * Math.PI * 2;
    debris.push({ m, v: new THREE.Vector3(Math.cos(a), 1 + Math.random() * 1.5, Math.sin(a)).multiplyScalar((4 + Math.random() * 4) * size), r: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(12) });
    root.add(m);
  }
  // Onda de choque no chão
  const ringGeo = new THREE.RingGeometry(0.7, 1, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#fff1c2', transparent: true, depthWrite: false }));
  ring.position.y = -at.y + 0.08;
  root.add(ring);
  // Clarão
  const light = new THREE.PointLight('#ffb050', 60 * size, 14 * size);
  light.position.y = 0.6;
  root.add(light);

  active.push({
    root,
    t: 0,
    life: 1.4,
    update(k, dt) {
      const fireK = Math.min(1, k / 0.35);
      const fs = size * (0.4 + fireK * 1.6);
      fire.scale.setScalar(fs);
      core.scale.setScalar(fs * 0.6 * (1 - fireK * 0.8));
      (fire.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - fireK);
      (fire.material as THREE.MeshBasicMaterial).color.lerpColors(new THREE.Color('#ffb347'), new THREE.Color('#c0391b'), fireK);
      (core.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - fireK * 1.4);
      light.intensity = 60 * size * Math.max(0, 1 - k * 3);
      for (const s of smoke) {
        s.m.position.addScaledVector(s.v, dt * (1 - k * 0.7));
        s.m.scale.setScalar(size * (0.3 + k * 1.3));
        (s.m.material as THREE.MeshToonMaterial).opacity = Math.max(0, 0.85 * (1 - k));
      }
      for (const d of debris) {
        d.v.y -= 14 * dt;
        d.m.position.addScaledVector(d.v, dt);
        d.m.rotation.x += d.r.x * dt;
        d.m.rotation.y += d.r.y * dt;
        if (d.m.position.y < -at.y) d.m.position.y = -at.y;
      }
      ring.scale.setScalar(size * (0.5 + k * 4));
      (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k * 1.6));
    },
  });
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
}
