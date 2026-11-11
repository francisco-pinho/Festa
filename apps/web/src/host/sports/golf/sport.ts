import type { SportDef } from '../types';
import { GolfStage } from './GolfStage';

const Golf: SportDef = {
  id: 'golf',
  order: 3,
  name: 'Golfe',
  emoji: '⛳',
  description: 'Buracos com relevo, lagos, bunkers e vento. Menos pancadas ganha!',
  howTo: 'Escolhe o taco · 🕹️ aponta · toca para o medidor e toca para parar (⬆️ topspin / ⬇️ backspin) · com o medidor a andar, 🕹️ dá curva e altura · ou balança o telemóvel',
  seatCount: (humans) => Math.max(2, humans),
  create: (ctx) => new GolfStage(ctx),
};

export default Golf;
