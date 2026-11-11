/**
 * Definições do jogo, guardadas no browser do PC (ecrã principal).
 */
import { Emitter } from '../../common/emitter';

export type BotLevel = 'facil' | 'normal' | 'dificil' | 'mestre';

export const BOT_LEVELS: { id: BotLevel; label: string; skill: number }[] = [
  { id: 'facil', label: 'Fácil', skill: 0.35 },
  { id: 'normal', label: 'Normal', skill: 0.6 },
  { id: 'dificil', label: 'Difícil', skill: 0.82 },
  { id: 'mestre', label: 'Mestre', skill: 0.97 },
];

export type GraphicsLevel = 'alto' | 'medio' | 'baixo';
export const GRAPHICS_LEVELS: { id: GraphicsLevel; label: string }[] = [
  { id: 'alto', label: 'Alto' },
  { id: 'medio', label: 'Médio' },
  { id: 'baixo', label: 'Baixo' },
];

export const ANIM_SPEEDS = [
  { value: 1, label: 'Normal' },
  { value: 1.4, label: 'Rápida' },
  { value: 1.8, label: 'Muito rápida' },
];

export interface SettingsData {
  botLevel: BotLevel;
  /** Multiplicador da velocidade das animações e esperas. */
  animSpeed: number;
  /** Mostrar dicas no fundo do ecrã. */
  hints: boolean;
  /** Volume dos efeitos e da música, 0–1. */
  sfxVolume: number;
  musicVolume: number;
  /** Narrador que explica os jogos antes de começarem. */
  narrator: boolean;
  /** Qualidade da imagem (sombras suaves, oclusão ambiente, brilho). */
  graphics: GraphicsLevel;
}

export const VOLUMES = [0, 0.25, 0.5, 0.75, 1];

const KEY = 'festa.settings';
const DEFAULTS: SettingsData = { botLevel: 'normal', animSpeed: 1, hints: true, sfxVolume: 0.75, musicVolume: 0.5, narrator: true, graphics: 'alto' };

class Settings {
  readonly events = new Emitter<{ changed: SettingsData }>();
  private data: SettingsData = load();

  get value(): Readonly<SettingsData> {
    return this.data;
  }

  /** Habilidade dos bots, de 0 (péssimo) a 1 (perfeito). */
  get botSkill(): number {
    return BOT_LEVELS.find((l) => l.id === this.data.botLevel)?.skill ?? 0.6;
  }

  get botLevelLabel(): string {
    return BOT_LEVELS.find((l) => l.id === this.data.botLevel)?.label ?? 'Normal';
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data = { ...this.data, [key]: value };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* sem armazenamento */
    }
    this.events.emit('changed', this.data);
  }

  /** Passa para o nível de bots seguinte (útil no telemóvel do VIP). */
  cycleBotLevel(): void {
    const i = BOT_LEVELS.findIndex((l) => l.id === this.data.botLevel);
    this.set('botLevel', BOT_LEVELS[(i + 1) % BOT_LEVELS.length]!.id);
  }
}

function load(): SettingsData {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SettingsData>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = new Settings();
