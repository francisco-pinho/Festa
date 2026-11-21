/**
 * Cenário de um mapa feito no Blender (docs/BLENDER-MAPAS.md): carrega o .glb exportado e põe-no
 * por baixo das casas. Do cenário em código ficam só o céu, a luz, o mar e as nuvens; tudo o resto
 * (terreno, montanhas, árvores, edifícios) vem do Blender. Os pontos das casas (`casa_…`) e o
 * ponto das regras (`mapa`) não se desenham.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRng, type Board } from '@festa/game';
import type { BoardTheme } from './boardThemes';
import { Clouds, Water, setupSky } from './environment';

export class BlenderTheme implements BoardTheme {
  readonly group = new THREE.Group();
  readonly bounds;
  private readonly water = new Water(600);
  private readonly clouds = new Clouds(createRng(7), 16, 160);

  constructor(board: Board, scene: THREE.Scene) {
    setupSky(scene, { fog: [140, 360] });
    const xs = board.spaces.map((s) => s.x);
    const zs = board.spaces.map((s) => s.z);
    this.bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    this.water.mesh.position.y = -0.6;
    this.group.add(this.water.mesh, this.clouds.group);
    new GLTFLoader()
      .loadAsync(board.scenery!)
      .then((gltf) => {
        const hide: THREE.Object3D[] = [];
        gltf.scene.traverse((o) => {
          if (/^(casa_|mapa)/.test(o.name)) hide.push(o);
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        for (const o of hide) o.removeFromParent();
        this.group.add(gltf.scene);
      })
      .catch((err) => console.error(`Cenário do Blender em falta: ${board.scenery}`, err));
  }

  setFlags(): void {}

  update(dt: number, time: number): void {
    this.water.update(time);
    this.clouds.update(dt);
  }
}
