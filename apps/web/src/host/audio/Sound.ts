/**
 * Sons e música gerados no browser (Web Audio), sem ficheiros: efeitos sintetizados
 * (moedas, dados, socos, bola, pinos, público…) e músicas simples em loop por modo.
 *
 * Os browsers só deixam tocar som depois de um clique ou tecla no ecrã principal:
 * `unlock()` é chamado no primeiro gesto e há um botão «🔊 Ativar som» enquanto não houver.
 */
import { settings } from '../game/Settings';

export type Sfx =
  | 'click'
  | 'coin'
  | 'coinLose'
  | 'star'
  | 'dice'
  | 'step'
  | 'whoosh'
  | 'hit'
  | 'punch'
  | 'block'
  | 'bell'
  | 'whistle'
  | 'ball'
  | 'bounce'
  | 'bat'
  | 'pins'
  | 'roll'
  | 'splash'
  | 'cheer'
  | 'aww'
  | 'firework'
  | 'beep'
  | 'go'
  | 'win'
  | 'lose'
  | 'tick'
  | 'banner'
  | 'boom'
  | 'coinBig'
  | 'countdown'
  | 'pop'
  | 'tvOn'
  | 'tvOff';

export type Track = 'lobby' | 'board' | 'minigame' | 'sports' | 'finale';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Song {
  bpm: number;
  /** Acordes (nota MIDI da fundamental) por compasso. */
  chords: number[];
  /** Escala (intervalos) para a melodia. */
  scale: number[];
  lead: OscillatorType;
  swing?: number;
  drums: boolean;
}

const SONGS: Record<Track, Song> = {
  lobby: { bpm: 104, chords: [60, 57, 53, 55], scale: [0, 2, 4, 7, 9], lead: 'triangle', drums: false },
  board: { bpm: 118, chords: [60, 65, 57, 67], scale: [0, 2, 4, 5, 7, 9, 11], lead: 'square', drums: true },
  minigame: { bpm: 142, chords: [57, 53, 60, 55], scale: [0, 3, 5, 7, 10], lead: 'square', drums: true },
  sports: { bpm: 126, chords: [62, 67, 59, 64], scale: [0, 2, 4, 7, 9], lead: 'sawtooth', drums: true },
  finale: { bpm: 96, chords: [60, 64, 65, 67], scale: [0, 2, 4, 5, 7, 9, 11], lead: 'triangle', drums: true },
};

/**
 * Música gravada (Kevin MacLeod, incompetech.com, CC BY 4.0 — ver Créditos): uma por tabuleiro,
 * várias para os minijogos (vão alternando), desportos, ecrã inicial e fim. Se um ficheiro falhar,
 * toca a música sintetizada (SONGS).
 */
const BOARD_MUSIC: Record<string, string> = { island: 'ilha', volcano: 'vulcao', castle: 'castelo', park: 'parque', city: 'cidade' };
const MINIGAME_MUSIC = ['minijogo1', 'minijogo2', 'minijogo3', 'minijogo4', 'minijogo5'];
/** Jingles (Kenney, CC0) para momentos especiais, em vez dos sons sintetizados. */
const JINGLES: Partial<Record<string, string>> = { win: 'jingles_SAX07', star: 'jingles_STEEL07' };
const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

class SoundEngine {
  /** Tema do tabuleiro (escolhe a música do tabuleiro). */
  boardTheme = 'island';
  private minigameTurn = Math.floor(Math.random() * MINIGAME_MUSIC.length);
  private fileKey: string | null = null;
  private fileAudio: HTMLAudioElement | null = null;
  private fileBus: GainNode | null = null;
  private readonly jingleCache = new Map<string, HTMLAudioElement>();
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private track: Track | null = null;
  private wantTrack: Track | null = null;
  private timer = 0;
  private nextBeat = 0;
  private beat = 0;
  private seed = 1;
  private melody: number[] = [];
  private readonly listeners = new Set<() => void>();

  get unlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  onUnlockChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  /** Chamar a partir de um clique ou tecla. */
  unlock(): void {
    try {
      if (!this.ctx) this.init();
      void this.ctx!.resume().then(() => {
        this.listeners.forEach((f) => f());
        if (this.wantTrack && !this.track) this.music(this.wantTrack);
      });
    } catch {
      /* sem áudio */
    }
  }

  private init(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.applyVolumes();
    settings.events.on('changed', () => this.applyVolumes());
    // Ruído branco (2 s) para percussão, público, salpicos…
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private ducked = false;

  /** Baixa a música (narrador a falar). */
  duck(on: boolean): void {
    this.ducked = on;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    this.sfxBus.gain.value = settings.value.sfxVolume * 0.9;
    this.musicBus.gain.setTargetAtTime(settings.value.musicVolume * 0.32 * (this.ducked ? 0.3 : 1), this.ctx.currentTime, 0.15);
    this.fileBus?.gain.setTargetAtTime(settings.value.musicVolume * 0.7 * (this.ducked ? 0.35 : 1), this.ctx.currentTime, 0.15);
  }

  // ── Blocos de som ───────────────────────────────────────

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; to?: number; attack?: number; bus?: GainNode } = {}): void {
    const ctx = this.ctx!;
    const t = opts.at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.3, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(opts.bus ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private hiss(dur: number, opts: { vol?: number; at?: number; filter?: BiquadFilterType; freq?: number; to?: number; q?: number; attack?: number; bus?: GainNode } = {}): void {
    const ctx = this.ctx!;
    const t = opts.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = opts.filter ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1500, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.3, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(opts.bus ?? this.sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  // ── Efeitos ─────────────────────────────────────────────

  play(name: Sfx, opts: { vol?: number; pitch?: number } = {}): void {
    if (!this.ctx || this.ctx.state !== 'running' || settings.value.sfxVolume <= 0) return;
    // Jingles gravados para os momentos especiais.
    const jingle = JINGLES[name];
    if (jingle) {
      let base = this.jingleCache.get(jingle);
      if (!base) {
        base = new Audio(asset(`jingles/${jingle}.ogg`));
        base.preload = 'auto';
        this.jingleCache.set(jingle, base);
      }
      const a = base.cloneNode(true) as HTMLAudioElement;
      a.volume = Math.min(1, settings.value.sfxVolume * 0.8 * (opts.vol ?? 1));
      void a.play().catch(() => undefined);
      return;
    }
    const v = opts.vol ?? 1;
    const p = opts.pitch ?? 1;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'click':
        this.tone(900 * p, 0.05, { type: 'square', vol: 0.08 * v });
        break;
      case 'tick':
        this.tone(1400 * p, 0.03, { type: 'square', vol: 0.06 * v });
        break;
      case 'coin':
        this.tone(988 * p, 0.08, { type: 'square', vol: 0.12 * v });
        this.tone(1319 * p, 0.25, { type: 'square', vol: 0.12 * v, at: t + 0.07 });
        break;
      case 'coinLose':
        this.tone(660 * p, 0.12, { type: 'square', vol: 0.1 * v });
        this.tone(440 * p, 0.25, { type: 'square', vol: 0.1 * v, at: t + 0.1 });
        break;
      case 'star':
        [72, 76, 79, 84, 88].forEach((n, i) => this.tone(NOTE(n) * p, 0.35, { type: 'triangle', vol: 0.18 * v, at: t + i * 0.07 }));
        this.hiss(0.8, { vol: 0.05 * v, filter: 'highpass', freq: 6000, at: t + 0.1 });
        break;
      case 'dice':
        for (let i = 0; i < 6; i++) this.hiss(0.05, { vol: 0.2 * v, freq: 2500 + Math.random() * 1500, q: 4, at: t + i * 0.06 + Math.random() * 0.02 });
        break;
      case 'step':
        this.hiss(0.05, { vol: 0.12 * v, filter: 'lowpass', freq: 600 * p });
        break;
      case 'whoosh':
        this.hiss(0.35, { vol: 0.18 * v, freq: 400, to: 2500 * p, q: 2, attack: 0.1 });
        break;
      case 'banner':
        this.hiss(0.25, { vol: 0.06 * v, freq: 800, to: 3000, q: 1.5, attack: 0.08 });
        break;
      case 'hit':
        this.tone(160 * p, 0.12, { vol: 0.35 * v, to: 60 });
        this.hiss(0.08, { vol: 0.15 * v, filter: 'lowpass', freq: 1200 });
        break;
      case 'punch':
        this.tone(120 * p, 0.16, { vol: 0.5 * v, to: 45 });
        this.hiss(0.12, { vol: 0.35 * v, filter: 'lowpass', freq: 2000 });
        break;
      case 'block':
        this.tone(300 * p, 0.08, { vol: 0.25 * v, to: 180 });
        this.hiss(0.06, { vol: 0.15 * v, freq: 1800, q: 2 });
        break;
      case 'bell':
        for (const [f, d] of [[880, 1.4], [1320, 1], [2200, 0.6]] as const) this.tone(f * p, d, { type: 'sine', vol: 0.2 * v });
        this.tone(880 * p, 1.2, { type: 'sine', vol: 0.15 * v, at: t + 0.3 });
        break;
      case 'whistle':
        this.tone(2200 * p, 0.45, { type: 'sine', vol: 0.15 * v, attack: 0.02 });
        this.tone(2260 * p, 0.45, { type: 'sine', vol: 0.12 * v, attack: 0.02 });
        break;
      case 'ball':
        this.tone(700 * p, 0.06, { type: 'triangle', vol: 0.3 * v, to: 400 });
        this.hiss(0.04, { vol: 0.15 * v, freq: 3000, q: 3 });
        break;
      case 'bounce':
        this.tone(250 * p, 0.07, { type: 'sine', vol: 0.2 * v, to: 140 });
        break;
      case 'bat':
        this.hiss(0.09, { vol: 0.5 * v, freq: 2600, q: 3 });
        this.tone(900 * p, 0.12, { type: 'triangle', vol: 0.25 * v, to: 500 });
        break;
      case 'roll':
        this.hiss(1.6, { vol: 0.1 * v, filter: 'lowpass', freq: 300, attack: 0.3 });
        break;
      case 'pins':
        this.hiss(0.6, { vol: 0.45 * v, freq: 1800, q: 0.8 });
        for (let i = 0; i < 9; i++) this.tone(600 + Math.random() * 900, 0.08, { type: 'triangle', vol: 0.18 * v, at: t + Math.random() * 0.35 });
        break;
      case 'splash':
        this.hiss(0.8, { vol: 0.4 * v, freq: 1200, to: 300, q: 0.7, attack: 0.02 });
        break;
      case 'cheer':
        this.hiss(2.2 * p, { vol: 0.22 * v, freq: 1500, q: 0.6, attack: 0.25 });
        this.hiss(1.8 * p, { vol: 0.12 * v, freq: 3200, q: 1.2, attack: 0.3 });
        for (let i = 0; i < 5; i++) this.tone(2000 + Math.random() * 600, 0.25, { type: 'sine', vol: 0.03 * v, at: t + 0.2 + Math.random() * 1, to: 2600 });
        break;
      case 'aww':
        this.hiss(1.4, { vol: 0.16 * v, freq: 700, to: 350, q: 1.2, attack: 0.2 });
        break;
      case 'firework':
        this.tone(1200, 0.5, { type: 'sine', vol: 0.05 * v, to: 3000 });
        this.hiss(0.7, { vol: 0.35 * v, filter: 'lowpass', freq: 3000, at: t + 0.45 });
        this.tone(80, 0.4, { vol: 0.4 * v, to: 40, at: t + 0.45 });
        break;
      case 'boom':
        // Explosão a sério: estrondo grave, rebentamento de ruído que escurece e um ribombar.
        this.tone(95 * p, 0.55, { type: 'sine', vol: 0.55 * v, to: 32 });
        this.tone(55 * p, 0.9, { type: 'triangle', vol: 0.35 * v, to: 25, at: t + 0.03 });
        this.hiss(0.5, { vol: 0.6 * v, filter: 'lowpass', freq: 4200, to: 300, attack: 0.002 });
        this.hiss(1.4, { vol: 0.28 * v, filter: 'lowpass', freq: 700, to: 90, at: t + 0.08, attack: 0.05 });
        this.hiss(0.25, { vol: 0.2 * v, filter: 'highpass', freq: 2500, at: t + 0.01 });
        break;
      case 'coinBig':
        // Moeda especial: arpejo a SUBIR (soa a coisa boa).
        [72, 76, 79, 84, 88].forEach((n, i) => this.tone(NOTE(n) * p, i === 4 ? 0.35 : 0.1, { type: 'square', vol: 0.09 * v, at: t + i * 0.055 }));
        this.tone(NOTE(96) * p, 0.4, { type: 'sine', vol: 0.06 * v, at: t + 0.28 });
        break;
      case 'countdown':
        // Contagem final (5, 4, 3…): bip curto e seco; no último o tom sobe.
        this.tone(880 * p, 0.12, { type: 'square', vol: 0.12 * v });
        this.tone(440 * p, 0.12, { type: 'sine', vol: 0.08 * v });
        break;
      case 'pop':
        // Estalo de pistola de brincar (sai a bandeira): ruído seco e um «tuc».
        this.hiss(0.07, { vol: 0.5 * v, freq: 2200 * p, q: 0.8, attack: 0.001 });
        this.tone(420 * p, 0.09, { type: 'triangle', vol: 0.25 * v, to: 160 });
        break;
      case 'beep':
        this.tone(660 * p, 0.14, { type: 'square', vol: 0.12 * v });
        break;
      case 'go':
        this.tone(1320 * p, 0.35, { type: 'square', vol: 0.14 * v });
        break;
      case 'win':
        [60, 64, 67, 72, 67, 72].forEach((n, i) => this.tone(NOTE(n + 12) * p, i === 5 ? 0.6 : 0.16, { type: 'square', vol: 0.1 * v, at: t + i * 0.12 }));
        break;
      case 'lose':
        [67, 66, 65, 64].forEach((n, i) => this.tone(NOTE(n) * p, i === 3 ? 0.6 : 0.22, { type: 'triangle', vol: 0.14 * v, at: t + i * 0.22 }));
        break;
      case 'tvOn':
        // TV de tubo a ligar: estalo do interruptor, «tum» grave, zumbido agudo do tubo e chuvisco.
        this.hiss(0.04, { vol: 0.35 * v, freq: 3000, q: 0.7, attack: 0.001 });
        this.tone(70 * p, 0.35, { vol: 0.35 * v, to: 40, at: t + 0.02 });
        this.tone(7800 * p, 1.6, { vol: 0.025 * v, attack: 0.15, at: t + 0.1 });
        this.hiss(0.55, { vol: 0.12 * v, filter: 'highpass', freq: 2500, attack: 0.05, at: t + 0.3 });
        break;
      case 'tvOff':
        // TV de tubo a desligar: estalo e um «zip» a descer enquanto a imagem fecha.
        this.hiss(0.04, { vol: 0.3 * v, freq: 2800, q: 0.7, attack: 0.001 });
        this.tone(1400 * p, 0.3, { type: 'sine', vol: 0.06 * v, to: 90 });
        this.tone(60 * p, 0.25, { vol: 0.25 * v, to: 35, at: t + 0.05 });
        break;
    }
  }

  // ── Música ──────────────────────────────────────────────

  /** Muda de música (null = silêncio). Fica à espera se o som ainda não estiver ativo. */
  music(track: Track | null): void {
    this.wantTrack = track;
    if (!this.ctx || this.ctx.state !== 'running') return;
    // Ficheiro a tocar para esta faixa (o tabuleiro depende do tema; os minijogos vão alternando).
    const key = !track
      ? null
      : track === 'board'
        ? (BOARD_MUSIC[this.boardTheme] ?? 'ilha')
        : track === 'minigame'
          ? this.track === 'minigame' && this.fileKey
            ? this.fileKey
            : MINIGAME_MUSIC[this.minigameTurn++ % MINIGAME_MUSIC.length]!
          : { lobby: 'lobby', sports: 'desportos', finale: 'final' }[track]!;
    if (track === this.track && key === this.fileKey) return;
    this.track = track;
    window.clearInterval(this.timer);
    this.playFile(key);
    if (!track || key) return;
    this.startSynth(track);
  }

  /** Toca um ficheiro de música em ciclo, com transição suave. Se falhar, volta à sintetizada. */
  private playFile(key: string | null): void {
    const ctx = this.ctx!;
    const old = this.fileAudio;
    if (old) {
      // Desvanece a anterior.
      const g = old.volume;
      let k = 0;
      const id = window.setInterval(() => {
        k += 0.1;
        old.volume = Math.max(0, g * (1 - k));
        if (k >= 1) {
          window.clearInterval(id);
          old.pause();
          old.src = '';
        }
      }, 60);
    }
    this.fileAudio = null;
    this.fileKey = key;
    if (!key) return;
    if (!this.fileBus) {
      this.fileBus = ctx.createGain();
      this.fileBus.connect(this.master);
      this.applyVolumes();
    }
    const a = new Audio(asset(`music/${key}.mp3`));
    a.loop = true;
    a.crossOrigin = 'anonymous';
    ctx.createMediaElementSource(a).connect(this.fileBus);
    a.volume = 0;
    const fadeIn = () => {
      let k = 0;
      const id = window.setInterval(() => {
        k += 0.08;
        a.volume = Math.min(1, k);
        if (k >= 1 || this.fileAudio !== a) window.clearInterval(id);
      }, 60);
    };
    a.addEventListener('error', () => {
      if (this.fileAudio !== a) return;
      this.fileAudio = null;
      this.fileKey = null;
      if (this.track) this.startSynth(this.track);
    });
    void a.play().then(fadeIn, () => undefined);
    this.fileAudio = a;
  }

  /** Música sintetizada (só se a gravada não estiver disponível). */
  private startSynth(track: Track): void {
    window.clearInterval(this.timer);
    this.seed = [...track].reduce((a, c) => a + c.charCodeAt(0), 7);
    this.melody = this.makeMelody(SONGS[track]);
    this.beat = 0;
    this.nextBeat = this.ctx!.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** Melodia de 32 colcheias (4 compassos), repetida: -1 = pausa. */
  private makeMelody(song: Song): number[] {
    const out: number[] = [];
    let deg = 2;
    for (let i = 0; i < 32; i++) {
      if (this.rnd() < 0.28) {
        out.push(-1);
        continue;
      }
      deg = Math.max(0, Math.min(song.scale.length * 2 - 1, deg + Math.round((this.rnd() - 0.5) * 4)));
      const oct = Math.floor(deg / song.scale.length);
      out.push(song.scale[deg % song.scale.length]! + oct * 12);
    }
    // Segunda metade parecida com a primeira (frase e resposta).
    for (let i = 16; i < 32; i++) if (this.rnd() < 0.6) out[i] = out[i - 16]!;
    return out;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.track) return;
    const song = SONGS[this.track];
    const eighth = 60 / song.bpm / 2;
    while (this.nextBeat < ctx.currentTime + 0.25) {
      this.playBeat(song, this.beat, this.nextBeat, eighth);
      this.nextBeat += eighth;
      this.beat = (this.beat + 1) % 64;
    }
  }

  private playBeat(song: Song, beat: number, t: number, eighth: number): void {
    if (settings.value.musicVolume <= 0) return;
    const bus = this.musicBus;
    const bar = Math.floor(beat / 8) % song.chords.length;
    const root = song.chords[bar]!;
    const inBar = beat % 8;
    // Baixo: fundamental nos tempos 1 e 3 (e quinta no 4).
    if (inBar % 4 === 0) this.tone(NOTE(root - 24), eighth * 1.8, { type: 'triangle', vol: 0.5, at: t, bus });
    if (inBar === 6) this.tone(NOTE(root - 17), eighth * 0.9, { type: 'triangle', vol: 0.35, at: t, bus });
    // Acorde (pad curto) no início do compasso.
    if (inBar === 0 || inBar === 4) {
      const minor = song.scale.includes(3);
      for (const iv of [0, minor ? 3 : 4, 7]) this.tone(NOTE(root + iv), eighth * 3, { type: 'sine', vol: 0.08, at: t, attack: 0.03, bus });
    }
    // Melodia
    const n = this.melody[beat % 32]!;
    if (n >= 0) this.tone(NOTE(root + n + 12), eighth * 0.9, { type: song.lead, vol: song.lead === 'sine' || song.lead === 'triangle' ? 0.12 : 0.05, at: t, bus });
    // Bateria
    if (song.drums) {
      if (inBar === 0 || inBar === 4) this.tone(110, 0.12, { vol: 0.5, to: 45, at: t, bus });
      if (inBar === 2 || inBar === 6) this.hiss(0.1, { vol: 0.14, freq: 1800, q: 0.7, at: t, bus });
      this.hiss(0.03, { vol: 0.04, filter: 'highpass', freq: 7000, at: t, bus });
    }
  }
}

export const sound = new SoundEngine();
