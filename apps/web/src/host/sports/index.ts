import type { SportDef } from './types';

/**
 * Desportos disponíveis, descobertos automaticamente: cada desporto vive na sua
 * pasta (`sports/<id>/sport.ts`) e exporta por omissão um `SportDef`.
 * Assim cada desporto pode ser desenvolvido no seu ramo sem conflitos.
 */
const modules = import.meta.glob<{ default: SportDef }>('./*/sport.ts', { eager: true });

export const SPORTS: SportDef[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.order - b.order);
