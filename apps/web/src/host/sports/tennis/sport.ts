import type { SportDef } from '../types';
import { TennisStage } from './TennisStage';

const Tennis: SportDef = {
  id: 'tennis',
  order: 2,
  name: 'Ténis',
  emoji: '🎾',
  description: 'Pares, 2 contra 2 num estádio. As personagens correm sozinhas — tu só bates!',
  howTo: 'Raquetada quando a bola chega · cedo = cruzada, tarde = paralela · de baixo para cima = topspin, de cima para baixo = slice · bola alta = smash',
  seatCount: () => 4,
  create: (ctx) => new TennisStage(ctx),
};

export default Tennis;
