import type { SportDef } from '../types';
import { BowlingStage } from './BowlingStage';

const Bowling: SportDef = {
  id: 'bowling',
  order: 1,
  name: 'Bowling',
  emoji: '🎳',
  description: 'Derruba os 10 pinos! Strikes e spares valem bónus.',
  howTo: '🕹️ posiciona-te · roda o telemóvel para apontar · segura e faz o pêndulo com o braço (ou arrasta para cima) · roda o pulso no fim para curvar',
  // Sozinho joga contra um bot; com mais gente, só humanos.
  seatCount: (humans) => Math.max(2, humans),
  create: (ctx) => new BowlingStage(ctx),
};

export default Bowling;
