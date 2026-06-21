import { getAddress, isAddress } from 'viem';
import type { Address, Expense, Group, Member } from './types';

/** Normalize to a checksummed address or throw. The single edge-of-system
 *  guard that every address passes through before entering the domain. */
export function asAddress(input: string): Address {
  if (!isAddress(input)) throw new Error(`invalid address: ${input}`);
  return getAddress(input) as Address;
}

export function isMember(group: Group, address: Address): boolean {
  return group.members.some((m) => addrEq(m.address, address));
}

export function addrEq(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export interface ExpenseDraft {
  description: string;
  amountMicro: bigint;
  paidBy: Address;
  shares: { member: Address; weight: number }[];
}

/** Validate an expense against its group. Returns the list of problems;
 *  empty array means valid. Enforces the §3.1 invariants. */
export function validateExpense(group: Group, draft: ExpenseDraft): string[] {
  const errors: string[] = [];
  if (draft.description.trim().length === 0) {
    errors.push('Add a short description.');
  }
  if (draft.amountMicro <= 0n) {
    errors.push('Amount must be greater than zero.');
  }
  if (!isMember(group, draft.paidBy)) {
    errors.push('The payer must be a group member.');
  }
  if (draft.shares.length === 0) {
    errors.push('Pick at least one person to split between.');
  }
  for (const s of draft.shares) {
    if (!isMember(group, s.member)) {
      errors.push('Everyone in the split must be a group member.');
      break;
    }
  }
  if (draft.shares.some((s) => s.weight <= 0)) {
    errors.push('Each share must have a positive weight.');
  }
  const seen = new Set<string>();
  for (const s of draft.shares) {
    const key = s.member.toLowerCase();
    if (seen.has(key)) {
      errors.push('A person can only appear once in the split.');
      break;
    }
    seen.add(key);
  }
  return errors;
}

export function shortenAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function fallbackName(member: Pick<Member, 'address' | 'displayName'>): string {
  return member.displayName?.trim() || shortenAddress(member.address);
}

export type { Expense };
