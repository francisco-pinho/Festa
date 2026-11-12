/**
 * «Olha para o Lado» (1 contra todos): em cada vez, o solitário e o grupo escolhem em segredo
 * uma direção na cruz (↑ ↓ ← →). Depois todos olham ao mesmo tempo: quem do grupo olhar para o
 * MESMO lado que o solitário sai. O solitário ganha se tirar o grupo todo em 5 vezes; se sobrar
 * alguém, ganha o grupo. Quem não escolher a tempo olha para um lado ao calhas.
 */
import { sound } from '../audio/Sound';
import * as THREE from 'three';
import type { ButtonId } from '@festa/shared';
import { disposeObject, mesh, textSprite, toon } from '../three/materials';
import { RowMinigame, type Rower } from './RowMinigame';
import type { MinigameContext, MinigameDef, MinigameScore } from './types';

type Dir = 'up' | 'down' | 'left' | 'right';
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const ARROW: Record<Dir, string> = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' };
const TURNS = 5;
const CHOOSE = 3.5;
const REVEAL = 2.4;

class LookAwayRun extends RowMinigame {
  protected readonly duration = TURNS * (CHOOSE + REVEAL) + 4;
  private readonly solo: Rower | undefined;
  private readonly group: Rower[];
  private turn = 1;
  private phase: 'choose' | 'reveal' = 'choose';
  private phaseT = 0;
  private readonly picks = new Map<string, Dir>();
  private readonly botAt = new Map<string, number>();
  private readonly marks: THREE.Sprite[] = [];
  private readonly timerBar: THREE.Mesh;
  private sign: THREE.Sprite | null = null;

  constructor(ctx: MinigameContext) {
    super(ctx, { spacing: 2.4 });
    this.solo = this.row.find((r) => r.seat.team === 'blue');
    this.group = this.row.filter((r) => r !== this.solo);
    // O solitário fica à frente, num estrado, de frente para o grupo (e para a câmara).
    if (this.solo) {
      const stage = mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.5, 24), toon('#2f7dff'));
      stage.position.set(0, 0.25, -4.5);
      this.scene.add(stage);
      this.solo.model.root.position.set(0, 0.5, -4.5);
      this.solo.model.faceYaw(0, true);
      this.solo.model.root.scale.setScalar(1.25);
    }
    const n = this.group.length;
    this.group.forEach((r, i) => {
      r.x = (i - (n - 1) / 2) * 2.6;
      r.model.root.position.set(r.x, 0, 0.5);
      r.model.faceYaw(Math.PI, true); // de costas para a câmara, a olhar para o solitário
    });
    this.timerBar = mesh(new THREE.BoxGeometry(6, 0.18, 0.05), toon('#ffd23f'), { cast: false });
    this.timerBar.position.set(0, 4.6, -4.5);
    this.scene.add(this.timerBar);
    this.camera.position.set(0, 4.6, 9.5);
    this.camera.lookAt(0, 1.6, -2);
    this.showSign('Escolhe para onde olhar!');
  }

  private showSign(text: string, color = '#ffffff'): void {
    if (this.sign) {
      this.scene.remove(this.sign);
      disposeObject(this.sign);
    }
    this.sign = textSprite(text, { height: 0.7, color, stroke: '#1d1433' });
    this.sign.position.set(0, 5.4, -4.5);
    this.scene.add(this.sign);
  }

  scores(): MinigameScore[] {
    return this.row.map((r) => ({
      id: r.seat.id,
      value: r === this.solo ? `👀 vez ${Math.min(this.turn, TURNS)}/${TURNS}` : r.alive ? '😎 a salvo' : '😵 apanhado',
    }));
  }

  winners(): string[] {
    if (!this.solo) return [];
    const left = this.group.filter((r) => r.alive);
    return left.length ? this.group.map((r) => r.seat.id) : [this.solo.seat.id];
  }

  /** Vira a cabeça (e um pouco o tronco) para a direção, vista do ecrã. */
  private look(r: Rower, d: Dir | null): void {
    const facingCamera = r === this.solo;
    const side = facingCamera ? -1 : 1;
    const p = r.model.pose;
    p.headX = d === 'up' ? -0.45 : d === 'down' ? 0.4 : 0;
    p.headY = d === 'left' ? 0.85 * side : d === 'right' ? -0.85 * side : 0;
    p.chestY = p.headY * 0.35;
  }

  private clearMarks(): void {
    for (const m of this.marks) {
      this.scene.remove(m);
      disposeObject(m);
    }
    this.marks.length = 0;
  }

  protected step(dt: number): void {
    this.phaseT += dt;
    const players = this.solo ? [this.solo, ...this.group.filter((r) => r.alive)] : [];
    if (this.phase === 'choose') {
      this.timerBar.scale.x = Math.max(0.01, 1 - this.phaseT / CHOOSE);
      for (const r of players) {
        if (this.picks.has(r.seat.id)) {
          for (const d of DIRS) this.pressed(r, d as ButtonId); // descarta
          continue;
        }
        if (this.isBot(r)) {
          let at = this.botAt.get(r.seat.id);
          if (at === undefined) {
            at = 0.6 + this.ctx.rng.next() * 2.4;
            this.botAt.set(r.seat.id, at);
          }
          if (this.phaseT >= at) this.picks.set(r.seat.id, DIRS[Math.floor(this.ctx.rng.next() * 4)]!);
        } else {
          for (const d of DIRS)
            if (this.pressed(r, d as ButtonId)) {
              this.picks.set(r.seat.id, d);
              this.ctx.vibrate(r.seat.id, 25);
              break;
            }
        }
        if (this.picks.has(r.seat.id)) {
          // Mostra só que já escolheu (não para onde).
          const m = textSprite('✔', { height: 0.6, color: '#4cd964', stroke: '#1d1433' });
          const pos = r.model.root.position;
          m.position.set(pos.x, pos.y + 3.2, pos.z);
          this.scene.add(m);
          this.marks.push(m);
          sound.play('tick', { vol: 0.4 });
        }
      }
      if (this.phaseT >= CHOOSE || players.every((r) => this.picks.has(r.seat.id))) this.reveal(players);
    } else if (this.phaseT >= REVEAL) {
      if (!this.group.some((r) => r.alive) || this.turn >= TURNS) {
        this.endGame();
        return;
      }
      this.turn++;
      this.phase = 'choose';
      this.phaseT = 0;
      this.picks.clear();
      this.botAt.clear();
      this.clearMarks();
      for (const r of this.row) this.look(r, null);
      this.solo?.model.setAnim('idle');
      // Carregadelas feitas durante a revelação não contam para a vez seguinte.
      for (const r of this.row) for (const d of DIRS) this.pressed(r, d as ButtonId);
      this.showSign(`Vez ${this.turn} de ${TURNS}: escolhe!`);
    }
  }

  private reveal(players: Rower[]): void {
    this.phase = 'reveal';
    this.phaseT = 0;
    this.timerBar.scale.x = 0.01;
    this.clearMarks();
    // Quem não escolheu olha ao calhas.
    for (const r of players) if (!this.picks.has(r.seat.id)) this.picks.set(r.seat.id, DIRS[Math.floor(this.ctx.rng.next() * 4)]!);
    sound.play('whoosh');
    const soloDir = this.solo ? this.picks.get(this.solo.seat.id)! : null;
    for (const r of players) {
      const d = this.picks.get(r.seat.id)!;
      this.look(r, d);
      const m = textSprite(ARROW[d], { height: 1, color: '#ffffff' });
      const pos = r.model.root.position;
      m.position.set(pos.x, pos.y + (r === this.solo ? 4 : 3.3), pos.z);
      this.scene.add(m);
      this.marks.push(m);
    }
    let caught = 0;
    for (const r of this.group) {
      if (!r.alive || this.picks.get(r.seat.id) !== soloDir) continue;
      this.knockOut(r);
      caught++;
      r.model.setAnim('sad');
      r.model.setFaded(true);
      this.float('❌ Apanhado!', r.model.root.position.x, 2.8, '#ff5a5f', 0.6, 1);
      this.ctx.vibrate(r.seat.id, 300);
    }
    if (caught) {
      sound.play('hit');
      this.solo?.model.setAnim('cheer');
      if (this.solo) this.ctx.vibrate(this.solo.seat.id, 80);
      this.showSign(caught === 1 ? 'Apanhou um!' : `Apanhou ${caught}!`, '#ff6b7a');
    } else {
      sound.play('coin');
      this.showSign('Ninguém olhou para o mesmo lado!', '#4cd964');
    }
  }

  override endGame(): void {
    this.clearMarks();
    super.endGame();
  }
}

export const LookAway: MinigameDef = {
  id: 'olha-lado',
  rounds: 3,
  name: 'Olha para o Lado',
  modes: ['oneVsAll'],
  description: () =>
    'Todos escolhem em segredo uma direção na cruz. Depois olham ao mesmo tempo: quem do grupo olhar para o MESMO lado que o solitário sai! O solitário tem 5 vezes para apanhar toda a gente.',
  controls: '✚ Escolher o lado para onde olhas',
  stick: 'dpad',
  buttons: [],
  create: (ctx) => new LookAwayRun(ctx),
};
