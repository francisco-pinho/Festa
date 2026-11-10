/** Número máximo de jogadores (telemóveis) por sala. */
export const MAX_PLAYERS = 10;

/** Códigos de sala: 4 letras, sem I/O para não confundir com 1/0. */
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export const NAME_MAX_LENGTH = 16;

/** Cores atribuídas aos jogadores por ordem de entrada. */
export const PLAYER_COLORS = [
  '#ff5a5f',
  '#3fa7ff',
  '#4cd964',
  '#ffcc00',
  '#b36bff',
  '#ff8c1a',
  '#1fd1c1',
  '#ff6fb5',
  '#a0e426',
  '#c0c0c0',
] as const;

/** Caminho da página do comando (telemóvel). */
export const CONTROLLER_PATH = '/play';
