import { describe, it, expect } from 'vitest';
import { minimalSettlement } from '../src/domain/settle';
import { computeBalances } from '../src/domain/balances';
import type { Address, Expense } from '../src/domain/types';

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
    shares: [
      { member: ALICE, weight: 1 },
      { member: BOB, weight: 1 },
      { member: CAROL, weight: 1 },
    ],
    createdAt: 0,
    createdBy: ALICE,
    ...partial,
  };
}

describe('minimalSettlement', () => {
  it('collapses the §11 trip into two transfers, both to Alice', () => {
    const bal = computeBalances([ALICE, BOB, CAROL], [
      expense({ id: 'airbnb', amountMicro: 90_000_000n, paidBy: ALICE }),
      expense({ id: 'dinner', amountMicro: 30_000_000n, paidBy: BOB }),
      expense({ id: 'train', amountMicro: 15_000_000n, paidBy: CAROL }),
    ]);
    const plan = minimalSettlement(bal);
    expect(plan).toEqual([
      { from: CAROL, to: ALICE, amountMicro: 30_000_000n },
      { from: BOB, to: ALICE, amountMicro: 15_000_000n },
    ]);
  });

  it('returns no transfers when everyone is square', () => {
    const bal = new Map<Address, bigint>([
      [ALICE, 0n],
      [BOB, 0n],
    ]);
    expect(minimalSettlement(bal)).toEqual([]);
  });

  it('never needs more than n-1 transfers', () => {
    const bal = new Map<Address, bigint>([
      [ALICE, 30_000_000n],
      [BOB, -10_000_000n],
      [CAROL, -20_000_000n],
    ]);
    const plan = minimalSettlement(bal);
    expect(plan.length).toBeLessThanOrEqual(2);
  });

  it('produces transfers that exactly clear all balances', () => {
    const bal = new Map<Address, bigint>([
      [ALICE, 17_000_000n],
      [BOB, -5_000_000n],
      [CAROL, -12_000_000n],
    ]);
    const plan = minimalSettlement(bal);
    const net = new Map(bal);
    for (const t of plan) {
      net.set(t.from, (net.get(t.from) ?? 0n) + t.amountMicro);
      net.set(t.to, (net.get(t.to) ?? 0n) - t.amountMicro);
    }
    for (const v of net.values()) expect(v).toBe(0n);
  });
});
