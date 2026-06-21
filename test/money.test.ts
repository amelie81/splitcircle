import { describe, it, expect } from 'vitest';
import {
  parseCrc,
  formatCrc,
  microToPathfinder,
  pathfinderToMicro,
} from '../src/domain/money';

describe('parseCrc', () => {
  it('parses whole and fractional amounts', () => {
    expect(parseCrc('12.5')).toBe(12_500_000n);
    expect(parseCrc('12')).toBe(12_000_000n);
    expect(parseCrc('0.000001')).toBe(1n); // smallest unit
  });

  it('accepts comma decimal separator', () => {
    expect(parseCrc('12,50')).toBe(12_500_000n);
  });

  it('rejects junk', () => {
    for (const bad of ['1.2345678', '12.', '.5', '-5', 'abc', '', '1.2.3']) {
      expect(() => parseCrc(bad)).toThrow();
    }
  });
});

describe('formatCrc', () => {
  it('formats banking-style with 2 decimals', () => {
    expect(formatCrc(12_500_000n)).toBe('12.50');
    expect(formatCrc(-15_000_000n)).toBe('-15.00');
    expect(formatCrc(0n)).toBe('0.00');
  });

  it('honors a custom decimal count', () => {
    expect(formatCrc(12_345_678n, 6)).toBe('12.345678');
    expect(formatCrc(12_500_000n, 0)).toBe('12');
  });
});

describe('pathfinder conversion', () => {
  it('round-trips µCRC through the protocol unit', () => {
    for (const x of [0n, 1n, 12_500_000n, 999_999_999n]) {
      expect(pathfinderToMicro(microToPathfinder(x))).toBe(x);
    }
  });
});
