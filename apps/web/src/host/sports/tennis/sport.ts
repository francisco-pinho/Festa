import type { SportDef } from '../types';
import { TennisStage } from './TennisStage';

const Tennis: SportDef = {
  id: 'tennis',
  order: 2,
  name: 'Ténis',
  emoji: '🎾',
  description: 'Pares, 2 contra 2 num estádio. As personagens correm sozinhas — tu só bates!',
  howTo: 'Raquetada com o telemóvel quando a bola chega · cedo = cruzada, tarde = paralela · de baixo para cima = topspin, de cima para baixo = slice',
  narration: [
    'Ténis a pares! As personagens correm sozinhas, tu só tens de bater na bola.',
    'Faz a raquetada com o telemóvel quando a bola chegar ao teu jogador.',
    'Se bateres cedo, a bola sai cruzada; se bateres tarde, sai paralela.',
    'De baixo para cima dás topspin, de cima para baixo dás slice. Bolas altas viram smash! Ganha a equipa que fizer dois jogos.',
  ],
  seatCount: () => 4,
  create: (ctx) => new TennisStage(ctx),
};

export default Tennis;
