/**
 * Cenário à volta dos minijogos, com o tema do mapa onde se está a jogar (ilha, vulcão, castelo,
 * parque, cidade). Três anéis: adereços pequenos junto à zona de jogo, coisas grandes mais atrás
 * e um «fundo» alto e fechado (montanhas, prédios, torres…) para não se ver o infinito.
 * Há sempre chão debaixo do cenário: nada flutua na água.
 */
import * as THREE from 'three';
import type { Rng } from '@festa/game';
import { PROPS, pickProp } from '../three/props';

export type Theme = 'island' | 'volcano' | 'castle' | 'park' | 'city';

interface Look {
  ground: string;
  /** Faixa junto à zona de jogo (areia, pedra…), opcional. */
  rim?: string;
  small: readonly string[];
  big: readonly string[];
  back: readonly string[];
  /** Altura das coisas do fundo. */
  backH: [number, number];
}

const noItems = (k: string) => !/chest|Chest|Coin|Crate|crate/.test(k);

function look(theme: Theme): Look {
  switch (theme) {
    case 'volcano':
      return {
        ground: '#5a4038',
        rim: '#3a2a26',
        small: [...PROPS.rocks, ...PROPS.pebbles, ...PROPS.deadTrees.slice(0, 2)],
        big: [...PROPS.tallRocks, ...PROPS.deadTrees],
        back: [...PROPS.mountains, ...PROPS.tallRocks],
        backH: [12, 20],
      };
    case 'castle':
      return {
        ground: '#5f9a48',
        rim: '#8a8478',
        small: [...PROPS.graveyard, ...PROPS.fences, ...PROPS.spooky.filter((k) => /pumpkin|lantern|candle/.test(k))],
        big: [...PROPS.deadTrees, ...PROPS.medievalNature.filter((k) => /tree/.test(k))],
        back: [...PROPS.medieval, ...PROPS.medievalNature.filter((k) => /mountain|hills/.test(k))],
        backH: [9, 15],
      };
    case 'park':
      return {
        ground: '#7ccf5b',
        small: PROPS.park.filter((k) => /flowers|bench|trash/.test(k)).concat(PROPS.plants),
        big: [...PROPS.park.filter((k) => /tree|stall/.test(k)), ...PROPS.trees],
        back: [...PROPS.park.filter((k) => /entrance|station|train/.test(k)), ...PROPS.minigolf.filter((k) => /windmill|castle/.test(k)), ...PROPS.trees],
        backH: [8, 13],
      };
    case 'city':
      return {
        ground: '#8d8aa0',
        rim: '#6e6a80',
        small: [...PROPS.street, ...PROPS.plants.slice(0, 4)],
        big: [...PROPS.cars, ...PROPS.trees.slice(0, 5)],
        back: PROPS.buildings,
        backH: [12, 22],
      };
    default:
      return {
        ground: '#7ccf5b',
        rim: '#f2d58b',
        small: [...PROPS.plants, ...PROPS.beach.filter(noItems), ...PROPS.sandRocks],
        big: [...PROPS.palms, ...PROPS.trees],
        back: [...PROPS.palms, ...PROPS.trees, ...PROPS.tallRocks],
        backH: [8, 13],
      };
  }
}

/**
 * Monta o cenário à volta de uma zona de jogo de raio `radius` (centrada em `center`).
 * `water` = há água à volta da zona de jogo: o chão começa um pouco mais longe (deixa ver a água).
 */
export function themeScenery(
  scene: THREE.Scene,
  rng: Rng,
  theme: Theme | undefined,
  radius: number,
  opts: { center?: THREE.Vector3; water?: boolean; count?: number; behind?: boolean } = {},
): void {
  const lk = look(theme ?? 'island');
  const c = opts.center ?? new THREE.Vector3();
  const inner = radius + (opts.water ? 3 : 0.5);
  // Chão (anel) debaixo de todo o cenário: nada fica a flutuar.
  const ground = new THREE.Mesh(new THREE.RingGeometry(inner, radius + 40, 72, 1), new THREE.MeshToonMaterial({ color: lk.ground }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(c.x, -0.02, c.z);
  ground.receiveShadow = true;
  scene.add(ground);
  if (lk.rim) {
    const rim = new THREE.Mesh(new THREE.RingGeometry(inner, inner + 2.2, 72, 1), new THREE.MeshToonMaterial({ color: lk.rim }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(c.x, -0.01, c.z);
    rim.receiveShadow = true;
    scene.add(rim);
  }
  const place = (keys: readonly string[], n: number, r0: number, r1: number, h: [number, number]) => {
    for (let i = 0; i < n; i++) {
      // `behind`: só atrás e dos lados (a câmara está à frente, em +Z, e não pode ficar tapada).
      const a = opts.behind ? Math.PI * 0.92 + (i / n) * Math.PI * 1.16 + rng.next() * 0.1 : (i / n) * Math.PI * 2 + rng.next() * 0.3;
      const o = pickProp(keys, rng.next(), { height: h[0] + rng.next() * (h[1] - h[0]) });
      if (!o) continue;
      const r = r0 + rng.next() * (r1 - r0);
      o.position.set(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r);
      o.rotation.y = rng.next() * Math.PI * 2;
      scene.add(o);
    }
  };
  const count = opts.count ?? 24;
  place(lk.small, count, inner + 0.5, inner + 3.5, [0.7, 1.6]);
  place(lk.big, Math.round(count * 0.8), inner + 5, inner + 11, [4, 7.5]);
  // Fundo fechado: muitas coisas altas lá atrás.
  place(lk.back, 30, inner + 16, inner + 24, lk.backH);
}

/** Cor do chão do tema (para minijogos que fazem o seu próprio chão). */
export function themeGround(theme: Theme | undefined): string {
  return look(theme ?? 'island').ground;
}

/** Água do minijogo com o tema: no vulcão passa a lava. */
export function themeWater(water: THREE.Mesh, theme: Theme | undefined): void {
  if (theme !== 'volcano') return;
  const m = water.material as THREE.MeshStandardMaterial;
  m.color.set('#ff5a1f');
  m.emissive = new THREE.Color('#b32400');
}

/**
 * Compatibilidade: o anel de cenário antigo. Com `theme`, usa o cenário do tema;
 * sem tema, é o da ilha.
 */
export function ringDecor(scene: THREE.Scene, rng: Rng, radius: number, count = 26, opts: { props?: readonly string[]; trees?: readonly string[]; ground?: string; theme?: Theme } = {}): void {
  if (opts.props || opts.trees) {
    // Cenário escolhido pelo minijogo (ex.: só pinheiros e pedras na neve).
    const trees = opts.trees ?? PROPS.trees;
    const props = opts.props ?? PROPS.plants;
    const ground = new THREE.Mesh(new THREE.RingGeometry(radius - 1, radius + 40, 64), new THREE.MeshToonMaterial({ color: opts.ground ?? '#f4f8ff' }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng.next() * 0.2;
      const big = i % 2 === 0;
      const o = big ? pickProp(trees, rng.next(), { height: 5 + rng.next() * 3 }) : pickProp(props, rng.next(), { height: 0.9 + rng.next() * 1 });
      if (!o) continue;
      const r = radius + (big ? 4 + rng.next() * 6 : rng.next() * 3);
      o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      o.rotation.y = rng.next() * Math.PI * 2;
      scene.add(o);
    }
    return;
  }
  themeScenery(scene, rng, opts.theme, radius - 1, { count, water: !!opts.ground });
}

/**
 * Bandeirinhas a sério: uma corda com barriga entre dois pontos (os mastros) e triângulos de pano
 * pendurados nela. Devolve os triângulos para se abanarem com `swayBunting`.
 */
export function bunting(
  scene: THREE.Scene,
  a: THREE.Vector3,
  b: THREE.Vector3,
  opts: { sag?: number; gap?: number; size?: number; colors?: readonly string[] } = {},
): THREE.Mesh[] {
  const sag = opts.sag ?? 0.9;
  const size = opts.size ?? 0.45;
  const colors = opts.colors ?? ['#ff3b5c', '#ffd23f', '#2f7dff', '#3fbf5f', '#ff8a2a', '#b15cff'];
  const at = (k: number) => new THREE.Vector3().lerpVectors(a, b, k).add(new THREE.Vector3(0, -sag * 4 * k * (1 - k), 0));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) pts.push(at(i / 40));
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.018, 4), new THREE.MeshToonMaterial({ color: '#3a2a1a' }));
  scene.add(rope);
  const tri = new THREE.Shape();
  tri.moveTo(-size / 2, 0);
  tri.lineTo(size / 2, 0);
  tri.lineTo(0, -size);
  tri.closePath();
  const geo = new THREE.ShapeGeometry(tri);
  const len = a.distanceTo(b);
  const n = Math.max(2, Math.floor(len / (opts.gap ?? 0.62)));
  const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
  const out: THREE.Mesh[] = [];
  for (let i = 1; i < n; i++) {
    const k = i / n;
    const p = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: colors[(i - 1) % colors.length]!, side: THREE.DoubleSide }));
    p.position.copy(at(k));
    // O pano fica no plano da corda e baloiça à volta dela.
    p.rotation.order = 'YXZ';
    p.rotation.y = yaw;
    p.castShadow = true;
    scene.add(p);
    out.push(p);
  }
  return out;
}

/** Abana as bandeirinhas com o vento. */
export function swayBunting(pennants: readonly THREE.Mesh[], time: number): void {
  pennants.forEach((p, i) => (p.rotation.x = Math.sin(time * 2.2 + i * 0.7) * 0.35));
}
