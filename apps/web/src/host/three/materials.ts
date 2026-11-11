/** Materiais com aspeto "cartoon" (toon shading) partilhados por todo o jogo. */
import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** Rampa de 4 tons (sombra, meia-sombra, meio-tom, luz): cartoon, mas com mais volume. */
function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([95, 150, 205, 255]), 4, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

/** Material toon (partilhado por cor — não alterar o material devolvido). */
export function toon(color: THREE.ColorRepresentation): THREE.MeshToonMaterial {
  const key = new THREE.Color(color).getHexString();
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
    cache.set(key, m);
  }
  return m;
}

/** Material toon novo (para quem precisa de o alterar, ex.: piscar, transparência). */
export function toonUnique(color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

export function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  opts: { cast?: boolean; receive?: boolean } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? false;
  return m;
}

/** Textura desenhada num canvas (texto, símbolos das casas, faces dos dados…). */
export function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

/** Texto 3D que está sempre virado para a câmara. */
export function textSprite(
  text: string,
  opts: { color?: string; stroke?: string; height?: number; bold?: boolean } = {},
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fontPx = 96;
  const font = `${opts.bold === false ? '' : 'bold '}${fontPx}px ${FONT}`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  canvas.width = w;
  canvas.height = fontPx + 40;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = opts.stroke ?? '#1b1033';
  ctx.strokeText(text, w / 2, canvas.height / 2);
  ctx.fillStyle = opts.color ?? '#ffffff';
  ctx.fillText(text, w / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const h = opts.height ?? 1;
  sprite.scale.set((h * canvas.width) / canvas.height, h, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if ([...cache.values()].includes(m as THREE.MeshToonMaterial)) continue;
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
    }
  });
}
