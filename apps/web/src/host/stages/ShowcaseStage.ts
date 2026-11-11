/**
 * Palco de "apresentação": uma pequena ilha com personagens alinhadas.
 * Usado no lobby, na escolha de personagens e no pódio final.
 */
import * as THREE from 'three';
import { createRng, getCharacter } from '@festa/game';
import type { Stage } from '../three/Engine';
import { CharacterModel, type CharacterAnim } from '../three/CharacterModel';
import { disposeObject, mesh, textSprite, toon } from '../three/materials';
import { damp } from '../three/tweens';
import { Clouds, Water, palmTree, setupSky } from './environment';

interface Slot {
  model: CharacterModel;
  label: THREE.Sprite | null;
  labelLift?: number;
}

interface Confetti {
  mesh: THREE.InstancedMesh;
  velocities: THREE.Vector3[];
  spins: THREE.Vector3[];
  positions: THREE.Vector3[];
  rotations: THREE.Euler[];
}

export class ShowcaseStage implements Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 400);
  private readonly water = new Water(300);
  private readonly clouds = new Clouds(createRng(3), 10, 70);
  private readonly slots = new Map<string, Slot>();
  private readonly podium = new THREE.Group();
  private confetti: Confetti | null = null;
  private orbit = 0;
  private orbitSpeed = 0.08;
  private camTarget = new THREE.Vector3(0, 1.5, 0);
  private camDistance = 15;
  private camHeight = 5;

  constructor() {
    setupSky(this.scene, { fog: [60, 160] });
    this.scene.add(this.water.mesh, this.clouds.group, this.podium);

    const sand = mesh(new THREE.CylinderGeometry(16, 17.5, 2, 48), toon('#f2d58b'), { cast: false, receive: true });
    sand.position.y = -1;
    const grass = mesh(new THREE.CylinderGeometry(14, 14.5, 2, 48), toon('#7ccf5b'), { cast: false, receive: true });
    grass.position.y = -0.85;
    this.scene.add(sand, grass);

    const rng = createRng(11);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.95 + (i / 8) * Math.PI * 1.1;
      const tree = palmTree(rng, 1 + rng.next() * 0.4);
      tree.position.set(Math.cos(a) * (10 + rng.next() * 2.5), 0.1, Math.sin(a) * (9 + rng.next() * 2));
      this.scene.add(tree);
    }
  }

  /** Mostra personagens em arco, viradas para a câmara. */
  setLineup(entries: { key: string; characterId: string; label?: string; labelColor?: string }[]): void {
    for (const key of [...this.slots.keys()]) if (!entries.some((e) => e.key === key)) this.remove(key);
    const n = entries.length;
    const spread = Math.min(1.25, 0.15 + n * 0.11);
    entries.forEach((e, i) => {
      let slot = this.slots.get(e.key);
      if (!slot || slot.model.def.id !== e.characterId) {
        if (slot) this.remove(e.key);
        const model = new CharacterModel(getCharacter(e.characterId));
        this.scene.add(model.root);
        slot = { model, label: null };
        this.slots.set(e.key, slot);
        model.root.scale.setScalar(0.01);
      }
      const a = n === 1 ? 0 : -spread / 2 + (i / (n - 1)) * spread;
      const r = 8.5;
      slot.model.root.position.set(Math.sin(a) * r, 0.1, -Math.cos(a) * r + 6);
      slot.model.faceYaw(-a * 0.6, true);
      // Nomes em duas alturas alternadas, para não se sobreporem quando há muitas personagens.
      slot.labelLift = n > 5 && i % 2 === 1 ? 0.6 : 0;
      this.setLabel(e.key, e.label ?? null, e.labelColor);
    });
  }

  setLabel(key: string, text: string | null, color = '#ffffff'): void {
    const slot = this.slots.get(key);
    if (!slot) return;
    if (slot.label) {
      slot.model.root.remove(slot.label);
      disposeObject(slot.label);
      slot.label = null;
    }
    if (!text) return;
    slot.label = textSprite(text, { height: 0.55, color });
    slot.label.position.y = 2.9 + (slot.labelLift ?? 0);
    slot.model.root.add(slot.label);
  }

  setAnim(key: string, anim: CharacterAnim): void {
    this.slots.get(key)?.model.setAnim(anim);
  }

  setFaded(key: string, faded: boolean): void {
    this.slots.get(key)?.model.setFaded(faded);
  }

  view(opts: { distance?: number; height?: number; orbitSpeed?: number; target?: THREE.Vector3 }): void {
    if (opts.distance !== undefined) this.camDistance = opts.distance;
    if (opts.height !== undefined) this.camHeight = opts.height;
    if (opts.orbitSpeed !== undefined) this.orbitSpeed = opts.orbitSpeed;
    if (opts.target) this.camTarget.copy(opts.target);
  }

  /** Pódio: 1.º ao centro, 2.º à esquerda, 3.º à direita; os restantes atrás. */
  showPodium(ranked: { key: string; characterId: string; rank: number; name: string }[]): void {
    this.setLineup([]);
    disposeObject(this.podium);
    this.podium.clear();
    const places = [
      { x: 0, h: 2.4, color: '#ffd23f' },
      { x: -2.6, h: 1.6, color: '#d6dde6' },
      { x: 2.6, h: 1.0, color: '#e0975a' },
    ];
    for (const [i, p] of places.entries()) {
      const block = mesh(new THREE.BoxGeometry(2.4, p.h, 2.4), toon(p.color), { receive: true });
      block.position.set(p.x, p.h / 2, 3);
      const num = textSprite(String(i + 1), { height: 0.9, color: '#ffffff' });
      num.position.set(p.x, p.h / 2, 4.3);
      this.podium.add(block, num);
    }
    let back = 0;
    const others = ranked.filter((r) => r.rank > 3).length;
    for (const r of ranked) {
      const model = new CharacterModel(getCharacter(r.characterId));
      this.scene.add(model.root);
      const slot: Slot = { model, label: null };
      this.slots.set(r.key, slot);
      if (r.rank <= 3) {
        const p = places[r.rank - 1]!;
        // Empates no mesmo degrau ficam lado a lado.
        const same = ranked.filter((o) => o.rank === r.rank);
        const idx = same.indexOf(r);
        const off = same.length > 1 ? (idx - (same.length - 1) / 2) * 0.9 : 0;
        model.root.position.set(p.x + off, p.h, 3);
        model.setAnim(r.rank === 1 ? 'cheer' : 'idle');
      } else {
        const x = (back - (others - 1) / 2) * 1.6;
        model.root.position.set(x, 0.1, -0.5);
        model.setAnim('sad');
        back++;
      }
      this.setLabel(r.key, r.name);
      // Nomes de empatados/vizinhos em alturas alternadas para não se sobreporem.
      const label = this.slots.get(r.key)?.label;
      const sameRank = ranked.filter((o) => o.rank === r.rank);
      if (label && sameRank.indexOf(r) % 2 === 1) label.position.y += 0.6;
      if (label && r.rank > 3 && back % 2 === 0) label.position.y += 0.6;
    }
    this.view({ distance: 13, height: 4.5, orbitSpeed: 0, target: new THREE.Vector3(0, 2.2, 1.5) });
    this.orbit = 0;
    this.spawnConfetti();
  }

  private spawnConfetti(): void {
    const count = 260;
    const geo = new THREE.PlaneGeometry(0.16, 0.26);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const colors = ['#ff5a5f', '#ffd23f', '#3fa7ff', '#4cd964', '#b36bff', '#ff8fc7'];
    const c: Confetti = { mesh: inst, velocities: [], spins: [], positions: [], rotations: [] };
    for (let i = 0; i < count; i++) {
      inst.setColorAt(i, new THREE.Color(colors[i % colors.length]!));
      c.positions.push(new THREE.Vector3((Math.random() - 0.5) * 16, 8 + Math.random() * 10, (Math.random() - 0.5) * 8));
      c.velocities.push(new THREE.Vector3((Math.random() - 0.5) * 0.6, -1.2 - Math.random(), (Math.random() - 0.5) * 0.6));
      c.spins.push(new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      c.rotations.push(new THREE.Euler());
    }
    this.confetti = c;
    this.scene.add(inst);
  }

  private remove(key: string): void {
    const slot = this.slots.get(key);
    if (!slot) return;
    this.scene.remove(slot.model.root);
    slot.model.dispose();
    if (slot.label) disposeObject(slot.label);
    this.slots.delete(key);
  }

  update(dt: number, time: number): void {
    this.water.update(time);
    this.clouds.update(dt);
    for (const slot of this.slots.values()) {
      slot.model.update(dt);
      const s = slot.model.root.scale.x;
      if (s < 1) slot.model.root.scale.setScalar(Math.min(1, s + (1 - s) * damp(8, dt) + 0.01));
    }
    if (this.confetti) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      const c = this.confetti;
      for (let i = 0; i < c.positions.length; i++) {
        const p = c.positions[i]!;
        p.addScaledVector(c.velocities[i]!, dt);
        p.x += Math.sin(time * 2 + i) * dt * 0.5;
        if (p.y < 0) p.y = 14;
        const r = c.rotations[i]!;
        r.x += c.spins[i]!.x * dt;
        r.y += c.spins[i]!.y * dt;
        m.compose(p, q.setFromEuler(r), one);
        c.mesh.setMatrixAt(i, m);
      }
      c.mesh.instanceMatrix.needsUpdate = true;
    }
    this.orbit += dt * this.orbitSpeed;
    const angle = Math.sin(this.orbit) * 0.35;
    this.camera.position.set(
      this.camTarget.x + Math.sin(angle) * this.camDistance,
      this.camTarget.y + this.camHeight,
      this.camTarget.z + Math.cos(angle) * this.camDistance,
    );
    this.camera.lookAt(this.camTarget);
  }

  dispose(): void {
    for (const key of [...this.slots.keys()]) this.remove(key);
    disposeObject(this.scene);
  }
}
