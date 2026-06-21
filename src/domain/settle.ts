import type { Address, Expense } from './types';
import { splitAmount } from './balances.js';

export interface Transfer {
  from: Address;
  to: Address;
  amountMicro: bigint;
}

/** The raw "tangle": who owes whom directly, before global minimization.
 *  For each expense every consumer owes the payer their share. Opposing
 *  direct debts between a pair are netted, so A→B 5 and B→A 2 become A→B 3.
 *  This is what the settlement graph collapses *from* into the minimal plan. */
export function grossDebts(expenses: Expense[]): Transfer[] {
  const pair = new Map<string, bigint>(); // key `${from}|${to}` (from = debtor)
  for (const e of expenses) {
    if (e.voided) continue;
    const split = splitAmount(e.amountMicro, e.shares);
    for (const [member, owed] of split) {
      if (member === e.paidBy || owed === 0n) continue;
      pair.set(`${member}|${e.paidBy}`, (pair.get(`${member}|${e.paidBy}`) ?? 0n) + owed);
    }
  }
  const seen = new Set<string>();
  const out: Transfer[] = [];
  for (const [key, amt] of pair) {
    if (seen.has(key)) continue;
    const [from, to] = key.split('|') as [Address, Address];
    const rev = `${to}|${from}`;
    seen.add(key);
    seen.add(rev);
    const net = amt - (pair.get(rev) ?? 0n);
    if (net > 0n) out.push({ from, to, amountMicro: net });
    else if (net < 0n) out.push({ from: to, to: from, amountMicro: -net });
  }
  out.sort((a, b) =>
    a.from === b.from ? (a.to < b.to ? -1 : 1) : a.from < b.from ? -1 : 1,
  );
  return out;
}

/** Greedy minimal settlement. Repeatedly match the biggest debtor with the
 *  biggest creditor, transfer the smaller of the two magnitudes, repeat until
 *  every balance is zero. Deterministic ordering for stable UI + tests. */
export function minimalSettlement(balances: Map<Address, bigint>): Transfer[] {
  const debtors: { a: Address; v: bigint }[] = [];
  const creditors: { a: Address; v: bigint }[] = [];
  for (const [a, v] of balances) {
    if (v < 0n) debtors.push({ a, v: -v }); // store positive magnitude
    else if (v > 0n) creditors.push({ a, v });
  }
  // deterministic: largest magnitude first, then by address for ties
  const byMag = (
    x: { a: Address; v: bigint },
    y: { a: Address; v: bigint },
  ) => (x.v === y.v ? (x.a < y.a ? -1 : 1) : x.v > y.v ? -1 : 1);
  debtors.sort(byMag);
  creditors.sort(byMag);

  const out: Transfer[] = [];
  let i = 0,
    j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = debtors[i].v < creditors[j].v ? debtors[i].v : creditors[j].v;
    out.push({ from: debtors[i].a, to: creditors[j].a, amountMicro: pay });
    debtors[i].v -= pay;
    creditors[j].v -= pay;
    if (debtors[i].v === 0n) i++;
    if (creditors[j].v === 0n) j++;
  }
  return out;
}
