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
  /** Resposta a um `ping` do host (mede o atraso da rede deste telemóvel). */
  z.object({ t: z.literal('pong'), id: z.number().int().min(0) }),
  /** Atraso do vídeo do ecrã que este jogador está a ver (segundos; 0 = vê o ecrã ao vivo). */
  z.object({ t: z.literal('lag'), video: z.number().min(0).max(3) }),
]);

const legend = z.string().max(16).optional();

/**
 * O que o ecrã principal pede ao telemóvel para mostrar. O telemóvel é sempre o mesmo
 * comando (como os da Switch): joystick ou cruz, A/B/X/Y, + e −. As escolhas aparecem no
 * ecrã grande; o comando só diz o que cada botão faz agora (legenda) e apaga os inativos.
 */
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const coord = z.number().min(-500).max(500);

/** Cartões de estatísticas pessoais (moedas, pontos, lugar…). */
const statsSchema = z.array(z.object({ label: z.string().max(24), value: z.string().max(24), icon: z.string().max(8).optional() })).max(6);

export const controllerLayoutSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('wait'),
    message: z.string().max(200),
  }),
  /** À espera da vez, na festa: mapa do tabuleiro em miniatura com toda a gente. */
  z.object({
    kind: z.literal('board'),
    message: z.string().max(200),
    /** Cores dos tipos de casa (índice usado em `spaces`). */
    palette: z.array(hexColor).max(16),
    /** Casas: [x, z, índice da cor]. */
    spaces: z.array(z.tuple([coord, coord, z.number().int().min(0).max(15)])).max(250),
    /** Ligações entre casas (índices em `spaces`). */
    links: z.array(z.tuple([z.number().int().min(0).max(249), z.number().int().min(0).max(249)])).max(500),
    players: z
      .array(z.object({ x: coord, z: coord, color: hexColor, label: z.string().max(4), me: z.boolean().optional(), active: z.boolean().optional() }))
      .max(10),
    star: z.tuple([coord, coord]).nullable(),
    /** As minhas estatísticas (moedas, estrelas, itens, lugar). */
    stats: statsSchema.optional(),
    /** Símbolo de cada tipo de casa (mesmo índice que `palette`). */
    symbols: z.array(z.string().max(4)).max(16).optional(),
    /** Túneis, metro, elevadores… (desenhados a tracejado). */
    tunnels: z.array(z.tuple([z.number().int().min(0).max(249), z.number().int().min(0).max(249)])).max(20).optional(),
    color: hexColor.optional(),
    /** Botões por baixo do mapa (ex.: na vez de lançar: 🎲 Lançar, Itens, Mapa). Enviam carregadelas. */
    actions: z.array(z.object({ id: buttonIdSchema, label: z.string().max(24), primary: z.boolean().optional() })).max(4).optional(),
    /** Abanar o telemóvel conta como Ⓐ. */
    shake: z.boolean().optional(),
  }),
  /**
   * Quando o comando não está a ser usado: o que interessa a este jogador agora
   * (estatísticas, classificação ao vivo e, às vezes, uma aposta).
   */
  z.object({
    kind: z.literal('info'),
    title: z.string().max(80),
    sub: z.string().max(160).optional(),
    stats: statsSchema.optional(),
    table: z
      .object({
        title: z.string().max(40).optional(),
        rows: z.array(z.object({ name: z.string().max(24), color: hexColor, value: z.string().max(32), me: z.boolean().optional(), mark: z.string().max(8).optional() })).max(10),
      })
      .optional(),
    /** Aposta/pergunta: os botões enviam `choice` com o id. */
    ask: z
      .object({
        prompt: z.string().max(80),
        options: z.array(z.object({ id: z.string().min(1).max(32), label: z.string().max(30), color: hexColor.optional() })).min(1).max(6),
        chosen: z.string().max(32).optional(),
      })
      .optional(),
    color: hexColor.optional(),
  }),
  /** Escolha da personagem: carrossel com as caras (setas ◀ ▶, tocar numa, «Pronto!»). */
  z.object({
    kind: z.literal('pick'),
    title: z.string().max(80),
    sub: z.string().max(160).optional(),
    color: hexColor.optional(),
    items: z
      .array(
        z.object({
          id: z.string().min(1).max(32),
          name: z.string().max(24),
          color: hexColor,
          taken: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(16),
    index: z.number().int().min(0).max(15),
    ready: z.boolean(),
    buttons: z.object({ a: legend, b: legend, x: legend, plus: legend }),
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
  /** Cara de uma personagem (imagem pequena) para o carrossel de escolha; o telemóvel guarda-a. */
  z.object({ t: z.literal('face'), id: z.string().min(1).max(32), img: z.string().max(12_000).regex(/^data:image\/(jpeg|png|webp);base64,/) }),
  /** Medição de atraso: o telemóvel responde logo com `pong`. */
  z.object({ t: z.literal('ping'), id: z.number().int().min(0) }),
  /** Estado do jogo para o menu 📊 do telemóvel (abre-se a qualquer altura). `null` esconde o botão. */
  z.object({
    t: z.literal('status'),
    status: z
      .object({
        title: z.string().max(80),
        stats: statsSchema.optional(),
        rows: z.array(z.object({ name: z.string().max(24), color: hexColor, value: z.string().max(32), me: z.boolean().optional(), mark: z.string().max(8).optional() })).max(10),
      })
      .nullable(),
  }),
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

// ── Vídeo do ecrã para quem está fora (WebRTC) ──────────────

export const viewerJoinSchema = z.object({ roomCode: roomCodeSchema });

/** Mensagens de sinalização WebRTC entre o host e um espectador. */
export const rtcSignalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('offer'), sdp: z.string().max(14_000) }),
  z.object({ kind: z.literal('answer'), sdp: z.string().max(14_000) }),
  z.object({
    kind: z.literal('ice'),
    candidate: z.string().max(1_000),
    sdpMid: z.string().max(64).nullable().optional(),
    sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
  }),
  /** Host: ainda não está a partilhar o ecrã. */
  z.object({ kind: z.literal('waiting') }),
  /** Espectador: pede (outra vez) a ligação. */
  z.object({ kind: z.literal('request') }),
]);

/** `to`: id do espectador (quando envia o host) ou 'host' (quando envia o espectador). */
export const rtcSendSchema = z.object({ to: z.string().min(1).max(64), data: rtcSignalSchema });
