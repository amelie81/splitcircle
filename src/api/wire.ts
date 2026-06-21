// JSON wire format shared by the backend and the frontend client. BigInt does
// not survive JSON, so every µCRC amount crosses the boundary as a decimal
// string and is converted back to bigint at each edge.
import type {
  Address,
  Expense,
  Group,
  Member,
  Settlement,
  ExpenseShare,
} from '../domain/types';

export interface WireExpense {
  id: string;
  groupId: string;
  description: string;
  amountMicro: string;
  paidBy: Address;
  shares: ExpenseShare[];
  createdAt: number;
  createdBy: Address;
  voided?: boolean;
}

export interface WireSettlement {
  id: string;
  groupId: string;
  from: Address;
  to: Address;
  amountMicro: string;
  intentToken: string;
  status: Settlement['status'];
  txReference?: string;
  submittedBlock?: number;
  createdAt: number;
  confirmedAt?: number;
}

export interface WireGroup {
  id: string;
  name: string;
  createdBy: Address;
  createdAt: number;
  members: Member[];
  expenses: WireExpense[];
  settlements: WireSettlement[];
}

export interface WireTransfer {
  from: Address;
  to: Address;
  amountMicro: string;
}

export interface WirePlan {
  balances: { address: Address; amountMicro: string }[];
  transfers: WireTransfer[];
}

export function expenseToWire(e: Expense): WireExpense {
  return { ...e, amountMicro: e.amountMicro.toString() };
}

export function expenseFromWire(e: WireExpense): Expense {
  return { ...e, amountMicro: BigInt(e.amountMicro) };
}

export function settlementToWire(s: Settlement): WireSettlement {
  return { ...s, amountMicro: s.amountMicro.toString() };
}

export function settlementFromWire(s: WireSettlement): Settlement {
  return { ...s, amountMicro: BigInt(s.amountMicro) };
}

export function groupToWire(g: Group): WireGroup {
  return {
    ...g,
    expenses: g.expenses.map(expenseToWire),
    settlements: g.settlements.map(settlementToWire),
  };
}

export function groupFromWire(g: WireGroup): Group {
  return {
    ...g,
    expenses: g.expenses.map(expenseFromWire),
    settlements: g.settlements.map(settlementFromWire),
  };
}
