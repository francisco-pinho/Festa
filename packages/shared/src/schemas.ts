/**
 * Validação (runtime) de tudo o que chega ao servidor vindo dos clientes.
 * Os tipos TypeScript do protocolo são derivados destes schemas, por isso
 * existe uma única fonte de verdade.
 *
 * Só o servidor importa este ficheiro em runtime; o cliente web importa apenas
 * os tipos (via `import type`), por isso o zod não vai para o bundle do browser.
 */
import { z } from 'zod';
import { ROOM_CODE_LENGTH } from './constants';

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[A-Z]{${ROOM_CODE_LENGTH}}$`));

export const tokenSchema = z.string().min(16).max(128);
export const playerIdSchema = z.string().min(1).max(64);

/** Botões do comando: A/B/X/Y, + (menu), − (mapa) e a cruz direcional. */
export const buttonIdSchema = z.enum(['a', 'b', 'x', 'y', 'plus', 'minus', 'up', 'down', 'left', 'right']);

export const motionActionSchema = z.enum(['throw', 'swing', 'punch', 'pitch', 'bat']);

/** Input enviado pelo telemóvel. */
export const controllerInputSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('stick'),
    x: z.number().min(-1).max(1),
    y: z.number().min(-1).max(1),
  }),
  z.object({
    t: z.literal('button'),
    button: buttonIdSchema,
    pressed: z.boolean(),
  }),
  z.object({
    t: z.literal('choice'),
    id: z.string().min(1).max(64),
  }),
  /**
   * Gesto de desporto (lançar, raquetada, tacada, soco…), por sensores de
   * movimento ou por arrastar no ecrã. Tudo normalizado.
   */
  z.object({
    t: z.literal('swing'),
    /** Força do gesto, 0–1 (até 1.1 na zona vermelha do golfe). */
    power: z.number().min(0).max(1.1),
    /** Direção: -1 esquerda, 0 em frente, 1 direita. */
    dir: z.number().min(-1).max(1),
    /** Efeito/rotação do pulso: -1 a 1. */
    spin: z.number().min(-1).max(1),
    hand: z.enum(['left', 'right']).optional(),
    source: z.enum(['motion', 'touch', 'key']).optional(),
    /** Tipo de soco pelo gesto (boxe). */
    kind: z.enum(['straight', 'hook', 'uppercut']).optional(),
    /** Altura da tacada (golfe): -1 rasteira … 1 alta. */
    loft: z.number().min(-1).max(1).optional(),
  }),
  /** Ângulo de pontaria pela inclinação do telemóvel: -1 esquerda … 1 direita. */
  z.object({
    t: z.literal('aim'),
    angle: z.number().min(-1).max(1),
  }),
  /** Defesa (boxe): a segurar ou não. */
  z.object({
    t: z.literal('guard'),
    up: z.boolean(),
  }),
]);

const legend = z.string().max(16).optional();

/**
 * O que o ecrã principal pede ao telemóvel para mostrar. O telemóvel é sempre o mesmo
 * comando (como os da Switch): joystick ou cruz, A/B/X/Y, + e −. As escolhas aparecem no
 * ecrã grande; o comando só diz o que cada botão faz agora (legenda) e apaga os inativos.
 */
export const controllerLayoutSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('wait'),
    message: z.string().max(200),
  }),
  z.object({
    kind: z.literal('pad'),
    /** Linha principal (o que se está a fazer). */
    title: z.string().max(120),
    sub: z.string().max(160).optional(),
    /** Lado esquerdo: joystick analógico, cruz direcional ou nada. */
    stick: z.enum(['stick', 'dpad', 'none']),
    stickLabel: z.string().max(30).optional(),
    /** Legendas dos botões ativos (ausente = botão apagado). */
    buttons: z.object({ a: legend, b: legend, x: legend, y: legend, plus: legend, minus: legend }),
    /** Abanar o telemóvel = carregar em A. */
    shake: z.boolean().optional(),
    /**
     * Desportos com movimento: o gesto com o telemóvel envia `swing` no fim de cada gesto.
     * `hold: 'a'` = só conta com A carregado (como segurar o botão no bowling); `'none'` = sempre.
     * `tilt`: a inclinação envia `aim` (apontar ou esquivar).
     */
    motion: z
      .object({
        action: motionActionSchema,
        hold: z.enum(['a', 'none']),
        tilt: z.enum(['aim', 'dodge']).optional(),
      })
      .optional(),
    /** Cor de destaque (cor da personagem). */
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  }),
]);

export const hostToControllerSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('layout'), layout: controllerLayoutSchema }),
  z.object({
    t: z.literal('vibrate'),
    pattern: z.union([
      z.number().int().min(0).max(2000),
      z.array(z.number().int().min(0).max(2000)).max(10),
    ]),
  }),
  z.object({ t: z.literal('toast'), text: z.string().max(120) }),
]);

export const hostSendSchema = z.object({
  to: z.union([z.literal('all'), playerIdSchema]),
  message: hostToControllerSchema,
});

export const hostResumeSchema = z.object({
  roomCode: roomCodeSchema,
  hostToken: tokenSchema,
});

export const playerJoinSchema = z.object({
  roomCode: roomCodeSchema,
  name: z.string().max(64),
  sessionToken: tokenSchema.optional(),
});
