/**
 * Retratos das personagens (só a cara) para o placar: cada personagem é desenhada uma vez num
 * pequeno renderizador à parte e guardada como imagem.
 */
import * as THREE from 'three';
import { getCharacter } from '@festa/game';
import { CharacterModel } from './CharacterModel';

const SIZE = 128;
const cache = new Map<string, string>();
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20);

/** Imagem (data URL) com a cara da personagem; '' se os modelos ainda não estiverem carregados. */
export function portrait(characterId: string): string {
  const hit = cache.get(characterId);
  if (hit !== undefined) return hit;
  let url = '';
  try {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(SIZE, SIZE, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#ffffff', '#6a4fa0', 2.3));
      const key = new THREE.DirectionalLight('#fff3dc', 2.2);
      key.position.set(1.5, 3, 4);
      scene.add(key);
    }
    const model = new CharacterModel(getCharacter(characterId));
    model.faceYaw(0.3, true);
    scene!.add(model.root);
    model.update(0);
    model.root.updateMatrixWorld(true);
    const head = model.headPosition();
    // A cabeça destes bonecos é grande: enquadra-a com um pouco de margem, ligeiramente de cima.
    camera.position.set(head.x + 0.12, head.y + 0.25, head.z + 2.3);
    camera.lookAt(head.x, head.y + 0.18, head.z);
    renderer.render(scene!, camera);
    url = renderer.domElement.toDataURL('image/png');
    scene!.remove(model.root);
    model.dispose();
  } catch {
    return '';
  }
  cache.set(characterId, url);
  return url;
}

const small = new Map<string, string>();

/**
 * Cara pequena (80 px, JPEG, fundo da cor da personagem) para mandar para o telemóvel: leve o
 * suficiente para ir numa mensagem. '' se ainda não der para desenhar.
 */
export function portraitSmall(characterId: string): string {
  const hit = small.get(characterId);
  if (hit) return hit;
  const png = portrait(characterId);
  if (!png || !renderer) return '';
  // O último desenho do renderizador é esta personagem só se acabou de ser desenhada; desenha de novo.
  cache.delete(characterId);
  portrait(characterId);
  const c = document.createElement('canvas');
  c.width = c.height = 80;
  const ctx = c.getContext('2d')!;
  const col = new THREE.Color(getCharacter(characterId).color).lerp(new THREE.Color('#ffffff'), 0.35);
  ctx.fillStyle = `#${col.getHexString()}`;
  ctx.fillRect(0, 0, 80, 80);
  ctx.drawImage(renderer.domElement, 0, 0, 80, 80);
  const url = c.toDataURL('image/jpeg', 0.8);
  small.set(characterId, url);
  return url;
}
