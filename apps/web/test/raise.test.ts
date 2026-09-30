import { describe, expect, it } from 'vitest';
import { clampRaise, parseChipsInput, raisePresets } from '../src/lib/raise';

describe('clampRaise', () => {
  const bounds = { min: 40n, max: 500n };
  it('keeps values within the server-provided bounds', () => {
    expect(clampRaise(10n, bounds)).toBe(40n);
    expect(clampRaise(100n, bounds)).toBe(100n);
    expect(clampRaise(9_999n, bounds)).toBe(500n);
  });
});

describe('parseChipsInput', () => {
  it('accepts plain and grouped numbers', () => {
    expect(parseChipsInput('250')).toBe(250n);
    expect(parseChipsInput('1,250')).toBe(1250n);
    expect(parseChipsInput(' 1 250 ')).toBe(1250n);
  });
  it.each(['', 'abc', '-5', '12.5', '1e3', '9'.repeat(16)])('rejects %j', (text) => {
    expect(parseChipsInput(text)).toBeNull();
  });
});

describe('raisePresets', () => {
  it('sizes raises from the pot after a call', () => {
    // 100 in the middle, 20 to call, bet is 20: pot-sized raise is to 20 + (100 + 20) = 140.
    const presets = raisePresets({ pot: 100n, currentBet: 20n, toCall: 20n, bounds: { min: 40n, max: 1000n } });
    expect(presets).toEqual([
      { label: 'Min', to: 40n },
      { label: '½ pot', to: 80n },
      { label: '¾ pot', to: 110n },
      { label: 'Pot', to: 140n },
      { label: 'All-in', to: 1000n },
    ]);
  });

  it('sizes an opening bet as a fraction of the pot', () => {
    const presets = raisePresets({ pot: 200n, currentBet: 0n, toCall: 0n, bounds: { min: 20n, max: 900n } });
    expect(presets.find((p) => p.label === 'Pot')?.to).toBe(200n);
    expect(presets.find((p) => p.label === '½ pot')?.to).toBe(100n);
  });

  it('clamps to the bounds and drops duplicates', () => {
    const presets = raisePresets({ pot: 30n, currentBet: 20n, toCall: 20n, bounds: { min: 40n, max: 44n } });
    expect(presets.map((p) => p.to)).toEqual([40n, 44n]);
    expect(raisePresets({ pot: 30n, currentBet: 20n, toCall: 20n, bounds: { min: 60n, max: 60n } })).toEqual([
      { label: 'Min', to: 60n },
    ]);
  });
});
