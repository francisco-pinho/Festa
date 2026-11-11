import type { SportDef } from '../types';
import { TennisStage } from './TennisStage';

const Tennis: SportDef = {
  id: 'tennis',
  order: 2,
  name: 'Ténis',
  emoji: '🎾',
  description: 'Pares, 2 contra 2 num estádio. Corres com o joystick e bates com os botões!',
  howTo: '🕹️ correr · Ⓐ batida · Ⓑ slice · Ⓨ forte · joystick para o lado ao bater = direção · cedo = cruzada, tarde = paralela',
  narration: [
    'Ténis a pares! Corre com o joystick para chegares à bola.',
    'Quando ela chegar perto, bate com o A. O B dá um slice, que fica baixo, e o Y é uma pancada forte.',
    'Se bateres cedo, a bola sai cruzada; se bateres tarde, sai paralela. Empurra o joystick para o lado ao bater para escolher a direção.',
    'Bolas altas viram smash! Ganha a equipa que fizer dois jogos.',
  ],
  seatCount: () => 4,
  create: (ctx) => new TennisStage(ctx),
};

export default Tennis;
