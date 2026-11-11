/**
 * Modelos de cenário (packs CC0 da KayKit e da Kenney, ver docs/ASSETS.md).
 *
 *   await loadProps(THEME_PROPS.island);       // antes de montar o cenário
 *   const palm = prop('kenney-pirate/palm-bend', { height: 6 });
 *
 * Cada modelo é normalizado: assenta no chão (y = 0), centrado em x/z, e com a altura pedida.
 * Se um modelo não estiver carregado, `prop` devolve null e o cenário usa a versão feita à mão.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

interface PropAsset {
  scene: THREE.Object3D;
  size: THREE.Vector3;
  center: THREE.Vector3;
  min: THREE.Vector3;
}

const assets = new Map<string, PropAsset>();
const loading = new Map<string, Promise<void>>();
const loader = new GLTFLoader();

function url(key: string): string {
  const [pack, name] = key.split('/') as [string, string];
  return `/models/${pack}/${name}.${pack.startsWith('kenney') ? 'glb' : 'gltf'}`;
}

/** Carrega modelos (os que já estiverem carregados não voltam a carregar). Falhas não param o jogo. */
export function loadProps(keys: readonly string[]): Promise<void> {
  return Promise.all(
    keys.map((key) => {
      let p = loading.get(key);
      if (!p) {
        p = loader
          .loadAsync(url(key))
          .then((gltf) => {
            const scene = gltf.scene;
            scene.traverse((o) => {
              const m = o as THREE.Mesh;
              if (m.isMesh) {
                m.castShadow = true;
                m.receiveShadow = true;
              }
            });
            const box = new THREE.Box3().setFromObject(scene);
            assets.set(key, { scene, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()), min: box.min.clone() });
          })
          .catch((err) => console.warn(`Modelo de cenário em falta: ${key}`, err));
        loading.set(key, p);
      }
      return p;
    }),
  ).then(() => undefined);
}

export function hasProp(key: string): boolean {
  return assets.has(key);
}

/**
 * Uma cópia do modelo, assente no chão e centrada. `height` ou `width` (o maior lado em planta)
 * definem o tamanho; sem nenhum, fica com o tamanho original × `scale`.
 */
export function prop(key: string, opts: { height?: number; width?: number; scale?: number } = {}): THREE.Group | null {
  const a = assets.get(key);
  if (!a) return null;
  const inner = a.scene.clone(true);
  let s = opts.scale ?? 1;
  if (opts.height) s = opts.height / Math.max(0.001, a.size.y);
  else if (opts.width) s = opts.width / Math.max(0.001, Math.max(a.size.x, a.size.z));
  inner.scale.setScalar(s);
  inner.position.set(-a.center.x * s, -a.min.y * s, -a.center.z * s);
  const g = new THREE.Group();
  g.add(inner);
  g.userData.prop = key;
  return g;
}

/** Escolhe um dos modelos carregados da lista (ou null se nenhum estiver). */
export function pickProp(keys: readonly string[], r: number, opts: { height?: number; width?: number; scale?: number } = {}): THREE.Group | null {
  const ok = keys.filter(hasProp);
  if (!ok.length) return null;
  return prop(ok[Math.floor(r * ok.length) % ok.length]!, opts);
}

const K = (pack: string, names: string[]) => names.map((n) => `${pack}/${n}`);

export const PROPS = {
  palms: K('kenney-pirate', ['palm-bend', 'palm-straight', 'palm-detailed-bend', 'palm-detailed-straight']),
  sandRocks: K('kenney-pirate', ['rocks-sand-a', 'rocks-sand-b', 'rocks-sand-c']),
  beach: K('kenney-pirate', ['patch-sand-foliage', 'grass-plant', 'barrel', 'chest', 'crate', 'boat-row-small']),
  ships: K('kenney-pirate', ['ship-pirate-medium', 'ship-wreck', 'ship-small']),
  pirateBits: K('kenney-pirate', ['structure-platform-dock', 'structure-platform-dock-small', 'flag-pirate-high', 'tower-watch', 'cannon', 'rocks-a', 'rocks-b', 'rocks-c']),
  trees: K('kenney-nature', ['tree_default', 'tree_oak', 'tree_fat', 'tree_detailed', 'tree_cone', 'tree_small', 'tree_tall', 'tree_pineRoundA', 'tree_pineTallA']),
  treesFall: K('kenney-nature', ['tree_default_fall', 'tree_oak_dark']),
  rocks: K('kenney-nature', ['rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_largeD', 'stone_largeA']),
  tallRocks: K('kenney-nature', ['rock_tallA', 'rock_tallB', 'rock_tallC', 'stone_tallA']),
  plants: K('kenney-nature', ['plant_bush', 'plant_bushLarge', 'plant_bushDetailed', 'flower_redA', 'flower_yellowA', 'flower_purpleA', 'grass_large', 'mushroom_redGroup']),
  natureBits: K('kenney-nature', ['log', 'stump_round', 'campfire_stones', 'canoe', 'lily_large', 'statue_obelisk', 'statue_column', 'fence_simple', 'tent_detailedOpen']),
  buildings: K('kaykit-city', ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H']),
  cars: K('kaykit-city', ['car_hatchback', 'car_police', 'car_sedan', 'car_stationwagon', 'car_taxi']),
  street: K('kaykit-city', ['bench', 'bush', 'dumpster', 'firehydrant', 'streetlight', 'trafficlight_A', 'trash_A', 'watertower', 'box_A']),
  graveyard: K('kaykit-halloween', ['gravestone', 'grave_A', 'gravemarker_A', 'gravemarker_B']),
  deadTrees: K('kaykit-halloween', ['tree_dead_large', 'tree_dead_medium', 'tree_dead_small']),
  spooky: K('kaykit-halloween', ['fence', 'fence_pillar', 'fence_gate', 'lantern_standing', 'post_lantern', 'pumpkin_orange_jackolantern', 'pumpkin_orange', 'crypt', 'arch', 'arch_gate', 'coffin', 'skull_candle', 'candle_triple', 'shrine_candles', 'bone_A', 'ribcage', 'tree_pine_orange_large']),
  medieval: K('kaykit-medieval', ['building_castle_red', 'building_tower_A_red', 'building_tower_B_red', 'wall_straight', 'wall_corner_A_outside', 'building_mine_red', 'building_windmill_yellow', 'building_tavern_blue']),
  mountains: K('kaykit-medieval', ['mountain_A', 'mountain_B', 'mountain_C']),
  medievalNature: K('kaykit-medieval', ['mountain_A_grass_trees', 'hills_A_trees', 'rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E', 'trees_A_large', 'trees_B_large', 'tree_single_A']),
  camp: K('kaykit-medieval', ['barrel', 'crate_A_big', 'tent', 'wheelbarrow', 'resource_stone', 'flag_red']),
  furniture: K('kaykit-furniture', ['couch', 'couch_pillows', 'armchair', 'table_low', 'table_medium', 'lamp_standing', 'cactus_medium_A', 'pictureframe_large_A', 'rug_rectangle_stripes_A', 'shelf_B_large_decorated']),
  food: K('kaykit-restaurant', ['table_round_A_decorated', 'chair_A', 'crate_buns', 'crate_tomatoes', 'food_burger']),
  park: K('kenney-coaster', ['stall-food', 'stall-drinks', 'stall-information', 'stall-toilets', 'park-entrance', 'ride-entrance', 'tree', 'tree-large', 'flowers', 'bench', 'trash', 'train-monorail', 'train-log-flume', 'station']),
  minigolf: K('kenney-minigolf', ['windmill', 'castle', 'structure-windmill', 'flag-red', 'flag-blue', 'flag-large-red']),
} as const;

/** Objetos interativos usados em todos os tabuleiros (baú do tesouro, canhão). */
const BOARD_COMMON = ['kenney-pirate/chest', 'kenney-pirate/cannon'];

/** Que modelos cada tema/desporto precisa. */
export const THEME_PROPS: Record<string, readonly string[]> = {
  island: [...PROPS.palms, ...PROPS.sandRocks, ...PROPS.beach, ...PROPS.ships, ...PROPS.pirateBits, ...PROPS.plants, ...PROPS.rocks],
  city: [...BOARD_COMMON, ...PROPS.buildings, ...PROPS.cars, ...PROPS.street, ...PROPS.trees.slice(0, 3)],
  volcano: [...BOARD_COMMON, ...PROPS.tallRocks, ...PROPS.rocks, ...PROPS.mountains, ...PROPS.camp, ...PROPS.deadTrees, 'kaykit-medieval/building_mine_red'],
  castle: [...BOARD_COMMON, ...PROPS.graveyard, ...PROPS.deadTrees, ...PROPS.spooky, ...PROPS.medieval, ...PROPS.medievalNature],
  park: [...BOARD_COMMON, ...PROPS.park, ...PROPS.minigolf, ...PROPS.food, ...PROPS.trees, ...PROPS.plants, 'kaykit-city/streetlight'],
  golf: [...PROPS.trees, ...PROPS.treesFall, ...PROPS.plants, ...PROPS.rocks, ...PROPS.natureBits, ...PROPS.medievalNature],
  bowling: [...PROPS.furniture, ...PROPS.food],
  tennis: [...PROPS.trees, ...PROPS.street, ...PROPS.plants],
  baseball: [...PROPS.trees, ...PROPS.street, ...PROPS.food],
  boxing: [],
};
