import type { SportDef } from '../types';
import { BoxingStage } from './BoxingStage';

const Boxing: SportDef = {
  id: 'boxing',
  order: 4,
  name: 'Boxe',
  emoji: '🥊',
  description: 'Rei do ringue: quem ganha fica para o próximo combate.',
  howTo: 'Socos com a esquerda (rápido) e a direita (forte) · segura 🛡️ para defender',
  seatCount: (humans) => Math.max(2, humans),
  create: (ctx) => new BoxingStage(ctx),
};

export default Boxing;
