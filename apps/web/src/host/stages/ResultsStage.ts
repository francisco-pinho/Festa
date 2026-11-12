/**
 * Ecrã de resultados no fim de cada minijogo, montado no próprio cenário do minijogo: um pódio
 * com todos (1.º ao meio e mais alto), o lugar e o nome por cima, quem ganhou a festejar e quem
 * perdeu triste, e as moedas ganhas a cair do céu para dentro de cada personagem, com o total.
 */
import * as THREE from 'three';
import { getCharacter } from '@festa/game';
import { sound } from '../audio/Sound';
import type { Engine, Stage } from '../three/Engine';
import { CharacterModel } from '../three/CharacterModel';
import { coinMaterials } from '../three/coinArt';
import { disposeObject, mesh, textSprite, toonUnique } from '../three/materials';

export interface ResultEntry {
  id: string;
  name: string;
  characterId: string;
  place: number;
  gained: number;
  total: number;
}

const STEP_H = [1.3, 0.9, 0.6, 0.35];
const STEP_COLORS = ['#ffd23f', '#d9dde3', '#e0a36a', '#9a8fb8'];

export class ResultsStage implements Stage {
  readonly camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
  private readonly group = new THREE.Group();
  private readonly models: CharacterModel[] = [];
  private readonly center = new THREE.Vector3();
  private readonly back = new THREE.Vector3();
  private orbit = 0;
  private readonly coins: { m: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; delay: number }[] = [];
  private readonly coinGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.06, 16);
  private readonly coinMat = coinMaterials(false);

  constructor(
    readonly scene: THREE.Scene,
    view: THREE.PerspectiveCamera,
    entries: ResultEntry[],
  ) {
    // O pódio fica onde a câmara do minijogo estava a olhar, no chão.
    const dir = new THREE.Vector3();
    view.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
    dir.normalize();
    this.center.copy(view.position).addScaledVector(dir, 9).setY(0);
    this.back.copy(dir).negate();
    this.group.position.copy(this.center);
    this.group.rotation.y = Math.atan2(this.back.x, this.back.z);
    this.scene.add(this.group);
    // Ordem no pódio: 1.º ao meio, 2.º à esquerda, 3.º à direita, 4.º mais à esquerda…
    const sorted = [...entries].sort((a, b) => a.place - b.place);
    const slots = [0, -1, 1, -2, 2, -3, 3, -4];
    sorted.forEach((e, i) => {
      const x = (slots[i] ?? i) * 1.9;
      const h = STEP_H[Math.min(3, e.place - 1)]!;
      const step = mesh(new THREE.BoxGeometry(1.7, h, 1.7), toonUnique(STEP_COLORS[Math.min(3, e.place - 1)]!));
      step.position.set(x, h / 2, 0);
      const num = textSprite(`${e.place}.º`, { height: 0.6, color: '#1d1433', stroke: '#ffffff' });
      num.position.set(x, h / 2, 0.9);
      this.group.add(step, num);
      const model = new CharacterModel(getCharacter(e.characterId));
      model.root.position.set(x, h, 0);
      model.faceYaw(0, true);
      model.setHighlight(getCharacter(e.characterId).color, 0.5, true);
      model.setAnim(e.place === 1 ? 'cheer' : e.place === sorted[sorted.length - 1]!.place && sorted.length > 1 ? 'sad' : 'idle');
      const label = textSprite(e.name, { height: 0.45, color: '#ffffff', stroke: '#1d1433' });
      label.position.y = 2.7;
      model.root.add(label);
      this.group.add(model.root);
      this.models.push(model);
      // Moedas ganhas: caem uma a uma para dentro da personagem.
      for (let c = 0; c < Math.min(12, e.gained); c++) {
        const m = new THREE.Mesh(this.coinGeo, this.coinMat);
        m.rotation.x = Math.PI / 2;
        m.visible = false;
        this.group.add(m);
        this.coins.push({ m, from: new THREE.Vector3(x + (Math.random() - 0.5) * 1.2, h + 6, (Math.random() - 0.5) * 0.6), to: new THREE.Vector3(x, h + 1.3, 0), t: 0, delay: 1 + c * 0.12 + i * 0.15 });
      }
      // Total por cima (aparece depois das moedas).
      const tot = textSprite(e.gained ? `+${e.gained} 🪙 → ${e.total}` : `🪙 ${e.total}`, { height: 0.45, color: e.gained ? '#ffd23f' : '#d9dde3', stroke: '#1d1433' });
      tot.position.set(x, h + 3.3, 0);
      tot.visible = false;
      tot.userData.showAt = 1.2 + Math.min(12, e.gained) * 0.12 + i * 0.15 + 0.4;
      this.group.add(tot);
    });
    this.camera.position.copy(this.center).addScaledVector(this.back, 9).setY(3.4);
    this.camera.lookAt(this.center.x, 1.6, this.center.z);
  }

  private clock = 0;

  update(dt: number): void {
    this.clock += dt;
    for (const m of this.models) m.update(dt);
    for (const c of this.coins) {
      if (this.clock < c.delay) continue;
      c.t += dt / 0.55;
      const k = Math.min(1, c.t);
      c.m.visible = k < 1;
      c.m.position.lerpVectors(c.from, c.to, k * k);
      c.m.rotation.z += dt * 12;
      if (k >= 1 && !c.m.userData.done) {
        c.m.userData.done = true;
        sound.play('coin', { vol: 0.3, pitch: 1.1 + Math.random() * 0.2 });
      }
    }
    for (const o of this.group.children) if (o.userData.showAt !== undefined && this.clock > o.userData.showAt) o.visible = true;
    // Câmara a rodar devagar à volta do pódio.
    this.orbit = Math.sin(this.clock * 0.35) * 0.35;
    const a = Math.atan2(this.back.x, this.back.z) + this.orbit;
    this.camera.position.set(this.center.x + Math.sin(a) * 9, 3.4, this.center.z + Math.cos(a) * 9);
    this.camera.lookAt(this.center.x, 1.7, this.center.z);
  }

  /** Engine: o cenário é do minijogo (quem o criou é que o liberta). */
  dispose(): void {
    for (const m of this.models) m.dispose();
    this.scene.remove(this.group);
    disposeObject(this.group);
    this.coinGeo.dispose();
  }

  static async show(engine: Engine, scene: THREE.Scene, view: THREE.PerspectiveCamera, entries: ResultEntry[], seconds: number): Promise<void> {
    const stage = new ResultsStage(scene, view, entries);
    engine.setStage(stage, false);
    sound.play('cheer', { vol: 0.6 });
    await engine.wait(seconds);
    stage.dispose();
  }
}
