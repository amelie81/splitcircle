export type Address = `0x${string}`;

export interface Member {
  address: Address; // checksummed Circles human avatar
  displayName: string; // from profile, fallback to shortened address
  avatarUrl?: string;
  joinedAt: number; // epoch ms
}

export interface ExpenseShare {
  member: Address;
  // weight for proportional split; equal split = all weights 1
  weight: number;
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amountMicro: bigint; // total cost in µCRC
  paidBy: Address; // who fronted the money
  shares: ExpenseShare[]; // who consumed it, and in what proportion
  createdAt: number;
  createdBy: Address;
  // soft-delete so history/audit survives; never hard-delete an expense
  voided?: boolean;
}

export type SettlementStatus = 'proposed' | 'submitted' | 'confirmed' | 'expired';

export interface Settlement {
  id: string;
  groupId: string;
  from: Address; // debtor
  to: Address; // creditor
  amountMicro: bigint;
  intentToken: string; // HMAC-signed intent embedded in the transfer
  status: SettlementStatus;
  txReference?: string; // tx hash / userOp ref once known
  submittedBlock?: number; // narrows the indexer scan once submitted
  createdAt: number;
  confirmedAt?: number;
}

export interface Group {
  id: string;
  name: string;
  createdBy: Address;
  createdAt: number;
  members: Member[];
  // currency label is always CRC for v1; field reserved for future
  expenses: Expense[];
  settlements: Settlement[];
}
