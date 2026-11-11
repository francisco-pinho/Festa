import type { SportDef } from '../types';
import { BoxingStage } from './BoxingStage';

const Boxing: SportDef = {
  id: 'boxing',
  order: 4,
  name: 'Boxe',
  emoji: '🥊',
  description: 'Rei do ringue: quem ganha fica para o próximo combate.',
  howTo: '🕹️ mover · Ⓐ soco (alterna jab e direto) · Ⓧ gancho · Ⓨ uppercut · Ⓑ defende · Ⓑ + ◀▶ esquiva',
  narration: [
    'Boxe! Rei do ringue: quem ganha fica para lutar com o próximo.',
    'Mexe-te com o joystick. O botão A dá socos, alternando o jab e o direto. O X é um gancho e o Y um uppercut.',
    'Segura o B para te defenderes; com o B e o joystick para um lado, esquivas. Depois de uma esquiva, o contra-ataque dói mais!',
    'Os socos com a barra amarela cheia são muito mais fortes. Três quedas e é K.O.!',
  ],
  seatCount: (humans) => Math.max(2, humans),
  create: (ctx) => new BoxingStage(ctx),
};

export default Boxing;
