/** Smallest and largest total a player may raise to (or bet), as reported by the server. */
export interface RaiseBounds {
  readonly min: bigint;
  readonly max: bigint;
}

export interface RaisePreset {
  readonly label: string;
  readonly to: bigint;
}

export function clampRaise(value: bigint, bounds: RaiseBounds): bigint {
  if (value < bounds.min) return bounds.min;
  return value > bounds.max ? bounds.max : value;
}

/** Accepts digits with optional thousands separators or spaces; returns null for anything else. */
export function parseChipsInput(text: string): bigint | null {
  const cleaned = text.replace(/[,\s]/g, '');
  return /^\d{1,15}$/.test(cleaned) ? BigInt(cleaned) : null;
}

export interface PresetContext {
  /** Everything in the middle, including bets in front of players. */
  readonly pot: bigint;
  readonly currentBet: bigint;
  /** Chips still needed to call, ignoring stack size. */
  readonly toCall: bigint;
  readonly bounds: RaiseBounds;
}

/** Common sizings: minimum, fractions of the pot after a call, and all-in; duplicates collapse. */
export function raisePresets({ pot, currentBet, toCall, bounds }: PresetContext): RaisePreset[] {
  const potAfterCall = pot + toCall;
  const candidates: RaisePreset[] = [
    { label: 'Min', to: bounds.min },
    { label: '½ pot', to: currentBet + potAfterCall / 2n },
    { label: '¾ pot', to: currentBet + (potAfterCall * 3n) / 4n },
    { label: 'Pot', to: currentBet + potAfterCall },
    { label: 'All-in', to: bounds.max },
  ];
  const seen = new Set<bigint>();
  const result: RaisePreset[] = [];
  for (const candidate of candidates) {
    const to = clampRaise(candidate.to, bounds);
    if (seen.has(to)) continue;
    seen.add(to);
    result.push({ label: candidate.label, to });
  }
  return result;
}
