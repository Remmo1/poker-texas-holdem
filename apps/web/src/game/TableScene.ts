import Phaser from 'phaser';
import { formatChips } from '../lib/format';
import { CardSprite } from './CardSprite';
import { DECK_POSITION, FELT, SEAT_PANEL } from './layout';
import { planTable } from './plan';
import type { CardPlan, RenderModel, SeatPlan, TablePlan } from './plan';

const FONT = 'Arial, Helvetica, sans-serif';
const COLORS = {
  panel: 0x1b2733,
  panelEmpty: 0x14202b,
  border: 0x3b4a5a,
  me: 0x34d399,
  toAct: 0xfbbf24,
  felt: 0x0f5132,
  feltEdge: 0x3f2a14,
  chip: 0xf59e0b,
};

export interface SceneCallbacks {
  onSeatClick(seat: number): void;
}

/** Draws the table from a `RenderModel`. All decisions live in `planTable`; this only paints them. */
export class TableScene extends Phaser.Scene {
  private model: RenderModel = { view: null, canSit: false };
  private now: () => number = () => Date.now();
  private plan: TablePlan = { seats: [], cards: [], pot: null, toAct: null };
  private ready = false;
  private dynamic!: Phaser.GameObjects.Container;
  private timerBar!: Phaser.GameObjects.Graphics;
  private readonly cards = new Map<string, CardSprite>();
  private readonly announcedAwards = new Set<string>();

  constructor(private readonly callbacks: SceneCallbacks) {
    super('table');
  }

  create(): void {
    this.drawFelt();
    this.dynamic = this.add.container(0, 0).setDepth(3); // above the cards, so chip amounts are never hidden
    this.timerBar = this.add.graphics().setDepth(5);
    this.ready = true;
    this.render();
  }

  setModel(model: RenderModel, now: () => number): void {
    this.model = model;
    this.now = now;
    if (this.ready) this.render();
  }

  override update(): void {
    if (!this.ready) return;
    this.drawTimer();
  }

  private render(): void {
    this.plan = planTable(this.model);
    this.dynamic.removeAll(true);
    this.syncCards(this.plan.cards);
    for (const seat of this.plan.seats) this.drawSeat(seat);
    this.drawPot();
    this.announceAwards();
  }

  private drawFelt(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.feltEdge, 1).fillEllipse(FELT.x, FELT.y, FELT.rx * 2 + 34, FELT.ry * 2 + 34);
    g.fillStyle(COLORS.felt, 1).fillEllipse(FELT.x, FELT.y, FELT.rx * 2, FELT.ry * 2);
    g.lineStyle(3, 0x1f7a4d, 1).strokeEllipse(FELT.x, FELT.y, FELT.rx * 2 - 40, FELT.ry * 2 - 40);
  }

  private text(x: number, y: number, value: string, size: number, color = '#ffffff', bold = false): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal' })
      .setOrigin(0.5)
      .setResolution(2);
    this.dynamic.add(t);
    return t;
  }

  private drawSeat(seat: SeatPlan): void {
    const { x, y } = seat.position;
    const { width, height } = SEAT_PANEL;
    const g = this.add.graphics();
    this.dynamic.add(g);

    if (!seat.occupied) {
      g.fillStyle(COLORS.panelEmpty, seat.clickable ? 0.85 : 0.35).fillRoundedRect(x - width / 2, y - height / 2, width, height, 12);
      g.lineStyle(2, seat.clickable ? COLORS.me : COLORS.border, seat.clickable ? 1 : 0.4).strokeRoundedRect(x - width / 2, y - height / 2, width, height, 12);
      if (seat.clickable) {
        this.text(x, y, 'Sit here', 16, '#a7f3d0', true);
        const hit = this.add.zone(x, y, width, height).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => this.callbacks.onSeatClick(seat.seat));
        this.dynamic.add(hit);
      }
      return;
    }

    const border = seat.isToAct ? COLORS.toAct : seat.isMe ? COLORS.me : COLORS.border;
    const dim = seat.departed || seat.status === 'folded' || seat.status === 'waiting' ? 0.6 : 1;
    g.fillStyle(COLORS.panel, dim).fillRoundedRect(x - width / 2, y - height / 2, width, height, 12);
    g.lineStyle(seat.isToAct ? 4 : 2, border, 1).strokeRoundedRect(x - width / 2, y - height / 2, width, height, 12);

    this.text(x, y - 11, seat.name, 15, seat.isMe ? '#a7f3d0' : '#e5e7eb', true).setAlpha(dim);
    this.text(x, y + 11, seat.status === 'allin' ? `${seat.stack} · ALL-IN` : seat.stack, 15, '#fcd34d').setAlpha(dim);
    if (seat.departed) this.text(x, y + height / 2 + 12, 'Left the table', 12, '#9ca3af');
    else if (seat.status === 'folded') this.text(x, y + height / 2 + 12, 'Folded', 12, '#9ca3af');
    if (seat.handName) this.text(x, y + height / 2 + 14, seat.handName, 13, '#fde68a', true);

    if (seat.bet) {
      const { x: bx, y: by } = seat.bet.position;
      g.fillStyle(COLORS.chip, 1).fillCircle(bx - 26, by, 10);
      g.lineStyle(2, 0xffffff, 0.9).strokeCircle(bx - 26, by, 10);
      this.text(bx + 4, by, seat.bet.text, 15, '#ffffff', true);
    }

    if (seat.dealerButton) {
      const { x: dx, y: dy } = seat.dealerButton;
      g.fillStyle(0xffffff, 1).fillCircle(dx, dy, 14);
      g.lineStyle(2, 0x111827, 1).strokeCircle(dx, dy, 14);
      this.text(dx, dy, 'D', 15, '#111827', true);
    }
  }

  private drawPot(): void {
    if (!this.plan.pot) return;
    const { x, y } = this.plan.pot.position;
    this.text(x, y, this.plan.pot.text, 20, '#fef3c7', true);
  }

  /** Reuses card sprites across renders so only new cards animate in and only changed faces flip. */
  private syncCards(desired: readonly CardPlan[]): void {
    const keep = new Set(desired.map((c) => c.key));
    for (const [key, sprite] of this.cards) {
      if (keep.has(key)) continue;
      sprite.destroy();
      this.cards.delete(key);
    }

    let arrival = 0;
    for (const plan of desired) {
      let sprite = this.cards.get(plan.key);
      if (!sprite) {
        sprite = new CardSprite(this, DECK_POSITION.x, DECK_POSITION.y, plan.width, plan.height).setDepth(2);
        sprite.setAlpha(0);
        sprite.show(plan.face, false);
        this.tweens.add({ targets: sprite, x: plan.position.x, y: plan.position.y, alpha: 1, duration: 260, delay: 90 * arrival++, ease: 'Cubic.easeOut' });
        this.cards.set(plan.key, sprite);
      } else {
        sprite.show(plan.face, true);
        if (sprite.x !== plan.position.x || sprite.y !== plan.position.y) sprite.setPosition(plan.position.x, plan.position.y);
      }
    }
  }

  private announceAwards(): void {
    const handId = this.model.view?.hand?.handId ?? '';
    for (const seat of this.plan.seats) {
      if (seat.award === null) continue;
      const key = `${handId}:${seat.seat}:${seat.award}`;
      if (this.announcedAwards.has(key)) continue;
      this.announcedAwards.add(key);
      const label = this.add
        .text(seat.position.x, seat.position.y - SEAT_PANEL.height / 2 - 6, `+${formatChips(seat.award)}`, {
          fontFamily: FONT,
          fontSize: '26px',
          fontStyle: 'bold',
          color: '#86efac',
          stroke: '#052e16',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setResolution(2)
        .setDepth(10);
      this.tweens.add({ targets: label, y: label.y - 50, alpha: 0, duration: 2200, ease: 'Sine.easeOut', onComplete: () => label.destroy() });
    }
  }

  private drawTimer(): void {
    const g = this.timerBar;
    g.clear();
    const turn = this.plan.toAct;
    if (!turn) return;
    const fraction = Math.max(0, Math.min(1, (turn.deadline - this.now()) / turn.durationMs));
    const width = SEAT_PANEL.width - 16;
    const x = turn.position.x - width / 2;
    const y = turn.position.y + SEAT_PANEL.height / 2 - 9;
    g.fillStyle(0x000000, 0.5).fillRoundedRect(x, y, width, 6, 3);
    g.fillStyle(fraction > 0.33 ? 0x34d399 : 0xef4444, 1).fillRoundedRect(x, y, Math.max(2, width * fraction), 6, 3);
  }
}
