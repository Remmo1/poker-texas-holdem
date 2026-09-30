import { HAND_CATEGORY_NAMES, formatChips } from '../lib/format';
import type { TableView } from '../net/tableView';
import {
  BOARD_CARD,
  MY_CARD,
  OPPONENT_CARD,
  SEAT_PANEL,
  betPosition,
  boardCardPosition,
  center,
  dealerButtonPosition,
  potPosition,
  seatPosition,
} from './layout';
import type { Point } from './layout';

export interface RenderModel {
  readonly view: TableView | null;
  /** True when the viewer is not seated and may click an empty seat. */
  readonly canSit: boolean;
}

export interface SeatPlan {
  readonly seat: number;
  readonly position: Point;
  readonly occupied: boolean;
  readonly name: string;
  readonly stack: string;
  readonly status: 'empty' | 'waiting' | 'active' | 'folded' | 'allin';
  readonly isMe: boolean;
  readonly isToAct: boolean;
  readonly clickable: boolean;
  readonly bet: { readonly text: string; readonly position: Point } | null;
  readonly dealerButton: Point | null;
  readonly award: bigint | null;
  readonly handName: string | null;
}

export interface CardPlan {
  /** Stable identity: the same key across renders means the same physical card. */
  readonly key: string;
  readonly position: Point;
  readonly width: number;
  readonly height: number;
  /** Wire form of the card, or null to draw its back. */
  readonly face: string | null;
}

export interface TablePlan {
  readonly seats: readonly SeatPlan[];
  readonly cards: readonly CardPlan[];
  readonly pot: { readonly text: string; readonly position: Point } | null;
  readonly toAct: { readonly position: Point; readonly deadline: number; readonly durationMs: number } | null;
}

const EMPTY_PLAN: TablePlan = { seats: [], cards: [], pot: null, toAct: null };

/** Turns table state into what should be on screen. Pure, so it is testable without a canvas. */
export function planTable({ view, canSit }: RenderModel): TablePlan {
  if (!view) return EMPTY_PLAN;

  const { hand } = view;
  const anchor = view.mySeat ?? 0;
  const seats: SeatPlan[] = [];
  const cards: CardPlan[] = [];
  let toAct: TablePlan['toAct'] = null;

  for (let index = 0; index < view.config.maxSeats; index++) {
    const position = seatPosition(index, view.config.maxSeats, anchor);
    const occupant = view.seats[index];
    const isMe = index === view.mySeat;
    const reveal = hand?.reveals[index];
    const awards = hand?.awards.filter((a) => a.seat === index) ?? [];

    seats.push({
      seat: index,
      position,
      occupied: occupant !== undefined,
      name: occupant?.username ?? '',
      stack: occupant ? formatChips(occupant.stack) : '',
      status: occupant?.status ?? 'empty',
      isMe,
      isToAct: hand?.toAct === index,
      clickable: occupant === undefined && canSit,
      bet: occupant && occupant.bet > 0n ? { text: formatChips(occupant.bet), position: betPosition(position) } : null,
      dealerButton: hand && hand.buttonSeat === index && occupant ? dealerButtonPosition(position) : null,
      award: awards.length > 0 ? awards.reduce((sum, a) => sum + a.amount, 0n) : null,
      handName: reveal ? (HAND_CATEGORY_NAMES[reveal.category] ?? null) : null,
    });

    if (hand && hand.toAct === index && hand.deadline !== null) {
      toAct = { position, deadline: hand.deadline, durationMs: view.config.actionTimeMs };
    }

    if (!hand || !occupant?.hasCards) continue;
    // Folded players muck their cards; a revealed hand stays visible through the showdown.
    if (occupant.status === 'folded' && !reveal) continue;

    const faces: readonly (string | null)[] = reveal ? reveal.cards : isMe && view.myCards ? view.myCards : [null, null];
    const size = isMe ? MY_CARD : OPPONENT_CARD;
    // Cards go on the side of the panel that faces away from the table edge.
    const below = position.y < center.y;
    const y = position.y + (below ? 1 : -1) * (SEAT_PANEL.height / 2 + size.height / 2 + 4);
    // Own cards sit side by side so both ranks stay readable; opponents' backs may overlap.
    const spread = isMe ? 0.56 : 0.3;
    faces.forEach((face, i) => {
      cards.push({
        key: `${hand.handId}:seat-${index}:${i}`,
        position: { x: position.x + (i === 0 ? -1 : 1) * size.width * spread, y },
        width: size.width,
        height: size.height,
        face,
      });
    });
  }

  if (hand) {
    hand.board.forEach((card, i) => {
      cards.push({
        key: `${hand.handId}:board:${i}`,
        position: boardCardPosition(i),
        width: BOARD_CARD.width,
        height: BOARD_CARD.height,
        face: card,
      });
    });
  }

  return {
    seats,
    cards,
    pot: hand && hand.pot > 0n ? { text: `Pot ${formatChips(hand.pot)}`, position: potPosition } : null,
    toAct,
  };
}
