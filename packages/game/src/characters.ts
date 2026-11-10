/**
 * Personagens originais do Festa. O aspeto 3D é construído em código
 * (apps/web/src/host/three/CharacterModel.ts) a partir destes dados.
 */
export type Accessory =
  | 'leaf'
  | 'bunnyEars'
  | 'catEars'
  | 'antenna'
  | 'horns'
  | 'propeller'
  | 'crown'
  | 'mohawk'
  | 'beanie'
  | 'flower';

export type BodyShape = 'round' | 'tall' | 'chubby';

export interface CharacterDef {
  id: string;
  name: string;
  /** Cor principal (corpo). */
  color: string;
  /** Cor secundária (barriga, acessório). */
  accent: string;
  accessory: Accessory;
  body: BodyShape;
}

export const CHARACTERS: readonly CharacterDef[] = [
  { id: 'bolota', name: 'Bolota', color: '#c8814a', accent: '#f3d9b1', accessory: 'leaf', body: 'chubby' },
  { id: 'faisca', name: 'Faísca', color: '#ffd23f', accent: '#fff4c2', accessory: 'antenna', body: 'round' },
  { id: 'coral', name: 'Coral', color: '#ff6f61', accent: '#ffd6cf', accessory: 'flower', body: 'round' },
  { id: 'trovao', name: 'Trovão', color: '#5468ff', accent: '#c9d0ff', accessory: 'mohawk', body: 'tall' },
  { id: 'musgo', name: 'Musgo', color: '#4caf50', accent: '#d4f5d0', accessory: 'horns', body: 'chubby' },
  { id: 'pipoca', name: 'Pipoca', color: '#fff1e0', accent: '#ff9f43', accessory: 'bunnyEars', body: 'round' },
  { id: 'nuvem', name: 'Nuvem', color: '#8fd3ff', accent: '#ffffff', accessory: 'propeller', body: 'round' },
  { id: 'ameixa', name: 'Ameixa', color: '#9b5de5', accent: '#e9d8ff', accessory: 'crown', body: 'tall' },
  { id: 'brasa', name: 'Brasa', color: '#ff7b00', accent: '#ffe0b8', accessory: 'catEars', body: 'tall' },
  { id: 'gelado', name: 'Gelado', color: '#ff8fc7', accent: '#fff0f7', accessory: 'beanie', body: 'chubby' },
];

export function getCharacter(id: string): CharacterDef {
  const c = CHARACTERS.find((ch) => ch.id === id);
  if (!c) throw new Error(`Personagem desconhecida: ${id}`);
  return c;
}
