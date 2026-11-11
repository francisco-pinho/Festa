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

export const buttonIdSchema = z.enum(['a', 'b']);

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
    /** Força do gesto, 0–1. */
    power: z.number().min(0).max(1),
    /** Direção: -1 esquerda, 0 em frente, 1 direita. */
    dir: z.number().min(-1).max(1),
    /** Efeito/rotação do pulso: -1 a 1. */
    spin: z.number().min(-1).max(1),
    hand: z.enum(['left', 'right']).optional(),
    source: z.enum(['motion', 'touch', 'key']).optional(),
    /** Tipo de soco pelo gesto (boxe). */
    kind: z.enum(['straight', 'hook', 'uppercut']).optional(),
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

/** O que o ecrã principal pede ao telemóvel para mostrar. */
export const controllerLayoutSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('wait'),
    message: z.string().max(200),
  }),
  z.object({
    kind: z.literal('gamepad'),
    stick: z.boolean(),
    buttons: z
      .array(z.object({ id: buttonIdSchema, label: z.string().max(12) }))
      .max(2),
    hint: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal('choices'),
    prompt: z.string().max(200),
    options: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          label: z.string().min(1).max(60),
          /** Cor de destaque do botão (ex.: cor da personagem). */
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
          disabled: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(12),
    /** Grelha com N colunas (por omissão, 1). */
    columns: z.number().int().min(1).max(3).optional(),
  }),
  /**
   * Comando de desporto: zona para fazer o gesto (movimento do telemóvel ou
   * arrastar), joystick opcional para apontar e botão de defesa opcional.
   */
  z.object({
    kind: z.literal('motion'),
    prompt: z.string().max(200),
    action: z.enum(['throw', 'swing', 'punch', 'pitch', 'bat', 'putt']),
    /** Mostra um joystick para apontar/posicionar antes do gesto. */
    aim: z.boolean(),
    /** Duas zonas (mão esquerda e direita), para o boxe. */
    hands: z.boolean().optional(),
    /** Botão de defesa a segurar. */
    guard: z.boolean().optional(),
    /** Botões de esquiva (A = esquerda, B = direita) e esquiva a inclinar o telemóvel. */
    dodge: z.boolean().optional(),
    hint: z.string().max(200).optional(),
  }),
  /** Lançar dados: botão grande e, se o telemóvel deixar, abanar. Envia a escolha `roll`. */
  z.object({
    kind: z.literal('dice'),
    prompt: z.string().max(200),
    label: z.string().max(30),
    /** Botões extra (ex.: "Ver mapa", usar item). Enviam a escolha com o seu id. */
    extras: z
      .array(z.object({ id: z.string().min(1).max(64), label: z.string().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }))
      .max(5)
      .optional(),
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
