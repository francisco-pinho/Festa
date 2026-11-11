import type { SportDef } from '../types';
import { GolfStage } from './GolfStage';

const Golf: SportDef = {
  id: 'golf',
  order: 3,
  name: 'Golfe',
  emoji: '⛳',
  description: '3 buracos com lagos, bunkers e vento. Menos pancadas ganha!',
  howTo: '🕹️ aponta · tacada com o braço (ou arrasta para cima) · a força decide a distância',
  seatCount: (humans) => Math.max(2, humans),
  create: (ctx) => new GolfStage(ctx),
};

export default Golf;
