import { describe, it, expect } from 'vitest';
import {
  splitAmount,
  computeBalances,
  applyConfirmedSettlements,
} from '../src/domain/balances';
import type { Address, Expense, Settlement } from '../src/domain/types';

const ALICE = '0x1111111111111111111111111111111111111111' as Address;
const BOB = '0x2222222222222222222222222222222222222222' as Address;
const CAROL = '0x3333333333333333333333333333333333333333' as Address;

function expense(partial: Partial<Expense>): Expense {
  return {
    id: 'e',
    groupId: 'g',
    description: '',
    amountMicro: 0n,
    paidBy: ALICE,
    shares: [],
    createdAt: 0,
    createdBy: ALICE,
    ...partial,
  };
}

describe('splitAmount', () => {
  it('splits evenly with no remainder', () => {
    const out = splitAmount(90_000_000n, [
      { member: ALICE, weight: 1 },
      { member: BOB, weight: 1 },
      { member: CAROL, weight: 1 },
    ]);
    expect(out.get(ALICE)).toBe(30_000_000n);
    expect(out.get(BOB)).toBe(30_000_000n);
    expect(out.get(CAROL)).toBe(30_000_000n);
  });

  it('distributes a leftover µCRC deterministically and loses nothing', () => {
    const out = splitAmount(10_000_000n, [
      { member: ALICE, weight: 1 },
      { member: BOB, weight: 1 },
      { member: CAROL, weight: 1 },
    ]);
    // smallest address wins the tie-break on equal fractional remainder
    expect(out.get(ALICE)).toBe(3_333_334n);
    expect(out.get(BOB)).toBe(3_333_333n);
    expect(out.get(CAROL)).toBe(3_333_333n);
    const sum = [...out.values()].reduce((s, x) => s + x, 0n);
    expect(sum).toBe(10_000_000n); // cent-perfect: exactly the total
  });

  it('respects weights', () => {
    const out = splitAmount(100_000_000n, [
      { member: ALICE, weight: 3 },
      { member: BOB, weight: 1 },
    ]);
    expect(out.get(ALICE)).toBe(75_000_000n);
    expect(out.get(BOB)).toBe(25_000_000n);
  });

  it('throws on non-positive total weight', () => {
    expect(() => splitAmount(10n, [])).toThrow();
  });
});

describe('computeBalances', () => {
  it('matches the §11 worked example', () => {
    const expenses = [
      expense({ id: 'airbnb', amountMicro: 90_000_000n, paidBy: ALICE, shares: equal() }),
      expense({ id: 'dinner', amountMicro: 30_000_000n, paidBy: BOB, shares: equal() }),
      expense({ id: 'train', amountMicro: 15_000_000n, paidBy: CAROL, shares: equal() }),
    ];
    const bal = computeBalances([ALICE, BOB, CAROL], expenses);
    expect(bal.get(ALICE)).toBe(45_000_000n);
    expect(bal.get(BOB)).toBe(-15_000_000n);
    expect(bal.get(CAROL)).toBe(-30_000_000n);
  });

  it('ignores voided expenses', () => {
    const expenses = [
      expense({ id: 'a', amountMicro: 90_000_000n, paidBy: ALICE, shares: equal() }),
      expense({ id: 'v', amountMicro: 30_000_000n, paidBy: BOB, shares: equal(), voided: true }),
    ];
    const bal = computeBalances([ALICE, BOB, CAROL], expenses);
    expect(bal.get(ALICE)).toBe(60_000_000n);
    expect(bal.get(BOB)).toBe(-30_000_000n);
    expect(bal.get(CAROL)).toBe(-30_000_000n);
  });

  it('balances always sum to zero', () => {
    const expenses = [
      expense({ id: 'a', amountMicro: 10_000_000n, paidBy: ALICE, shares: equal() }),
      expense({ id: 'b', amountMicro: 7_000_000n, paidBy: CAROL, shares: equal() }),
    ];
    const bal = computeBalances([ALICE, BOB, CAROL], expenses);
    const sum = [...bal.values()].reduce((s, x) => s + x, 0n);
    expect(sum).toBe(0n);
  });
});

describe('applyConfirmedSettlements', () => {
  it('moves both parties toward zero, ignoring unconfirmed', () => {
    const bal = new Map<Address, bigint>([
      [ALICE, 45_000_000n],
      [CAROL, -30_000_000n],
    ]);
    const settlements: Settlement[] = [
      settle({ from: CAROL, to: ALICE, amountMicro: 30_000_000n, status: 'confirmed' }),
      settle({ from: CAROL, to: ALICE, amountMicro: 5_000_000n, status: 'proposed' }),
    ];
    const out = applyConfirmedSettlements(bal, settlements);
    expect(out.get(CAROL)).toBe(0n);
    expect(out.get(ALICE)).toBe(15_000_000n);
  });
});

function equal() {
  return [
    { member: ALICE, weight: 1 },
    { member: BOB, weight: 1 },
    { member: CAROL, weight: 1 },
  ];
}

function settle(partial: Partial<Settlement>): Settlement {
  return {
    id: 's',
    groupId: 'g',
    from: ALICE,
    to: BOB,
    amountMicro: 0n,
    intentToken: 't',
    status: 'proposed',
    createdAt: 0,
    ...partial,
  };
}
