import Phaser from 'phaser';
import { SUIT_SYMBOLS, parseCardFace } from '../lib/format';

const FONT = 'Arial, Helvetica, sans-serif';
const FLIP_MS = 110;

/** A playing card drawn with primitives (no image assets). `face` null shows the back. */
export class CardSprite extends Phaser.GameObjects.Container {
  private shown: string | null | undefined;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly cardWidth: number,
    private readonly cardHeight: number,
  ) {
    super(scene, x, y);
    scene.add.existing(this);
  }

  /** Sets what the card shows, flipping if it was already visible with a different face. */
  show(face: string | null, animate: boolean): void {
    if (this.shown === face) return;
    const first = this.shown === undefined;
    this.shown = face;
    if (first || !animate) {
      this.draw(face);
      return;
    }
    this.scene.tweens.add({
      targets: this,
      scaleX: 0,
      duration: FLIP_MS,
      onComplete: () => {
        // The card may have been removed mid-flip (e.g. its player left); drawing then would crash Phaser's loop.
        if (!this.active) return;
        this.draw(face);
        this.scene.tweens.add({ targets: this, scaleX: 1, duration: FLIP_MS });
      },
    });
  }

  override destroy(fromScene?: boolean): void {
    this.scene?.tweens.killTweensOf(this);
    super.destroy(fromScene);
  }

  private draw(face: string | null): void {
    this.removeAll(true);
    const { cardWidth: w, cardHeight: h } = this;
    const g = this.scene.add.graphics();
    const radius = Math.max(4, w * 0.1);

    if (face === null) {
      g.fillStyle(0x1e3a8a, 1).fillRoundedRect(-w / 2, -h / 2, w, h, radius);
      g.lineStyle(2, 0xffffff, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
      g.lineStyle(1, 0x60a5fa, 0.9).strokeRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, radius / 2);
      this.add(g);
      return;
    }

    const { rank, suit, red } = parseCardFace(face);
    const color = red ? '#c0392b' : '#151515';
    g.fillStyle(0xfafafa, 1).fillRoundedRect(-w / 2, -h / 2, w, h, radius);
    g.lineStyle(1.5, 0x1f2937, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
    const corner = this.scene.add
      .text(-w / 2 + 5, -h / 2 + 3, `${rank}\n${SUIT_SYMBOLS[suit]}`, {
        fontFamily: FONT,
        fontSize: `${Math.round(w * 0.3)}px`,
        fontStyle: 'bold',
        color,
        align: 'center',
        lineSpacing: -4,
      })
      .setResolution(2);
    const pip = this.scene.add
      .text(w * 0.1, h * 0.12, SUIT_SYMBOLS[suit], { fontFamily: FONT, fontSize: `${Math.round(w * 0.62)}px`, color })
      .setOrigin(0.5)
      .setResolution(2);
    this.add([g, corner, pip]);
  }
}
