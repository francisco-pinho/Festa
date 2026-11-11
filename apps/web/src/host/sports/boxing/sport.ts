import type { SportDef } from '../types';
import { BoxingStage } from './BoxingStage';

const Boxing: SportDef = {
  id: 'boxing',
  order: 4,
  name: 'Boxe',
  emoji: '🥊',
  description: 'Rei do ringue: quem ganha fica para o próximo combate.',
  howTo: '🕹️ mover · socos: tocar = direto, de lado = gancho, para cima = uppercut (ou com o telemóvel) · 🛡️ defender · inclinar ou ⬅️➡️ para esquivar',
  seatCount: (humans) => Math.max(2, humans),
  create: (ctx) => new BoxingStage(ctx),
};

export default Boxing;
