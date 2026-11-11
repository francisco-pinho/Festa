/**
 * Modelos 3D das personagens (KayKit Adventurers, CC0 — ver docs/ASSETS.md).
 *
 * São 5 modelos base com o mesmo esqueleto e 76 animações. Cada uma das nossas
 * 10 personagens usa um modelo base com:
 *  - roupa recolorida para a cor da personagem (a pele mantém-se);
 *  - chapéu/capacete do modelo, ou o nosso acessório (orelhas, coroa…);
 *  - sem armas (as mãos ficam livres para raquetes, tacos, bolas…).
 *
 * Carrega-se tudo uma vez no arranque (`loadCharacterAssets`); depois cada
 * personagem é um clone instantâneo.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTERS, type CharacterDef } from '@festa/game';

export type BaseModel = 'Barbarian' | 'Knight' | 'Mage' | 'Rogue' | 'Rogue_Hooded';

export interface CharacterLook {
  base: BaseModel;
  /** Mostrar o chapéu/capacete do modelo base. */
  hat: boolean;
  /** Mostrar o nosso acessório (em `accessories.ts`). */
  accessory: boolean;
}

/** Que modelo base e que extras cada personagem usa. */
export const LOOKS: Record<string, CharacterLook> = {
  bolota: { base: 'Barbarian', hat: false, accessory: true },
  faisca: { base: 'Mage', hat: true, accessory: false },
  coral: { base: 'Rogue', hat: false, accessory: true },
  trovao: { base: 'Knight', hat: true, accessory: false },
  musgo: { base: 'Barbarian', hat: true, accessory: false },
  pipoca: { base: 'Rogue_Hooded', hat: false, accessory: true },
  nuvem: { base: 'Mage', hat: false, accessory: true },
  ameixa: { base: 'Knight', hat: false, accessory: true },
  brasa: { base: 'Rogue', hat: false, accessory: true },
  gelado: { base: 'Rogue_Hooded', hat: false, accessory: false },
  narrador: { base: 'Rogue', hat: false, accessory: false },
};

/** O narrador (apresentador): não é jogável; fato roxo e laço dourado. */
export const NARRATOR: CharacterDef = { id: 'narrador', name: 'Zé Microfone', color: '#6a3fb5', accent: '#ffd23f', accessory: 'crown', body: 'round' };

export interface BaseAsset {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
  /** Imagem original da textura (paleta), para recolorir. */
  image: CanvasImageSource & { width: number; height: number };
  /** Altura do modelo (pose de repouso), para normalizar a escala. */
  height: number;
}

const assets = new Map<BaseModel, BaseAsset>();
const textures = new Map<string, THREE.Texture>();
let loading: Promise<void> | null = null;

export function loadCharacterAssets(onProgress?: (done: number, total: number) => void): Promise<void> {
  loading ??= (async () => {
    const loader = new GLTFLoader();
    const bases = [...new Set(Object.values(LOOKS).map((l) => l.base))];
    let done = 0;
    await Promise.all(
      bases.map(async (base) => {
        const gltf = await loader.loadAsync(`/models/kaykit/${base}.glb`);
        const scene = gltf.scene;
        let image: BaseAsset['image'] | null = null;
        scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat.map?.image && !image) image = mat.map.image as BaseAsset['image'];
          }
        });
        if (!image) throw new Error(`Modelo ${base} sem textura`);
        scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(scene);
        assets.set(base, {
          scene,
          clips: new Map(gltf.animations.map((c) => [c.name, c])),
          image,
          height: box.max.y - box.min.y,
        });
        onProgress?.(++done, bases.length);
      }),
    );
    // Texturas recoloridas, uma por personagem.
    for (const def of [...CHARACTERS, NARRATOR]) textures.set(def.id, recolorTexture(getAsset(LOOKS[def.id]!.base).image, def));
  })();
  return loading;
}

export function getAsset(base: BaseModel): BaseAsset {
  const a = assets.get(base);
  if (!a) throw new Error(`Modelos ainda não carregados (${base}). Chama loadCharacterAssets() primeiro.`);
  return a;
}

export function getCharacterTexture(id: string): THREE.Texture {
  const t = textures.get(id);
  if (!t) throw new Error(`Textura em falta: ${id}`);
  return t;
}

// ── Recolorir ─────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

/**
 * Pele: tons pêssego claros e saturados (nas texturas KayKit: #f6c09c, #f8ccab, #f2a87e).
 * Mantém-se igual em todas as personagens. O couro castanho (menos claro) não entra.
 */
function isSkin(h: number, s: number, l: number): boolean {
  const deg = h * 360;
  return deg >= 12 && deg <= 38 && s >= 0.5 && l >= 0.66 && l <= 0.9;
}

/**
 * Troca as cores da roupa pela cor da personagem, mantendo pele, cinzentos
 * (metais, brancos) e quase-pretos (olhos, contornos).
 */
function recolorTexture(image: BaseAsset['image'], def: CharacterDef): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;

  const target = new THREE.Color(def.color);
  const accent = new THREE.Color(def.accent);
  const th = { h: 0, s: 0, l: 0 };
  const ah = { h: 0, s: 0, l: 0 };
  target.getHSL(th, THREE.SRGBColorSpace);
  accent.getHSL(ah, THREE.SRGBColorSpace);

  // Tom dominante da roupa original, para rodar todas as cores à volta dele.
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < px.length; i += 4) {
    const [h, s, l] = rgbToHsl(px[i]!, px[i + 1]!, px[i + 2]!);
    if (s < 0.15 || l < 0.12 || isSkin(h, s, l)) continue;
    sumX += Math.cos(h * Math.PI * 2) * s;
    sumY += Math.sin(h * Math.PI * 2) * s;
  }
  const baseHue = (Math.atan2(sumY, sumX) / (Math.PI * 2) + 1) % 1;

  const c = new THREE.Color();
  const rgb = { r: 0, g: 0, b: 0 };
  for (let i = 0; i < px.length; i += 4) {
    const [h, s, l] = rgbToHsl(px[i]!, px[i + 1]!, px[i + 2]!);
    if (s < 0.15 || l < 0.12 || isSkin(h, s, l)) continue;
    // Cores perto do tom dominante → cor principal; as outras → cor de destaque.
    let dh = h - baseHue;
    if (dh > 0.5) dh -= 1;
    if (dh < -0.5) dh += 1;
    const main = Math.abs(dh) < 0.18;
    const ref = main ? th : ah;
    const nh = (ref.h + dh * 0.25 + 1) % 1;
    const ns = Math.min(1, s * 0.4 + ref.s * 0.6);
    const nl = Math.min(0.92, Math.max(0.08, l * 0.55 + ref.l * 0.45));
    c.setHSL(nh, ns, nl, THREE.SRGBColorSpace);
    c.getRGB(rgb, THREE.SRGBColorSpace);
    px[i] = Math.round(rgb.r * 255);
    px[i + 1] = Math.round(rgb.g * 255);
    px[i + 2] = Math.round(rgb.b * 255);
  }
  ctx.putImageData(data, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; // texturas glTF não são invertidas
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; // paleta: cores certas, sem misturas
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
