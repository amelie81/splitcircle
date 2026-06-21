// The trust boundary. A settlement is only ever marked `confirmed` here, after a
// matching on-chain transfer is found on the indexer — never on the frontend's
// say-so. Matching is by the embedded intent token (the key); the amount is only
// a guard. Confirmation is idempotent under a per-settlement lock.
import { decodeCrcV2TransferData } from '@aboutcircles/sdk-utils';
import { env } from './env.js';
import { verifyIntent } from './intents.js';
import type { Store } from './store.js';
import type { WireSettlement } from '../src/api/wire.js';

export type MatchResult =
  | { status: 'confirmed'; txReference?: string }
  | { status: 'pending' }
  | { status: 'expired' };

const locks = new Map<string, Promise<MatchResult>>();

/** Run match attempts for one settlement at a time so two concurrent polls can't
 *  both flip it confirmed (and double-credit). */
export function matchSettlement(
  store: Store,
  groupId: string,
  settlementId: string,
): Promise<MatchResult> {
  const key = `${groupId}:${settlementId}`;
  const inflight = locks.get(key);
  if (inflight) return inflight;
  const p = doMatch(store, groupId, settlementId).finally(() => locks.delete(key));
  locks.set(key, p);
  return p;
}

async function doMatch(
  store: Store,
  groupId: string,
  settlementId: string,
): Promise<MatchResult> {
  const group = await store.getGroup(groupId);
  const settlement = group?.settlements.find((s) => s.id === settlementId);
  if (!settlement) return { status: 'pending' };
  if (settlement.status === 'confirmed') {
    return { status: 'confirmed', txReference: settlement.txReference };
  }

  // verify our own intent is still valid (and not expired) before scanning chain
  const intent = verifyIntent(settlement.intentToken, env.hmacKey);
  if (!intent) {
    await markExpired(store, groupId, settlementId);
    return { status: 'expired' };
  }

  const events = await fetchTransferDataEvents(settlement.to, settlement.submittedBlock ?? null);
  for (const ev of events) {
    const hex = extractTransferDataHex(ev);
    if (!hex) continue;
    let decoded;
    try {
      decoded = decodeCrcV2TransferData(hex);
    } catch {
      continue;
    }
    if (decoded.type !== 0x0001) continue;
    if (decoded.payload !== settlement.intentToken) continue;

    // the token matched: re-verify the HMAC and that its fields match this
    // settlement (never trust the embedded token blindly), then guard on amount.
    const verified = verifyIntent(String(decoded.payload), env.hmacKey);
    if (
      !verified ||
      verified.s !== settlementId ||
      verified.f.toLowerCase() !== settlement.from.toLowerCase() ||
      verified.t.toLowerCase() !== settlement.to.toLowerCase()
    ) {
      continue;
    }
    // amount guard: on-chain CRC is 18-decimal atto-units, our ledger is 6-decimal
    // µCRC. Convert down and allow a small tolerance for demurrage/rounding drift —
    // the intent token, not the amount, is what proves the match (spec §5.4).
    const transferredAtto = transferredAmount(ev);
    if (transferredAtto !== null) {
      const transferredMicro = transferredAtto / 1_000_000_000_000n; // ÷1e12
      const required = (BigInt(settlement.amountMicro) * 99n) / 100n; // 1% tolerance
      if (transferredMicro < required) continue;
    }

    const txReference = txRefOf(ev);
    await confirm(store, groupId, settlementId, txReference);
    return { status: 'confirmed', txReference };
  }

  return { status: 'pending' };
}

async function confirm(
  store: Store,
  groupId: string,
  settlementId: string,
  txReference: string | undefined,
): Promise<void> {
  await store.updateGroup(groupId, (g) => {
    const s = g.settlements.find((x) => x.id === settlementId);
    if (s && s.status !== 'confirmed') {
      s.status = 'confirmed';
      s.confirmedAt = Date.now();
      if (txReference) s.txReference = txReference;
    }
  });
}

async function markExpired(store: Store, groupId: string, settlementId: string): Promise<void> {
  await store.updateGroup(groupId, (g) => {
    const s = g.settlements.find((x) => x.id === settlementId);
    if (s && s.status !== 'confirmed') s.status = 'expired';
  });
}

// --- indexer reads --------------------------------------------------------
// The exact circles_events param order and response shape are node-version
// dependent (spec §5.6, flagged unverified). Everything that depends on them is
// behind these three helpers so a signature change is a localized fix.

async function fetchTransferDataEvents(
  recipient: string,
  fromBlock: number | null,
): Promise<unknown[]> {
  const res = await fetch(env.circlesRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'circles_events',
      // VERIFY param order against the live RPC in Phase D testing:
      params: [recipient, fromBlock, null, ['CrcV2_TransferData']],
    }),
  });
  if (!res.ok) throw new Error(`events rpc ${res.status}`);
  const { result, error } = (await res.json()) as { result?: unknown[]; error?: { message?: string } };
  if (error) throw new Error(error.message ?? 'events rpc error');
  return result ?? [];
}

/** Pull the transfer-data hex out of an indexer event, tolerating a few shapes
 *  the RPC may use (top-level or nested under `values`). */
function extractTransferDataHex(ev: unknown): string | null {
  const v = ev as Record<string, unknown> & { values?: Record<string, unknown> };
  const candidate =
    v?.data ?? v?.transferData ?? v?.values?.data ?? v?.values?.transferData;
  return typeof candidate === 'string' && candidate.startsWith('0x') ? candidate : null;
}

function transferredAmount(ev: unknown): bigint | null {
  const v = ev as Record<string, unknown> & { values?: Record<string, unknown> };
  const raw = v?.amount ?? v?.value ?? v?.values?.amount ?? v?.values?.value;
  if (raw === undefined || raw === null) return null;
  try {
    return BigInt(raw as string | number | bigint);
  } catch {
    return null;
  }
}

function txRefOf(ev: unknown): string | undefined {
  const v = ev as Record<string, unknown> & { values?: Record<string, unknown> };
  const raw =
    v?.transactionHash ?? v?.txHash ?? v?.values?.transactionHash ?? v?.values?.txHash;
  return typeof raw === 'string' ? raw : undefined;
}

export type { WireSettlement };
