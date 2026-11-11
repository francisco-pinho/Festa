import type { SportDef } from '../types';
import { BowlingStage } from './BowlingStage';

const Bowling: SportDef = {
  id: 'bowling',
  order: 1,
  name: 'Bowling',
  emoji: '🎳',
  description: 'Derruba os 10 pinos! Strikes e spares valem bónus.',
  howTo: '🕹️ posição · roda o telemóvel para apontar · segura A e faz o gesto do braço (a bola sai no fim do gesto) · rodar o pulso dá efeito',
  // Sozinho joga contra um bot; com mais gente, só humanos.
  narration: [
    'Bowling! O objetivo é derrubar os dez pinos.',
    'Com o joystick escolhes onde ficas na pista, e rodando o telemóvel apontas para a esquerda ou para a direita.',
    'Depois segura o botão A e faz o gesto do braço, para trás e para a frente, como se lançasses a bola. Não precisas de largar o botão!',
    'Se rodares o pulso no fim, a bola curva. Dez pinos à primeira é strike!',
  ],
  seatCount: (humans) => Math.max(2, humans),
  create: (ctx) => new BowlingStage(ctx),
};

export default Bowling;
