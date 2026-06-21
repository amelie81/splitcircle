import { useCallback, useRef, useState } from 'react';
import { api } from '../../api/client';
import { submitSettlement } from '../../chain/settleTx';
import { routeFor } from '../../chain/pathfinder';
import { pathfinderToMicro } from '../../domain/money';
import type { Address } from '../../domain/types';
import type { Transfer } from '../../domain/settle';

export type SettlePhase =
  | 'idle'
  | 'routing' // finding a path / capacity
  | 'submitting' // host signing + submitting the transfer
  | 'confirming' // polling the indexer via the backend matcher
  | 'confirmed'
  | 'short' // route can't carry the full amount
  | 'error';

export interface LegState {
  phase: SettlePhase;
  message?: string;
  maxMicro?: bigint; // achievable amount when the route is short
  hops?: number; // number of trust-graph edges the payment traverses
}

export function legKey(t: Pick<Transfer, 'from' | 'to'>): string {
  return `${t.from.toLowerCase()}->${t.to.toLowerCase()}`;
}

const POLL_BACKOFF_MS = [2000, 2000, 4000, 4000, 8000, 8000, 15000, 30000];

export function useSettlement(groupId: string | null, onConfirmed: () => void) {
  const [legs, setLegs] = useState<Record<string, LegState>>({});
  const active = useRef<Set<string>>(new Set());

  const set = useCallback((key: string, s: LegState) => {
    setLegs((prev) => ({ ...prev, [key]: s }));
  }, []);

  const settle = useCallback(
    async (transfer: Transfer) => {
      if (!groupId) return;
      const key = legKey(transfer);
      if (active.current.has(key)) return;
      active.current.add(key);
      try {
        // 1) route — confirm the trust graph can actually carry this amount
        set(key, { phase: 'routing' });
        const route = await routeFor(transfer.from, transfer.to, transfer.amountMicro);
        if (route.transfers.length === 0 || route.maxFlow === 0n) {
          set(key, {
            phase: 'short',
            maxMicro: 0n,
            message: "You aren't connected closely enough on Circles to send this yet.",
          });
          return;
        }
        const maxMicro = pathfinderToMicro(route.maxFlow);
        if (maxMicro < transfer.amountMicro) {
          set(key, {
            phase: 'short',
            maxMicro,
            message: 'Your Circles connections can only carry part of this right now.',
          });
          return;
        }
        const hops = route.transfers.length;

        // 2) propose (mint a server-signed intent), then sign + submit via host
        const settlement = await api.proposeSettlement(groupId, transfer);
        set(key, { phase: 'submitting', hops });
        const refs = await submitSettlement({
          from: transfer.from,
          to: transfer.to,
          amountMicro: transfer.amountMicro,
          intentToken: settlement.intentToken,
        });
        await api.markSubmitted(groupId, settlement.id, { txReference: refs[0] });

        // 3) confirm — poll the backend matcher until the transfer is found
        set(key, { phase: 'confirming', hops });
        for (const wait of POLL_BACKOFF_MS) {
          const res = await api.pollSettlement(groupId, settlement.id);
          if (res.status === 'confirmed') {
            set(key, { phase: 'confirmed', hops });
            onConfirmed();
            return;
          }
          if (res.status === 'expired') {
            set(key, { phase: 'error', message: 'This settlement expired. Try again.' });
            return;
          }
          await delay(wait);
        }
        set(key, {
          phase: 'error',
          message: "Still confirming on-chain. It'll update once the transfer lands.",
        });
      } catch (e) {
        set(key, {
          phase: 'error',
          message:
            e instanceof Error ? e.message : "That transfer didn't go through. Nothing was sent.",
        });
      } finally {
        active.current.delete(key);
      }
    },
    [groupId, set, onConfirmed],
  );

  return { legs, settle };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type { Transfer, Address };
