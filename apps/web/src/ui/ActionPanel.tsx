import { useEffect, useMemo, useState } from 'react';
import { controller, useApp } from '../runtime';
import { formatChips } from '../lib/format';
import { clampRaise, parseChipsInput, raisePresets } from '../lib/raise';
import { useCountdown } from './useCountdown';

const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function ActionPanel() {
  const view = useApp((s) => s.view);
  const [busy, setBusy] = useState(false);
  const hand = view?.hand ?? null;
  const mySeat = view?.mySeat ?? null;
  const me = view && mySeat !== null ? view.seats[mySeat] : undefined;
  const legal = hand && hand.toAct === mySeat ? hand.legal : null;
  const seconds = useCountdown(hand?.deadline ?? null);

  const bounds = legal?.raise ?? null;
  const [raiseTo, setRaiseTo] = useState<bigint>(0n);
  // A new decision point starts from the minimum raise.
  useEffect(() => {
    if (bounds) setRaiseTo(bounds.min);
  }, [hand?.actionSeq, bounds?.min, bounds?.max]);

  const send = async (action: Parameters<typeof controller.act>[0]) => {
    if (busy) return;
    setBusy(true);
    try {
      await controller.act(action);
    } finally {
      setBusy(false);
    }
  };

  const doFold = () => void send({ type: 'fold' });
  const doPassive = () => void send(legal?.canCheck ? { type: 'check' } : { type: 'call' });
  const doRaise = () => {
    if (!bounds) return;
    const to = clampRaise(raiseTo, bounds);
    void send(to === bounds.max ? { type: 'allin' } : { type: bounds.kind, to: to.toString() });
  };

  // Keyboard: F folds, C checks/calls. Ignored while typing in a field.
  useEffect(() => {
    if (!legal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || FIELD_TAGS.has((e.target as HTMLElement).tagName)) return;
      if (e.key === 'f') doFold();
      if (e.key === 'c') doPassive();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const presets = useMemo(
    () =>
      hand && legal && bounds
        ? raisePresets({ pot: hand.pot, currentBet: hand.currentBet, toCall: hand.currentBet - (me?.bet ?? 0n), bounds })
        : [],
    [hand?.actionSeq, hand?.pot, bounds?.min, bounds?.max],
  );

  if (!view || !me) return null;

  if (!legal || !hand) {
    const actor = hand?.toAct != null ? view.seats[hand.toAct] : undefined;
    return (
      <section className="actions idle">
        <span className="muted">
          {hand && !hand.ended
            ? actor
              ? `Waiting for ${actor.username}${seconds !== null ? ` (${seconds}s)` : ''}…`
              : 'Dealing…'
            : 'Waiting for the next hand…'}
        </span>
        <button onClick={() => void controller.stand()}>Leave table</button>
      </section>
    );
  }

  const allInCall = legal.canCall && legal.toCall >= me.stack;
  const raiseLabel = bounds ? (clampRaise(raiseTo, bounds) === bounds.max ? 'All-in' : bounds.kind === 'bet' ? 'Bet' : 'Raise to') : '';

  return (
    <section className="actions">
      <div className="actions-main">
        <span className="turn">Your turn{seconds !== null ? ` · ${seconds}s` : ''}</span>
        <button className="danger" disabled={busy} onClick={doFold}>
          Fold <kbd>F</kbd>
        </button>
        <button className="primary" disabled={busy} onClick={doPassive}>
          {legal.canCheck ? 'Check' : allInCall ? `Call ${formatChips(legal.toCall)} (all-in)` : `Call ${formatChips(legal.toCall)}`} <kbd>C</kbd>
        </button>
      </div>

      {bounds && (
        <div className="raise">
          <div className="presets">
            {presets.map((p) => (
              <button key={p.label} type="button" onClick={() => setRaiseTo(p.to)}>
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={Number(bounds.min)}
            max={Number(bounds.max)}
            value={Number(clampRaise(raiseTo, bounds))}
            onChange={(e) => setRaiseTo(clampRaise(BigInt(e.target.value), bounds))}
            aria-label="Raise amount"
          />
          <input
            className="amount"
            inputMode="numeric"
            value={raiseTo.toString()}
            onChange={(e) => {
              const parsed = parseChipsInput(e.target.value);
              if (parsed !== null) setRaiseTo(parsed);
            }}
            onBlur={() => setRaiseTo(clampRaise(raiseTo, bounds))}
            onKeyDown={(e) => e.key === 'Enter' && doRaise()}
            aria-label="Raise to"
          />
          <button className="primary" disabled={busy} onClick={doRaise}>
            {raiseLabel} {formatChips(clampRaise(raiseTo, bounds))}
          </button>
        </div>
      )}
    </section>
  );
}
