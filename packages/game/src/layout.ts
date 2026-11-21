/**
 * Mapas desenhados no Blender: o tabuleiro passa a ser uma lista de casas com nome (`casa_12`),
 * posição 3D e ligações por nome, mais as regras do mapa (lojas, portões, túneis…) também a
 * apontar para casas pelo nome. Assim as casas podem mudar de sítio ou ser acrescentadas no
 * Blender sem partir as regras. Ver docs/BLENDER-MAPAS.md e tools/mapa-blender.ts.
 */
import { createRng } from './rng';
import type { Board, Space, SpaceType } from './board';

export interface LayoutSpace {
  name: string;
  x: number;
  y: number;
  z: number;
  /** Sem tipo: o jogo escolhe ao calhas (azul, vermelha, sorte…). */
  type?: SpaceType;
  next: string[];
  zone?: string;
  star?: boolean;
  shopId?: string;
}

/** O tabuleiro sem as casas, com as referências a casas trocadas pelos nomes. */
export type LayoutRules = Record<string, unknown> & { startId: string };

export interface MapLayout {
  rules: LayoutRules;
  spaces: LayoutSpace[];
}

/** Campos das regras que apontam para casas (um número ou uma lista de números). */
const REF_KEYS = new Set(['spaceId', 'from', 'to', 'startId']);
const REF_LIST_KEYS = new Set(['targets', 'wheel']);

function mapRefs(value: unknown, ref: (v: unknown) => unknown, key = ''): unknown {
  if (REF_KEYS.has(key)) return ref(value);
  if (REF_LIST_KEYS.has(key) && Array.isArray(value)) return value.map(ref);
  if (Array.isArray(value)) return value.map((v) => mapRefs(v, ref));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapRefs(v, ref, k)]));
  return value;
}

export const spaceName = (id: number) => `casa_${id}`;

/** Tabuleiro → mapa para o Blender (todas as casas com tipo, para nada mudar ao voltar). */
export function boardToLayout(board: Board): MapLayout {
  const { spaces, ...rest } = board;
  return {
    rules: mapRefs(rest, (v) => spaceName(v as number)) as LayoutRules,
    spaces: spaces.map((s) => ({
      name: spaceName(s.id),
      x: s.x,
      y: s.y ?? 0,
      z: s.z,
      type: s.type,
      next: s.next.map(spaceName),
      ...(s.zone ? { zone: s.zone } : {}),
      ...(s.starCandidate ? { star: true } : {}),
      ...(s.shopId ? { shopId: s.shopId } : {}),
    })),
  };
}

const AUTO_TYPES: [SpaceType, number][] = [
  ['blue', 58],
  ['red', 16],
  ['lucky', 10],
  ['unlucky', 7],
  ['event', 9],
];

/** Mapa do Blender → tabuleiro. Falha com uma mensagem clara se uma casa apontar para outra que não existe. */
export function boardFromLayout(layout: MapLayout): Board {
  const ids = new Map(layout.spaces.map((s, i) => [s.name, i]));
  const idOf = (name: unknown): number => {
    const id = ids.get(String(name));
    if (id === undefined) throw new Error(`Mapa do Blender: a casa «${String(name)}» não existe`);
    return id;
  };
  const rng = createRng(20261121);
  const spaces: Space[] = layout.spaces.map((s, i) => {
    let type = s.type;
    if (!type) {
      let r = rng.next() * 100;
      type = AUTO_TYPES.find(([, w]) => (r -= w) <= 0)?.[0] ?? 'blue';
    }
    return {
      id: i,
      type,
      x: s.x,
      z: s.z,
      ...(s.y ? { y: s.y } : {}),
      next: s.next.map(idOf),
      starCandidate: !!s.star,
      ...(s.zone ? { zone: s.zone } : {}),
      ...(s.shopId ? { shopId: s.shopId } : {}),
    };
  });
  // Sem nenhuma candidata a estrela marcada no Blender: uma em cada duas casas azuis.
  if (!spaces.some((s) => s.starCandidate)) for (const s of spaces) if (s.type === 'blue' && s.id % 2 === 0) s.starCandidate = true;
  return { ...(mapRefs(layout.rules, idOf) as Omit<Board, 'spaces'>), spaces };
}
