import type { SportDef } from '../types';
import { BaseballStage } from './BaseballStage';

const Baseball: SportDef = {
  id: 'baseball',
  order: 5,
  name: 'Basebol',
  emoji: '⚾',
  description: 'Duas equipas, 3 entradas. Lança, bate e faz home runs!',
  howTo: 'Lançador: gesto (força = velocidade) · Batedor: bate de lado quando a bola chega',
  seatCount: (humans) => Math.max(2, humans % 2 === 0 ? humans : humans + 1),
  create: (ctx) => new BaseballStage(ctx),
};

export default Baseball;
