/**
 * Itens: compram-se nas lojas com moedas e usam-se antes de lançar os dados.
 * Cada jogador leva no máximo `MAX_ITEMS`.
 */
import type { ShopKind } from './board';

export type ItemId =
  | 'turbo'
  | 'dadoExtra'
  | 'dadoDourado'
  | 'dadoLento'
  | 'bilheteLoja'
  | 'espelho'
  | 'ima'
  | 'armadilha'
  | 'luva'
  | 'ladraoEstrela';

export interface ItemDef {
  id: ItemId;
  name: string;
  emoji: string;
  /** Preço base (moedas). */
  price: number;
  description: string;
  /** Precisa de escolher outro jogador. */
  targetsPlayer: boolean;
}

export const MAX_ITEMS = 3;

export const ITEMS: Record<ItemId, ItemDef> = {
  turbo: { id: 'turbo', name: 'Turbo', emoji: '⚡', price: 3, description: '+3 casas neste lançamento', targetsPlayer: false },
  dadoExtra: { id: 'dadoExtra', name: 'Dado Extra', emoji: '🎲', price: 6, description: 'Lanças 3 dados em vez de 2', targetsPlayer: false },
  dadoDourado: { id: 'dadoDourado', name: 'Dado Dourado', emoji: '🪙', price: 8, description: 'Ganhas tantas moedas como o que tirares', targetsPlayer: false },
  dadoLento: { id: 'dadoLento', name: 'Dado Preguiçoso', emoji: '🐌', price: 6, description: 'Na próxima vez, os outros só tiram 1 a 3 em cada dado', targetsPlayer: false },
  bilheteLoja: { id: 'bilheteLoja', name: 'Bilhete da Loja', emoji: '🎟️', price: 5, description: 'Vais direto para a loja mais próxima', targetsPlayer: false },
  espelho: { id: 'espelho', name: 'Espelho Troca-Lugar', emoji: '🪞', price: 8, description: 'Trocas de lugar com quem escolheres', targetsPlayer: true },
  ima: { id: 'ima', name: 'Íman de Moedas', emoji: '🧲', price: 7, description: 'Roubas 5 a 10 moedas a quem escolheres', targetsPlayer: true },
  armadilha: { id: 'armadilha', name: 'Armadilha', emoji: '🪤', price: 6, description: 'Fica na tua casa: quem lá cair dá-te 10 moedas', targetsPlayer: false },
  luva: { id: 'luva', name: 'Luva de Desafio', emoji: '🥊', price: 12, description: 'Desafias quem quiseres para um duelo', targetsPlayer: true },
  ladraoEstrela: { id: 'ladraoEstrela', name: 'Ladrão de Estrelas', emoji: '🦹', price: 40, description: 'Roubas uma estrela a quem escolheres', targetsPlayer: true },
};

/** O que cada tipo de loja vende. */
export const SHOP_STOCK: Record<ShopKind, ItemId[]> = {
  geral: ['turbo', 'dadoExtra', 'bilheteLoja', 'ima', 'armadilha', 'espelho'],
  barata: ['turbo', 'dadoExtra', 'dadoLento', 'armadilha'],
  luxo: ['dadoDourado', 'luva', 'espelho', 'ladraoEstrela'],
  ultimo: ['turbo', 'dadoExtra', 'dadoDourado', 'ima', 'espelho', 'luva'],
};

export const SHOP_LABEL: Record<ShopKind, string> = {
  geral: 'Loja',
  barata: 'Loja barata (-30%)',
  luxo: 'Loja de luxo',
  ultimo: 'Loja do último lugar (-50% e +10 moedas)',
};

/** Bónus para quem está em último ao entrar na loja dele. */
export const LAST_PLACE_GIFT = 10;

const KIND_MULT: Record<ShopKind, number> = { geral: 1, barata: 0.7, luxo: 1.1, ultimo: 0.5 };

/** Preço de um item numa loja (com saldos a metade do preço). */
export function priceFor(item: ItemId, kind: ShopKind, sale: boolean): number {
  return Math.max(1, Math.round(ITEMS[item].price * KIND_MULT[kind] * (sale ? 0.5 : 1)));
}

/** A loja do último lugar só serve quem vai em último. */
export function canUseShop(kind: ShopKind, isLastPlace: boolean): boolean {
  return kind !== 'ultimo' || isLastPlace;
}
