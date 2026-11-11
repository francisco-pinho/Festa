import type { SportDef } from '../types';
import { BoxingStage } from './BoxingStage';

const Boxing: SportDef = {
  id: 'boxing',
  order: 4,
  name: 'Boxe',
  emoji: '🥊',
  description: 'Rei do ringue: quem ganha fica para o próximo combate.',
  howTo: '🕹️ mover · socos com o telemóvel: em frente = direto, de lado = gancho, de baixo para cima = uppercut · B defende · inclinar esquiva',
  narration: [
    'Boxe! Rei do ringue: quem ganha fica para lutar com o próximo.',
    'Mexe-te com o joystick e dá socos com o telemóvel: em frente é um direto, de lado é um gancho, de baixo para cima é um uppercut.',
    'Segura o B para te defenderes e inclina o telemóvel para esquivar. Depois de uma esquiva, o contra-ataque dói mais!',
    'Os socos com a barra amarela cheia são muito mais fortes. Três quedas e é K.O.!',
  ],
  seatCount: (humans) => Math.max(2, humans),
  create: (ctx) => new BoxingStage(ctx),
};

export default Boxing;
