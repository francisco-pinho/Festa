/**
 * Modelos de cenário (packs grátis da KayKit, CC0 — ver docs/ASSETS.md). Só as palmeiras, os
 * navios, o cais, a torre de vigia e o canhão da ilha são da Kenney (a KayKit não tem nada parecido).
 *
 *   await loadProps(THEME_PROPS.island);       // antes de montar o cenário
 *   const tree = prop('kaykit-forest/Tree_1_A_Color1', { height: 6 });
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

/** Modelos soltos do Sketchfab (a TV da sala), em .glb como os da Kenney. */
const GLB_PACKS = new Set(['crt-tv']);

/** Peças que vêm a mais em alguns modelos e se tiram ao carregar (ex.: uma placa de chão). */
const STRIP: Record<string, string[]> = {};

function url(key: string): string {
  const [pack, name] = key.split('/') as [string, string];
  return `/models/${pack}/${name}.${pack.startsWith('kenney') || GLB_PACKS.has(pack) ? 'glb' : 'gltf'}`;
}

/** Um material do modelo (o primeiro, ou o que tem esse nome), para usar só as texturas (ex.: soalho, paredes). */
export function propMaterial(key: string, name?: string): THREE.MeshStandardMaterial | null {
  let found: THREE.MeshStandardMaterial | null = null;
  assets.get(key)?.scene.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!found && m && !Array.isArray(m) && (!name || m.name === name)) found = m as THREE.MeshStandardMaterial;
  });
  return found;
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
            for (const name of STRIP[key] ?? []) scene.getObjectByName(name)?.removeFromParent();
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
/** Variantes com letra: L('Tree_1', 'ABC', '_Color1') → Tree_1_A_Color1, Tree_1_B_Color1… */
const L = (prefix: string, letters: string, suffix = '') => [...letters].map((c) => `${prefix}_${c}${suffix}`);

/** KayKit Forest Nature Pack: árvores, pinheiros, árvores secas, arbustos, erva e pedras. */
const F = {
  trees: K('kaykit-forest', [...L('Tree_1', 'ABC', '_Color1'), ...L('Tree_3', 'ABC', '_Color1'), ...L('Tree_2', 'ABCDE', '_Color1')]),
  pines: K('kaykit-forest', L('Tree_4', 'ABC', '_Color1')),
  bare: K('kaykit-forest', [...L('Tree_Bare_1', 'ABC', '_Color1'), ...L('Tree_Bare_2', 'ABC', '_Color1')]),
  rocks: K('kaykit-forest', L('Rock_3', 'ABCDEF', '_Color1')),
  sandRocks: K('kaykit-forest', L('Rock_3', 'GHIJKL', '_Color1')),
  tallRocks: K('kaykit-forest', L('Rock_3', 'MNOPQR', '_Color1')),
  pebbles: K('kaykit-forest', [...L('Rock_1', 'ABCDEFG', '_Color1'), ...L('Rock_2', 'ABCD', '_Color1')]),
  plants: K('kaykit-forest', [...L('Bush_1', 'ACEG', '_Color1'), ...L('Bush_2', 'ACE', '_Color1'), ...L('Bush_3', 'ABC', '_Color1'), ...L('Bush_4', 'ACE', '_Color1'), ...L('Grass_1', 'AC', '_Color1'), ...L('Grass_2', 'AC', '_Color1')]),
};

export const PROPS = {
  // Ilha: a KayKit não tem palmeiras nem navios — ficam os da Kenney (Pirate Kit, CC0).
  palms: K('kenney-pirate', ['palm-bend', 'palm-straight', 'palm-detailed-bend', 'palm-detailed-straight']),
  sandRocks: F.sandRocks,
  beach: [
    'kaykit-forest/Bush_3_B_Color1',
    'kaykit-forest/Grass_2_B_Color1',
    'kaykit-dungeon/barrel_large',
    'kaykit-dungeon/chest',
    'kaykit-dungeon/box_large',
    'kenney-pirate/boat-row-small',
    ...K('kaykit-mixed1', ['umbrella_blue', 'umbrella_pink', 'umbrella_yellow', 'umbrella_green']),
  ],
  ships: K('kenney-pirate', ['ship-pirate-medium', 'ship-wreck', 'ship-small']),
  pirateBits: [...K('kenney-pirate', ['structure-platform-dock', 'structure-platform-dock-small', 'flag-pirate-high', 'tower-watch', 'cannon']), ...F.sandRocks.slice(0, 3)],
  trees: F.trees,
  pines: F.pines,
  treesFall: K('kaykit-halloween', ['tree_pine_orange_large', 'tree_pine_orange_medium', 'tree_pine_yellow_large', 'tree_pine_yellow_medium']),
  rocks: F.rocks,
  tallRocks: F.tallRocks,
  plants: [...F.plants, ...K('kaykit-mixed1', ['flax_flower_A', 'flax_flower_B']), ...K('kaykit-medieval', ['waterplant_A', 'waterplant_B'])],
  pebbles: F.pebbles,
  natureBits: [
    ...K('kaykit-resources', ['Wood_Log_A', 'Wood_Log_B', 'Wood_Log_Stack']),
    ...K('kaykit-medieval', ['tree_single_A_cut', 'tree_single_B_cut', 'waterlily_A', 'waterlily_B', 'tent', 'fence_wood_straight']),
    ...K('kaykit-halloween', ['pillar', 'shrine']),
  ],
  buildings: K('kaykit-city', ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H']),
  cars: K('kaykit-city', ['car_hatchback', 'car_police', 'car_sedan', 'car_stationwagon', 'car_taxi']),
  /** Coisas pequenas de rua (sem candeeiros nem semáforos, que são altos). */
  streetSmall: K('kaykit-city', ['bench', 'dumpster', 'firehydrant', 'trash_A', 'trash_B', 'box_A', 'box_B', 'bush']),
  street: K('kaykit-city', ['bench', 'dumpster', 'firehydrant', 'streetlight', 'trafficlight_A', 'trafficlight_B', 'trafficlight_C', 'trash_A', 'trash_B', 'box_A', 'box_B', 'bush']),
  graveyard: K('kaykit-halloween', ['gravestone', 'grave_A', 'grave_B', 'grave_A_destroyed', 'gravemarker_A', 'gravemarker_B']),
  deadTrees: [...F.bare, ...K('kaykit-halloween', ['tree_dead_large', 'tree_dead_medium', 'tree_dead_large_decorated'])],
  spooky: K('kaykit-halloween', [
    'fence', 'fence_broken', 'fence_pillar', 'fence_gate', 'lantern_standing', 'lantern_hanging', 'post_lantern', 'post_skull',
    'pumpkin_orange_jackolantern', 'pumpkin_orange', 'pumpkin_yellow', 'pumpkin_yellow_jackolantern', 'pumpkin_orange_small',
    'crypt', 'arch', 'arch_gate', 'coffin', 'coffin_decorated', 'skull_candle', 'skull', 'candle_triple', 'candle_melted',
    'shrine_candles', 'plaque_candles', 'bone_A', 'bone_B', 'ribcage', 'bench_decorated', 'tree_pine_orange_large',
  ]),
  medieval: K('kaykit-medieval', [
    'building_castle_red', 'building_tower_A_red', 'building_tower_B_red', 'wall_straight', 'wall_corner_A_outside', 'building_mine_red',
    'building_windmill_yellow', 'building_tavern_blue', 'building_church_red', 'building_blacksmith_red', 'building_home_A_red',
    'building_home_B_blue', 'building_well_red', 'building_watermill_red', 'building_tower_catapult_red', 'building_archeryrange_red',
  ]),
  mountains: K('kaykit-medieval', ['mountain_A', 'mountain_B', 'mountain_C']),
  medievalNature: K('kaykit-medieval', ['mountain_A_grass_trees', 'hills_A_trees', 'hills_B_trees', 'rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E', 'trees_A_large', 'trees_B_large', 'tree_single_A', 'tree_single_B']),
  camp: [
    ...K('kaykit-medieval', ['tent', 'resource_stone', 'flag_red', 'wheelbarrow', 'resource_lumber']),
    ...K('kaykit-dungeon', ['barrel_large', 'box_large', 'torch_lit']),
    ...K('kaykit-tools', ['anvil', 'bucket_metal', 'pickaxe', 'grindstone']),
    ...K('kaykit-resources', ['Iron_Nuggets', 'Gold_Nuggets']),
  ],
  fences: [...K('kaykit-medieval', ['fence_wood_straight', 'fence_stone_straight']), ...K('kaykit-halloween', ['fence', 'fence_seperate'])],
  village: [
    ...K('kaykit-medieval', ['wheelbarrow', 'crate_A_big', 'crate_long_A', 'crate_open', 'sack', 'ladder', 'pallet', 'bucket_water', 'weaponrack', 'barrel']),
    ...K('kaykit-resources', ['Wood_Planks_Stack_Medium', 'Textiles_Stack_Small', 'Stone_Bricks_Stack_Small']),
  ],
  fantasyProps: [
    ...K('kaykit-dungeon', [
      'barrel_large', 'barrel_small_stack', 'chest', 'chest_gold', 'box_large', 'box_stacked', 'crates_stacked', 'keg', 'keg_decorated',
      'torch_lit', 'table_long_decorated_A', 'candle_triple', 'coin_stack_large', 'trunk_large_A', 'trunk_medium_B', 'sword_shield', 'column', 'stool',
    ]),
    ...K('kaykit-tools', ['anvil', 'grindstone', 'bucket_metal', 'lantern']),
    ...K('kaykit-medieval', ['weaponrack', 'target', 'sack']),
    ...K('kaykit-prototype', ['target_stand_A', 'target_stand_B']),
    'kaykit-restaurant/pot_A_stew',
  ],
  furniture: K('kaykit-furniture', [
    'couch', 'couch_pillows', 'armchair', 'armchair_pillows', 'table_low', 'table_medium', 'lamp_standing', 'lamp_table', 'cactus_medium_A',
    'cactus_medium_B', 'pictureframe_large_A', 'rug_rectangle_stripes_A', 'rug_oval_A', 'shelf_B_large_decorated', 'cabinet_medium_decorated', 'book_set',
  ]),
  food: K('kaykit-restaurant', ['table_round_A_decorated', 'table_round_A_small_decorated', 'chair_A', 'chair_B', 'crate_buns', 'crate_tomatoes', 'crate_carrots', 'crate_cheese', 'food_burger', 'food_dinner']),
  /** Feira: bancas (mercado medieval, tenda de circo), arcos de entrada, comboio, árvores, bancos. */
  park: [
    ...K('kaykit-medieval', ['building_market_red', 'building_market_blue', 'building_market_yellow', 'building_market_green', 'building_stage_A']),
    'kaykit-mixed1/circus_tent',
    ...K('kaykit-platformer', ['arch_wide_red', 'arch_wide_blue']),
    ...K('kaykit-holiday', ['train_locomotive', 'train_wagon', 'train_tender_presents_A']),
    ...F.trees.slice(0, 6),
    ...K('kaykit-mixed1', ['flax_flower_A', 'flax_flower_B']),
    'kaykit-city/bench',
    'kaykit-city/trash_A',
    'kaykit-halloween/bench',
  ],
  minigolf: [...K('kaykit-medieval', ['building_windmill_yellow', 'building_castle_blue', 'building_windmill_red']), ...K('kaykit-platformer', ['flag_A_red', 'flag_A_blue', 'flag_C_red'])],
  /** Natal / neve. */
  holiday: K('kaykit-holiday', ['christmas_tree_decorated', 'snowman_A', 'snowman_B', 'snowball_pile', 'present_A_red', 'present_B_blue', 'present_C_green', 'lantern_decorated', 'candycane_small']),
} as const;

/** Objetos interativos usados em todos os tabuleiros (baú do tesouro, canhão). */
const BOARD_COMMON = ['kaykit-dungeon/chest_gold', 'kenney-pirate/cannon'];

/** Cenário comum dos minijogos (árvores, tendas, barris…). */
export const MINIGAME_PROPS: readonly string[] = [
  ...PROPS.fantasyProps,
  ...PROPS.fences,
  ...PROPS.rocks,
  ...PROPS.trees,
  ...PROPS.pines,
  ...PROPS.plants,
  ...PROPS.holiday,
  'kaykit-medieval/tent',
  'kaykit-medieval/barrel',
  'kaykit-medieval/crate_A_big',
  'kaykit-medieval/flag_red',
  'kaykit-restaurant/crate_tomatoes',
  'kaykit-city/streetlight',
  'kaykit-halloween/post_lantern',
];

/** Que modelos cada tema/desporto precisa. */
export const THEME_PROPS: Record<string, readonly string[]> = {
  island: [...PROPS.palms, ...PROPS.sandRocks, ...PROPS.beach, ...PROPS.ships, ...PROPS.pirateBits, ...PROPS.plants, ...PROPS.rocks, ...PROPS.pebbles, ...PROPS.trees, ...PROPS.fantasyProps],
  city: [...BOARD_COMMON, ...PROPS.buildings, ...PROPS.cars, ...PROPS.street, ...PROPS.trees.slice(0, 5), ...PROPS.plants.slice(0, 2), 'kaykit-city/watertower'],
  volcano: [...BOARD_COMMON, ...PROPS.tallRocks, ...PROPS.rocks, ...PROPS.mountains, ...PROPS.camp, ...PROPS.deadTrees, ...PROPS.pebbles, ...PROPS.fences, 'kaykit-medieval/building_mine_red'],
  castle: [...BOARD_COMMON, ...PROPS.graveyard, ...PROPS.deadTrees, ...PROPS.spooky, ...PROPS.medieval, ...PROPS.medievalNature, ...PROPS.fences, ...PROPS.village, ...PROPS.fantasyProps],
  park: [...BOARD_COMMON, ...PROPS.park, ...PROPS.minigolf, ...PROPS.food, ...PROPS.trees, ...PROPS.plants, ...PROPS.fantasyProps, 'kaykit-city/streetlight'],
  golf: [...PROPS.trees, ...PROPS.pines, ...PROPS.treesFall,...PROPS.plants, ...PROPS.rocks, ...PROPS.pebbles, ...PROPS.natureBits, ...PROPS.medievalNature],
  bowling: [...PROPS.furniture, ...PROPS.food],
  tennis: [...PROPS.trees, ...PROPS.street, ...PROPS.plants],
  baseball: [...PROPS.trees, ...PROPS.street, ...PROPS.food],
  boxing: [],
};
