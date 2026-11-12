/**
 * «Memória» (todos contra todos): 12 cartas no chão mostram-se uns segundos e viram-se.
 * Depois o jogo pergunta «Onde está…?» e cada um leva o seu cursor (anel da sua cor) até à carta
 * com a cruz e confirma com Ⓐ. A carta certa vira-se: quem acertou ganha um ponto.
 * A partir da 3.ª pergunta, algumas cartas trocam de lugar à vista de todos. 5 perguntas.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import type { ButtonId } from '@festa/shared';
import { getCharacter } from '@festa/game';
import { drawIcon } from '../../common/icons';
import { disposeObject, mesh, textSprite, toon } from '../three/materials';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';
import { rankBy } from './rank';

const COLS = 4;
const ROWS = 3;
const QUESTIONS = 5;
const ANSWER_TIME = 7;
/** Ícone desenhado de cada carta e o emoji que o representa nos textos (vira ícone no ecrã). */
const CARDS: { icon: string; emoji: string; name: string }[] = [
  { icon: 'coin', emoji: '🪙', name: 'a moeda' },
  { icon: 'star', emoji: '⭐', name: 'a estrela' },
  { icon: 'heart', emoji: '❤️', name: 'o coração' },
  { icon: 'dice', emoji: '🎲', name: 'o dado' },
  { icon: 'bomb', emoji: '💣', name: 'a bomba' },
  { icon: 'ghost', emoji: '👻', name: 'o fantasma' },
  { icon: 'gift', emoji: '🎁', name: 'a prenda' },
  { icon: 'fish', emoji: '🐟', name: 'o peixe' },
  { icon: 'sheep', emoji: '🐑', name: 'a ovelha' },
  { icon: 'trophy', emoji: '🏆', name: 'a taça' },
  { icon: 'gem', emoji: '💎', name: 'o diamante' },
  { icon: 'bolt', emoji: '⚡', name: 'o raio' },
];

interface Card {
  kind: number;
  mesh: THREE.Mesh;
  slot: number;
  flip: number;
  flipTarget: number;
}

function faceTexture(icon: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fffdf3';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 14;
  g.strokeRect(10, 10, 236, 236);
  drawIcon(g, icon, 38, 38, 180);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let backTex: THREE.CanvasTexture | null = null;
function backTexture(): THREE.CanvasTexture {
  if (backTex) return backTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6c5ce7';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#7d6ff0';
  for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < 256; x += 32) g.fillRect(x, y, 16, 16);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 12;
  g.strokeRect(8, 8, 240, 240);
  g.font = 'bold 120px Trebuchet MS, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd23f';
  g.fillText('?', 128, 136);
  backTex = new THREE.CanvasTexture(c);
  backTex.colorSpace = THREE.SRGBColorSpace;
  return backTex;
}

class MemoryRun extends RowMinigame {
  protected readonly duration = 120;
  private readonly cards: Card[] = [];
  private readonly slotPos: THREE.Vector3[] = [];
  private phase: 'show' | 'hide' | 'ask' | 'reveal' | 'shuffle' = 'show';
  private t = 0;
  private question = 0;
  private target = 0;
  private readonly asked = new Set<number>();
  private readonly cursor = new Map<string, number>();
  private readonly locked = new Map<string, number>();
  private readonly rings = new Map<string, THREE.Mesh>();
  private readonly points = new Map<string, number>();
  private readonly botPick = new Map<string, { at: number; slot: number }>();
  private sign: THREE.Sprite | null = null;
  private readonly showTime: number;
  private swaps: { a: Card; b: Card; from: THREE.Vector3; to: THREE.Vector3 }[] = [];

  constructor(ctx: MinigameContext) {
    super(ctx, { spacing: 2.4 });
    this.showTime = Math.max(3, 5 - ((ctx.round ?? 1) - 1));
    // Fila dos jogadores à frente; cartas no chão atrás deles.
    for (const r of this.row) {
      r.model.root.position.z = 3.2;
      this.points.set(r.seat.id, 0);
    }
    const geo = new THREE.BoxGeometry(1.5, 0.08, 1.9);
    const side = toon('#e9e2c9');
    const order = Array.from({ length: COLS * ROWS }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(ctx.rng.next() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    for (let slot = 0; slot < COLS * ROWS; slot++) {
      const col = slot % COLS;
      const row = Math.floor(slot / COLS);
      this.slotPos.push(new THREE.Vector3((col - (COLS - 1) / 2) * 2.1, 0.05, -1.2 - row * 2.5));
      const kind = order[slot]!;
      const faceMat = new THREE.MeshToonMaterial({ map: faceTexture(CARDS[kind]!.icon) });
      const backMat = new THREE.MeshToonMaterial({ map: backTexture() });
      const m = new THREE.Mesh(geo, [side, side, faceMat, backMat, side, side]);
      m.castShadow = true;
      m.position.copy(this.slotPos[slot]!);
      this.scene.add(m);
      this.cards.push({ kind, mesh: m, slot, flip: 0, flipTarget: 0 });
    }
    // Cursor de cada jogador: um anel da sua cor (tamanhos diferentes para não se taparem).
    this.row.forEach((r, i) => {
      const color = getCharacter(r.seat.characterId).color;
      const ring = mesh(new THREE.TorusGeometry(1.05 + i * 0.12, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color }), { cast: false });
      ring.rotation.x = Math.PI / 2;
      ring.visible = false;
      this.scene.add(ring);
      this.rings.set(r.seat.id, ring);
      this.cursor.set(r.seat.id, Math.floor(ctx.rng.next() * COLS * ROWS));
    });
    this.camera.position.set(0, 11, 9.5);
    this.camera.lookAt(0, 0, -2.6);
    this.setSign('Memoriza as cartas!', '#ffd23f');
  }

  private setSign(text: string, color = '#ffffff'): void {
    if (this.sign) {
      this.scene.remove(this.sign);
      disposeObject(this.sign);
    }
    this.sign = textSprite(text, { height: 1.1, color, stroke: '#1d1433' });
    this.sign.position.set(0, 3.6, -3.6);
    this.scene.add(this.sign);
  }

  private cardAt(slot: number): Card {
    return this.cards.find((c) => c.slot === slot)!;
  }

  scores(): MinigameScore[] {
    return this.row.map((r) => ({ id: r.seat.id, value: `${this.points.get(r.seat.id) ?? 0} ✔` }));
  }

  override ranking(): string[][] {
    return rankBy(this.row.map((r) => r.seat.id), (id) => this.points.get(id) ?? 0);
  }

  winners(): string[] {
    const best = Math.max(...this.points.values());
    const top = this.row.filter((r) => this.points.get(r.seat.id) === best);
    return best === 0 || (top.length === this.row.length && this.row.length > 1) ? [] : top.map((r) => r.seat.id);
  }

  private ask(): void {
    this.question++;
    this.phase = 'ask';
    this.t = 0;
    this.locked.clear();
    this.botPick.clear();
    let k: number;
    do k = Math.floor(this.ctx.rng.next() * CARDS.length);
    while (this.asked.has(k) && this.asked.size < CARDS.length);
    this.asked.add(k);
    this.target = k;
    this.setSign(`Onde está ${CARDS[k]!.name} ${CARDS[k]!.emoji}?`, '#ffd23f');
    sound.play('banner');
    for (const r of this.row) {
      this.rings.get(r.seat.id)!.visible = true;
      for (const b of ['up', 'down', 'left', 'right', 'a'] as ButtonId[]) this.pressed(r, b);
      if (this.isBot(r)) {
        // Bots lembram-se melhor quanto maior a dificuldade.
        const right = this.ctx.rng.next() < 0.35 + this.ctx.botSkill * 0.5;
        const slot = right ? this.cards.find((c) => c.kind === k)!.slot : Math.floor(this.ctx.rng.next() * COLS * ROWS);
        this.botPick.set(r.seat.id, { at: 1.5 + this.ctx.rng.next() * 3.5, slot });
      }
    }
  }

  private moveCursor(r: Rower, dc: number, dr: number): void {
    const s = this.cursor.get(r.seat.id)!;
    const col = Math.max(0, Math.min(COLS - 1, (s % COLS) + dc));
    const row = Math.max(0, Math.min(ROWS - 1, Math.floor(s / COLS) + dr));
    this.cursor.set(r.seat.id, row * COLS + col);
    this.ctx.vibrate(r.seat.id, 12);
    sound.play('tick', { vol: 0.25 });
  }

  protected step(dt: number): void {
    this.t += dt;
    if (this.phase === 'show') {
      if (this.t > this.showTime) {
        this.phase = 'hide';
        this.t = 0;
        for (const c of this.cards) c.flipTarget = 1;
        sound.play('whoosh');
        this.setSign('…', '#ffffff');
      }
      return;
    }
    if (this.phase === 'hide' || this.phase === 'shuffle') {
      if (this.phase === 'shuffle') {
        const k = Math.min(1, this.t / 1.2);
        for (const s of this.swaps) {
          s.a.mesh.position.lerpVectors(s.from, s.to, k).setY(0.05 + Math.sin(k * Math.PI) * 0.8);
          s.b.mesh.position.lerpVectors(s.to, s.from, k).setY(0.05 + Math.sin(k * Math.PI) * 0.8);
        }
      }
      if (this.t > (this.phase === 'shuffle' ? 1.5 : 1)) this.ask();
      return;
    }
    if (this.phase === 'ask') {
      for (const r of this.row) {
        if (this.locked.has(r.seat.id)) continue;
        if (this.isBot(r)) {
          const plan = this.botPick.get(r.seat.id)!;
          const cur = this.cursor.get(r.seat.id)!;
          if (this.t > plan.at * 0.5 && cur !== plan.slot && Math.random() < dt * 6) {
            const dc = Math.sign((plan.slot % COLS) - (cur % COLS));
            const dr = Math.sign(Math.floor(plan.slot / COLS) - Math.floor(cur / COLS));
            this.cursor.set(r.seat.id, Math.floor(cur / COLS + dr) * COLS + (cur % COLS) + dc);
          } else if (cur === plan.slot && this.t > plan.at) this.lock(r);
          continue;
        }
        if (this.pressed(r, 'left')) this.moveCursor(r, -1, 0);
        if (this.pressed(r, 'right')) this.moveCursor(r, 1, 0);
        if (this.pressed(r, 'up')) this.moveCursor(r, 0, 1);
        if (this.pressed(r, 'down')) this.moveCursor(r, 0, -1);
        if (this.pressed(r, 'a')) this.lock(r);
      }
      if (this.t > ANSWER_TIME || this.row.every((r) => this.locked.has(r.seat.id))) {
        for (const r of this.row) if (!this.locked.has(r.seat.id)) this.lock(r);
        this.reveal();
      }
      return;
    }
    if (this.phase === 'reveal' && this.t > 2.6) {
      const card = this.cards.find((c) => c.kind === this.target)!;
      card.flipTarget = 1;
      if (this.question >= QUESTIONS) {
        this.endGame();
        return;
      }
      // A partir da 3.ª pergunta, duas trocas de cartas à vista.
      if (this.question >= 2) {
        this.swaps = [];
        const used = new Set<number>();
        for (let n = 0; n < 2; n++) {
          let a: number;
          let b: number;
          do {
            a = Math.floor(this.ctx.rng.next() * COLS * ROWS);
            b = Math.floor(this.ctx.rng.next() * COLS * ROWS);
          } while (a === b || used.has(a) || used.has(b));
          used.add(a).add(b);
          const ca = this.cardAt(a);
          const cb = this.cardAt(b);
          this.swaps.push({ a: ca, b: cb, from: this.slotPos[a]!.clone(), to: this.slotPos[b]!.clone() });
          ca.slot = b;
          cb.slot = a;
        }
        this.phase = 'shuffle';
        this.t = 0;
        this.setSign('Atenção: trocam de lugar!', '#ff6b7a');
        sound.play('whoosh', { pitch: 0.8 });
      } else {
        this.phase = 'hide';
        this.t = 0;
      }
      for (const r of this.row) this.rings.get(r.seat.id)!.visible = false;
    }
  }

  private lock(r: Rower): void {
    this.locked.set(r.seat.id, this.cursor.get(r.seat.id)!);
    this.ctx.vibrate(r.seat.id, 30);
  }

  private reveal(): void {
    this.phase = 'reveal';
    this.t = 0;
    const card = this.cards.find((c) => c.kind === this.target)!;
    card.flipTarget = 0;
    sound.play('coin');
    for (const r of this.row) {
      const ok = this.locked.get(r.seat.id) === card.slot;
      if (ok) this.points.set(r.seat.id, (this.points.get(r.seat.id) ?? 0) + 1);
      this.float(ok ? '✔' : '✖', r.model.root.position.x, 3.2, ok ? '#4cd964' : '#ff6b7a', 0.9, r.model.root.position.z);
      r.model.setAnim(ok ? 'cheer' : 'sad');
      this.ctx.vibrate(r.seat.id, ok ? 60 : 150);
      setTimeout(() => r.model.setAnim('idle'), 1500);
    }
    this.setSign(`${CARDS[this.target]!.emoji} estava aqui!`, '#4cd964');
  }

  protected override animate(dt: number, time: number): void {
    for (const c of this.cards) {
      c.flip += (c.flipTarget - c.flip) * Math.min(1, dt * 8);
      // Vira à volta do seu lado comprido, com um saltinho a meio.
      c.mesh.rotation.z = c.flip * Math.PI;
      if (this.phase !== 'shuffle') c.mesh.position.y = 0.05 + Math.sin(c.flip * Math.PI) * 0.5;
    }
    for (const r of this.row) {
      const ring = this.rings.get(r.seat.id)!;
      const slot = this.locked.get(r.seat.id) ?? this.cursor.get(r.seat.id)!;
      const p = this.slotPos[slot]!;
      ring.position.set(p.x, 0.2 + Math.sin(time * 4) * 0.04, p.z);
      ring.scale.setScalar(this.locked.has(r.seat.id) ? 1 : 1 + Math.sin(time * 6) * 0.04);
    }
  }
}

export const MemoryCards: MinigameDef = {
  id: 'memoria',
  rounds: 1,
  name: 'Memória',
  modes: ['ffa'],
  description: () =>
    'Decora onde está cada carta! Depois viram-se e o jogo pergunta onde está uma delas: leva o teu anel até lá com a cruz e confirma com Ⓐ. Cuidado que, a meio, algumas trocam de lugar!',
  controls: '✚ Mover o cursor · Ⓐ Confirmar',
  stick: 'dpad',
  buttons: [{ id: 'a', label: 'Confirmar' }],
  create: (ctx) => new MemoryRun(ctx),
};
