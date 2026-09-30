export const WORLD = { width: 1440, height: 720 } as const;

const TABLE_CENTER = { x: 720, y: 320 } as const;
const SEAT_RING = { rx: 590, ry: 250 } as const;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const center: Point = TABLE_CENTER;

/** The felt, slightly inside the seat ring. */
export const FELT = { x: TABLE_CENTER.x, y: TABLE_CENTER.y, rx: 500, ry: 205 } as const;

export const SEAT_PANEL = { width: 160, height: 58 } as const;
export const BOARD_CARD = { width: 62, height: 88, gap: 12 } as const;
export const MY_CARD = { width: 60, height: 84 } as const;
export const OPPONENT_CARD = { width: 42, height: 60 } as const;
export const DECK_POSITION: Point = { x: TABLE_CENTER.x, y: TABLE_CENTER.y - 175 };

/** Seats sit evenly on an ellipse; the anchor seat (the viewer's own) is placed at the bottom. */
export function seatPosition(seat: number, maxSeats: number, anchorSeat: number): Point {
  const angle = Math.PI / 2 + ((seat - anchorSeat) * 2 * Math.PI) / maxSeats;
  return {
    x: TABLE_CENTER.x + SEAT_RING.rx * Math.cos(angle),
    y: TABLE_CENTER.y + SEAT_RING.ry * Math.sin(angle),
  };
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * Where a seat's chips for the current round sit. Top and bottom seats push them toward the pot to clear
 * their own cards; side seats keep them beside the panel so they never land under the board.
 */
export function betPosition(seat: Point): Point {
  if (Math.abs(seat.x - TABLE_CENTER.x) < 150) return lerp(seat, TABLE_CENTER, 0.6);
  const side = seat.x < TABLE_CENTER.x ? 1 : -1;
  return { x: seat.x + side * (SEAT_PANEL.width / 2 + 100), y: seat.y + (TABLE_CENTER.y - seat.y) * 0.25 };
}

/** Beside the seat panel, on the side facing the table, so it never covers cards or chips. */
export function dealerButtonPosition(seat: Point): Point {
  const side = seat.x <= TABLE_CENTER.x ? 1 : -1;
  return { x: seat.x + side * (SEAT_PANEL.width / 2 + 24), y: seat.y };
}

export const boardCardPosition = (index: number): Point => ({
  x: TABLE_CENTER.x + (index - 2) * (BOARD_CARD.width + BOARD_CARD.gap),
  y: TABLE_CENTER.y - 30,
});

export const potPosition: Point = { x: TABLE_CENTER.x, y: TABLE_CENTER.y + 50 };
