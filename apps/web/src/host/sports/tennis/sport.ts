import type { SportDef } from '../types';
import { TennisStage } from './TennisStage';

const Tennis: SportDef = {
  id: 'tennis',
  order: 2,
  name: 'Ténis',
  emoji: '🎾',
  description: 'Pares, 2 contra 2 num estádio. Corres com o joystick e bates com o telemóvel!',
  howTo: '🕹️ correr · raquetada com o telemóvel quando a bola chega · cedo = cruzada, tarde = paralela · de baixo para cima = topspin, de cima para baixo = slice',
  narration: [
    'Ténis a pares! Corre com o joystick para chegares à bola.',
    'Quando ela chegar perto, faz a raquetada com o telemóvel.',
    'Se bateres cedo, a bola sai cruzada; se bateres tarde, sai paralela.',
    'De baixo para cima dás topspin, de cima para baixo dás slice. Bolas altas viram smash! Ganha a equipa que fizer dois jogos.',
  ],
  seatCount: () => 4,
  create: (ctx) => new TennisStage(ctx),
};

export default Tennis;
