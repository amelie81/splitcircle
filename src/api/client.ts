import type { Address, Group, Settlement } from '../domain/types';
import type { Transfer } from '../domain/settle';
import {
  groupFromWire,
  settlementFromWire,
  type WireGroup,
  type WireSettlement,
  type WirePlan,
} from './wire';

const BASE = (import.meta.env.VITE_API_BASE as string) ?? 'http://localhost:8787';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? `request failed (${res.status})`);
  return data as T;
}

export interface Plan {
  balances: { address: Address; amountMicro: bigint }[];
  transfers: Transfer[];
}

export const api = {
  async createGroup(input: {
    name: string;
    createdBy: Address;
    displayName?: string;
    avatarUrl?: string;
  }): Promise<Group> {
    return groupFromWire(await req<WireGroup>('/api/groups', {
      method: 'POST',
      body: JSON.stringify(input),
    }));
  },

  async getGroup(id: string): Promise<Group> {
    return groupFromWire(await req<WireGroup>(`/api/groups/${id}`));
  },

  async addMember(
    groupId: string,
    input: { address: Address; displayName?: string; avatarUrl?: string },
  ): Promise<Group> {
    return groupFromWire(
      await req<WireGroup>(`/api/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async createInvite(groupId: string): Promise<{ token: string; expiresAt: number }> {
    return req(`/api/groups/${groupId}/invite`, { method: 'POST' });
  },

  async joinWithToken(input: {
    token: string;
    address: Address;
    displayName?: string;
  }): Promise<Group> {
    return groupFromWire(
      await req<WireGroup>('/api/join', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async addExpense(
    groupId: string,
    input: {
      description: string;
      amountMicro: bigint;
      paidBy: Address;
      shares: { member: Address; weight: number }[];
      createdBy: Address;
    },
  ): Promise<Group> {
    return groupFromWire(
      await req<WireGroup>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({ ...input, amountMicro: input.amountMicro.toString() }),
      }),
    );
  },

  async voidExpense(groupId: string, expenseId: string): Promise<Group> {
    return groupFromWire(
      await req<WireGroup>(`/api/groups/${groupId}/expenses/${expenseId}/void`, {
        method: 'POST',
      }),
    );
  },

  async getPlan(groupId: string): Promise<Plan> {
    const wire = await req<WirePlan>(`/api/groups/${groupId}/plan`);
    return {
      balances: wire.balances.map((b) => ({
        address: b.address,
        amountMicro: BigInt(b.amountMicro),
      })),
      transfers: wire.transfers.map((t) => ({
        from: t.from,
        to: t.to,
        amountMicro: BigInt(t.amountMicro),
      })),
    };
  },

  async proposeSettlement(
    groupId: string,
    input: { from: Address; to: Address; amountMicro: bigint },
  ): Promise<Settlement> {
    return settlementFromWire(
      await req<WireSettlement>(`/api/groups/${groupId}/settlements/propose`, {
        method: 'POST',
        body: JSON.stringify({ ...input, amountMicro: input.amountMicro.toString() }),
      }),
    );
  },

  async markSubmitted(
    groupId: string,
    settlementId: string,
    input: { txReference?: string; block?: number },
  ): Promise<void> {
    await req(`/api/groups/${groupId}/settlements/${settlementId}/submit`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async pollSettlement(
    groupId: string,
    settlementId: string,
  ): Promise<{ status: 'confirmed' | 'pending' | 'expired'; txReference?: string }> {
    return req(`/api/groups/${groupId}/settlements/${settlementId}`);
  },
};
