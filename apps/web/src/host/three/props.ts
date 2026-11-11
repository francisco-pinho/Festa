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
const N = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}_${i + 1}`);

/** Modelos mais detalhados da Quaternius (MegaKits, CC0): natureza, cidade, aldeia medieval e adereços. */
const Q = {
  trees: K('q-nature', [...N('CommonTree', 5), ...N('Pine', 5)]),
  twisted: K('q-nature', N('TwistedTree', 5)),
  dead: K('q-nature', N('DeadTree', 5)),
  rocks: K('q-nature', N('Rock_Medium', 3)),
  plants: K('q-nature', ['Bush_Common', 'Bush_Common_Flowers', 'Fern_1', 'Plant_1', 'Plant_1_Big', 'Plant_7_Big', 'Flower_3_Group', 'Flower_4_Group', 'Grass_Common_Tall', 'Grass_Wispy_Tall', 'Clover_1', 'Mushroom_Common', 'Mushroom_Laetiporus']),
  pebbles: K('q-nature', [...N('Pebble_Round', 5), 'RockPath_Round_Wide', 'RockPath_Square_Wide']),
  buildings: K('q-city', ['Building_Large_2', 'Building_Medium_2_001', 'Building_Small_1']),
  street: K('q-city', ['Prop_ACUnit', 'Prop_Bollard', 'Prop_Planter_Single', 'Sidewalk_Planter']),
  fences: K('q-medieval', ['Prop_WoodenFence_Single', 'Prop_WoodenFence_Extension1', 'Prop_MetalFence_Ornament', 'Prop_MetalFence_Simple']),
  village: K('q-medieval', ['Prop_Wagon', 'Prop_Crate', 'Prop_Chimney', 'Prop_Brick1', 'Prop_Brick2', ...['Prop_Vine1', 'Prop_Vine2', 'Prop_Vine4', 'Prop_Vine5']]),
  props: K('q-props', ['Barrel', 'Barrel_Apples', 'Crate_Wooden', 'Crate_Metal', 'Chest_Wood', 'Stall_Empty', 'Stall_Cart_Empty', 'Banner_1', 'Banner_2', 'Torch_Metal', 'Bench', 'FarmCrate_Apple', 'FarmCrate_Carrot', 'Cauldron', 'Anvil', 'Workbench', 'Table_Large', 'WeaponStand', 'Vase_2', 'Vase_4', 'Pot_1', 'Bucket_Wooden_1', 'CandleStick_Stand', 'Bookcase_2', 'Dummy', 'Coin_Pile']),
};

export const PROPS = {
  palms: K('kenney-pirate', ['palm-bend', 'palm-straight', 'palm-detailed-bend', 'palm-detailed-straight']),
  sandRocks: K('kenney-pirate', ['rocks-sand-a', 'rocks-sand-b', 'rocks-sand-c']),
  beach: K('kenney-pirate', ['patch-sand-foliage', 'grass-plant', 'barrel', 'chest', 'crate', 'boat-row-small']),
  ships: K('kenney-pirate', ['ship-pirate-medium', 'ship-wreck', 'ship-small']),
  pirateBits: K('kenney-pirate', ['structure-platform-dock', 'structure-platform-dock-small', 'flag-pirate-high', 'tower-watch', 'cannon', 'rocks-a', 'rocks-b', 'rocks-c']),
  trees: Q.trees,
  treesFall: Q.twisted,
  rocks: Q.rocks,
  tallRocks: K('kenney-nature', ['rock_tallA', 'rock_tallB', 'rock_tallC', 'stone_tallA']),
  plants: Q.plants,
  pebbles: Q.pebbles,
  natureBits: K('kenney-nature', ['log', 'stump_round', 'campfire_stones', 'canoe', 'lily_large', 'statue_obelisk', 'statue_column', 'fence_simple', 'tent_detailedOpen']),
  buildings: Q.buildings,
  cars: K('kaykit-city', ['car_hatchback', 'car_police', 'car_sedan', 'car_stationwagon', 'car_taxi']),
  street: [...K('kaykit-city', ['bench', 'dumpster', 'firehydrant', 'streetlight', 'trafficlight_A', 'trash_A']), ...Q.street],
  graveyard: K('kaykit-halloween', ['gravestone', 'grave_A', 'gravemarker_A', 'gravemarker_B']),
  deadTrees: Q.dead,
  spooky: K('kaykit-halloween', ['fence', 'fence_pillar', 'fence_gate', 'lantern_standing', 'post_lantern', 'pumpkin_orange_jackolantern', 'pumpkin_orange', 'crypt', 'arch', 'arch_gate', 'coffin', 'skull_candle', 'candle_triple', 'shrine_candles', 'bone_A', 'ribcage', 'tree_pine_orange_large']),
  medieval: K('kaykit-medieval', ['building_castle_red', 'building_tower_A_red', 'building_tower_B_red', 'wall_straight', 'wall_corner_A_outside', 'building_mine_red', 'building_windmill_yellow', 'building_tavern_blue']),
  mountains: K('kaykit-medieval', ['mountain_A', 'mountain_B', 'mountain_C']),
  medievalNature: K('kaykit-medieval', ['mountain_A_grass_trees', 'hills_A_trees', 'rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E', 'trees_A_large', 'trees_B_large', 'tree_single_A']),
  camp: [...K('kaykit-medieval', ['tent', 'resource_stone', 'flag_red']), ...K('q-props', ['Barrel', 'Crate_Wooden', 'Anvil', 'Workbench', 'Bucket_Wooden_1', 'Torch_Metal']), 'q-medieval/Prop_Wagon'],
  fences: Q.fences,
  village: Q.village,
  fantasyProps: Q.props,
  furniture: K('kaykit-furniture', ['couch', 'couch_pillows', 'armchair', 'table_low', 'table_medium', 'lamp_standing', 'cactus_medium_A', 'pictureframe_large_A', 'rug_rectangle_stripes_A', 'shelf_B_large_decorated']),
  food: K('kaykit-restaurant', ['table_round_A_decorated', 'chair_A', 'crate_buns', 'crate_tomatoes', 'food_burger']),
  park: K('kenney-coaster', ['stall-food', 'stall-drinks', 'stall-information', 'stall-toilets', 'park-entrance', 'ride-entrance', 'tree', 'tree-large', 'flowers', 'bench', 'trash', 'train-monorail', 'train-log-flume', 'station']),
  minigolf: K('kenney-minigolf', ['windmill', 'castle', 'structure-windmill', 'flag-red', 'flag-blue', 'flag-large-red']),
} as const;

/** Objetos interativos usados em todos os tabuleiros (baú do tesouro, canhão). */
const BOARD_COMMON = ['kenney-pirate/chest', 'kenney-pirate/cannon'];

/** Cenário comum dos minijogos (árvores, tendas, barris…). */
export const MINIGAME_PROPS: readonly string[] = [
  ...PROPS.fantasyProps,
  ...PROPS.fences,
  ...PROPS.rocks,
  ...PROPS.trees,
  ...PROPS.plants,
  'kaykit-medieval/tent',
  'kaykit-medieval/barrel',
  'kaykit-medieval/crate_A_big',
  'kaykit-medieval/flag_red',
  'kenney-nature/tent_detailedOpen',
  'kenney-pirate/barrel',
  'kenney-pirate/crate',
];

/** Que modelos cada tema/desporto precisa. */
export const THEME_PROPS: Record<string, readonly string[]> = {
  island: [...PROPS.palms, ...PROPS.sandRocks, ...PROPS.beach, ...PROPS.ships, ...PROPS.pirateBits, ...PROPS.plants, ...PROPS.rocks, ...PROPS.pebbles, ...PROPS.trees, ...PROPS.fantasyProps],
  city: [...BOARD_COMMON, ...PROPS.buildings, ...PROPS.cars, ...PROPS.street, ...PROPS.trees.slice(0, 5), ...PROPS.plants.slice(0, 2)],
  volcano: [...BOARD_COMMON, ...PROPS.tallRocks, ...PROPS.rocks, ...PROPS.mountains, ...PROPS.camp, ...PROPS.deadTrees, ...PROPS.pebbles, ...PROPS.fences, 'kaykit-medieval/building_mine_red'],
  castle: [...BOARD_COMMON, ...PROPS.graveyard, ...PROPS.deadTrees, ...PROPS.spooky, ...PROPS.medieval, ...PROPS.medievalNature, ...PROPS.fences, ...PROPS.village, ...PROPS.fantasyProps],
  park: [...BOARD_COMMON, ...PROPS.park, ...PROPS.minigolf, ...PROPS.food, ...PROPS.trees, ...PROPS.plants, ...PROPS.fantasyProps, 'kaykit-city/streetlight'],
  golf: [...PROPS.trees, ...PROPS.treesFall, ...PROPS.plants, ...PROPS.rocks, ...PROPS.pebbles, ...PROPS.natureBits, ...PROPS.medievalNature],
  bowling: [...PROPS.furniture, ...PROPS.food],
  tennis: [...PROPS.trees, ...PROPS.street, ...PROPS.plants],
  baseball: [...PROPS.trees, ...PROPS.street, ...PROPS.food],
  boxing: [],
};
