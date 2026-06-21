import type { Expense, Address, Settlement } from './types';

/** Split `total` µCRC across weighted shares with no rounding loss.
 *  Largest-remainder method: floor everyone, then hand the leftover
 *  micro-units one at a time to the largest fractional remainders. */
export function splitAmount(
  totalMicro: bigint,
  shares: { member: Address; weight: number }[],
): Map<Address, bigint> {
  const totalWeight = shares.reduce((s, x) => s + x.weight, 0);
  if (totalWeight <= 0) throw new Error('total weight must be > 0');
  const out = new Map<Address, bigint>();
  const remainders: { member: Address; frac: number }[] = [];
  let allocated = 0n;
  for (const s of shares) {
    // exact = total * weight / totalWeight, done in bigint then split frac
    const exactNum = totalMicro * BigInt(s.weight);
    const floor = exactNum / BigInt(totalWeight);
    const fracNum = Number(exactNum % BigInt(totalWeight)) / totalWeight;
    out.set(s.member, floor);
    allocated += floor;
    remainders.push({ member: s.member, frac: fracNum });
  }
  let leftover = totalMicro - allocated; // 0..(n-1) micro-units
  // largest fractional remainder first; tie-break by address so the result is
  // fully deterministic (float equality on frac is otherwise unstable in sort).
  remainders.sort((a, b) =>
    b.frac !== a.frac ? b.frac - a.frac : a.member < b.member ? -1 : 1,
  );
  for (let i = 0; leftover > 0n; i = (i + 1) % remainders.length) {
    const m = remainders[i].member;
    out.set(m, (out.get(m) ?? 0n) + 1n);
    leftover -= 1n;
  }
  return out;
}

export function computeBalances(
  members: Address[],
  expenses: Expense[],
): Map<Address, bigint> {
  const bal = new Map<Address, bigint>(members.map((m) => [m, 0n]));
  for (const e of expenses) {
    if (e.voided) continue;
    bal.set(e.paidBy, (bal.get(e.paidBy) ?? 0n) + e.amountMicro);
    const split = splitAmount(e.amountMicro, e.shares);
    for (const [member, owed] of split) {
      bal.set(member, (bal.get(member) ?? 0n) - owed);
    }
  }
  return bal; // positive = is owed money; negative = owes money
}

/** Apply confirmed settlements to a balance map: paying down debt moves the
 *  debtor toward zero (+amount) and the creditor toward zero (-amount). The
 *  live settlement plan is computed from the result, so it only ever proposes
 *  what still remains unpaid. */
export function applyConfirmedSettlements(
  balances: Map<Address, bigint>,
  settlements: Settlement[],
): Map<Address, bigint> {
  const bal = new Map(balances);
  for (const s of settlements) {
    if (s.status !== 'confirmed') continue;
    bal.set(s.from, (bal.get(s.from) ?? 0n) + s.amountMicro);
    bal.set(s.to, (bal.get(s.to) ?? 0n) - s.amountMicro);
  }
  return bal;
}
