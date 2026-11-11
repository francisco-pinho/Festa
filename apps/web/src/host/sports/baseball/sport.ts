import type { SportDef } from '../types';
import { BaseballStage } from './BaseballStage';

const Baseball: SportDef = {
  id: 'baseball',
  order: 5,
  name: 'Basebol',
  emoji: '⚾',
  description: 'Duas equipas, 3 entradas. Lança, bate e faz home runs!',
  howTo: 'Lançador: 🕹️ zona, X muda o lançamento, segura A e lança · Batedor: 🕹️ altura do bastão e bate de lado com o telemóvel',
  narration: [
    'Basebol! Duas equipas, três entradas.',
    'Quem lança aponta a zona com o joystick, muda o tipo de lançamento com o X e lança com o braço, a segurar o A.',
    'Quem bate escolhe a altura do bastão com o joystick e faz o gesto de lado quando a bola chegar.',
    'Bastão por baixo da bola dá bolas altas, por cima dá rasteiras. Três eliminados e trocam as equipas!',
  ],
  seatCount: (humans) => Math.max(2, humans % 2 === 0 ? humans : humans + 1),
  create: (ctx) => new BaseballStage(ctx),
};

export default Baseball;
