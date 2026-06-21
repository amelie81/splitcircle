import { describe, it, expect } from 'vitest';
import { grossDebts } from '../src/domain/settle';
import type { Expense, Address } from '../src/domain/types';

const A = '0xaaaa000000000000000000000000000000000000' as Address;
const B = '0xbbbb000000000000000000000000000000000000' as Address;
const C = '0xcccc000000000000000000000000000000000000' as Address;

function expense(paidBy: Address, amountMicro: bigint, members: Address[]): Expense {
  return {
    id: Math.random().toString(36).slice(2),
    groupId: 'g',
    description: 'x',
    amountMicro,
    paidBy,
    shares: members.map((m) => ({ member: m, weight: 1 })),
    createdAt: 0,
    createdBy: paidBy,
  };
}

describe('grossDebts', () => {
  it('returns direct IOUs from a single expense', () => {
    // A pays 90 split 3 ways → B owes A 30, C owes A 30
    const g = grossDebts([expense(A, 90_000_000n, [A, B, C])]);
    expect(g).toEqual([
      { from: B, to: A, amountMicro: 30_000_000n },
      { from: C, to: A, amountMicro: 30_000_000n },
    ]);
  });

  it('nets opposing debts between a pair', () => {
    // A pays 30 (A,B) → B owes A 15; B pays 10 (A,B) → A owes B 5; net B→A 10
    const g = grossDebts([
      expense(A, 30_000_000n, [A, B]),
      expense(B, 10_000_000n, [A, B]),
    ]);
    expect(g).toEqual([{ from: B, to: A, amountMicro: 10_000_000n }]);
  });

  it('drops fully-cancelled pairs', () => {
    const g = grossDebts([
      expense(A, 20_000_000n, [A, B]),
      expense(B, 20_000_000n, [A, B]),
    ]);
    expect(g).toEqual([]);
  });

  it('ignores voided expenses', () => {
    const e = expense(A, 90_000_000n, [A, B, C]);
    e.voided = true;
    expect(grossDebts([e])).toEqual([]);
  });
});
