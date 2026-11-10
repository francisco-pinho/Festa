import type { SportDef } from '../types';
import { TennisStage } from './TennisStage';

const Tennis: SportDef = {
  id: 'tennis',
  order: 2,
  name: 'Ténis',
  emoji: '🎾',
  description: 'Pares, 2 contra 2. As personagens correm sozinhas — tu só bates!',
  howTo: 'Faz a raquetada quando a bola chega · cedo = cruzada, tarde = para o outro lado · mais força = mais rápida',
  seatCount: () => 4,
  create: (ctx) => new TennisStage(ctx),
};

export default Tennis;
