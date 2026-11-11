import type { SportDef } from '../types';
import { GolfStage } from './GolfStage';

const Golf: SportDef = {
  id: 'golf',
  order: 3,
  name: 'Golfe',
  emoji: '⛳',
  description: 'Buracos com relevo, lagos, bunkers e vento. Menos pancadas ganha!',
  howTo: '🕹️ aponta · X/Y mudam de taco · A começa o medidor e A pára (X topspin, Y backspin) · com o medidor a andar, 🕹️ dá curva e altura',
  narration: [
    'Golfe! Ganha quem meter a bola no buraco com menos pancadas.',
    'Aponta com o joystick e troca de taco com os botões X e Y. O círculo amarelo mostra onde a bola vai cair.',
    'Carrega em A para começar o medidor e outra vez em A para o parar na força certa. A zona vermelha dá mais força, mas a bola foge.',
    'Se parares com X dás topspin e a bola rola mais; com Y dás backspin e ela trava. Cuidado com a água, os bunkers e o vento!',
  ],
  seatCount: (humans) => Math.max(2, humans),
  create: (ctx) => new GolfStage(ctx),
};

export default Golf;
