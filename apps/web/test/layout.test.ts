import { describe, expect, it } from 'vitest';
import { BOARD_CARD, SEAT_PANEL, WORLD, betPosition, boardCardPosition, center, seatPosition } from '../src/game/layout';

describe('table layout', () => {
  const seats = [0, 1, 2, 3, 4, 5].map((i) => seatPosition(i, 6, 0));

  it('keeps every seat panel inside the canvas', () => {
    for (const { x, y } of seats) {
      expect(x - SEAT_PANEL.width / 2).toBeGreaterThanOrEqual(0);
      expect(x + SEAT_PANEL.width / 2).toBeLessThanOrEqual(WORLD.width);
      expect(y - SEAT_PANEL.height / 2).toBeGreaterThanOrEqual(0);
      expect(y + SEAT_PANEL.height / 2).toBeLessThanOrEqual(WORLD.height);
    }
  });

  it('places side seats\' bets clear of the community cards, so amounts are never hidden', () => {
    const boardLeft = boardCardPosition(0).x - BOARD_CARD.width / 2;
    const boardRight = boardCardPosition(4).x + BOARD_CARD.width / 2;
    const amountHalfWidth = 45; // chip plus a wide number such as "1,000"

    for (const seat of seats.filter((s) => Math.abs(s.x - center.x) >= 150)) {
      const { x } = betPosition(seat);
      const near = seat.x < center.x ? x + amountHalfWidth : x - amountHalfWidth;
      if (seat.x < center.x) expect(near).toBeLessThan(boardLeft);
      else expect(near).toBeGreaterThan(boardRight);
    }
  });

  it('places the bottom seat\'s bet above its own cards', () => {
    const bottom = seats[0]!;
    expect(betPosition(bottom).y).toBeLessThan(bottom.y - SEAT_PANEL.height / 2 - 84 - 4);
  });
});
