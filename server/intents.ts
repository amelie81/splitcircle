// HMAC-signed settlement intents. The key lives only on the server; the browser
// never forges these. A confirmed settlement is proven by finding this exact
// token embedded in an on-chain transfer (Phase D matcher).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type SettleIntent = {
  v: 1;
  g: string; // groupId
  s: string; // settlementId
  f: `0x${string}`; // from (debtor)
  t: `0x${string}`; // to (creditor)
  a: string; // amount µCRC as string
  x: number; // expiry epoch ms
  n: string; // nonce
};

const b64url = (b: Buffer) =>
  b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function signIntent(intent: SettleIntent, key: string): string {
  const payload = b64url(Buffer.from(JSON.stringify(intent)));
  const mac = b64url(createHmac('sha256', key).update(payload).digest());
  return `splitcircle.${payload}.${mac}`;
}

export function mintSettleIntent(
  args: {
    groupId: string;
    settlementId: string;
    from: `0x${string}`;
    to: `0x${string}`;
    amountMicro: bigint;
    ttlMs?: number;
  },
  key: string,
): { token: string; intent: SettleIntent } {
  const intent: SettleIntent = {
    v: 1,
    g: args.groupId,
    s: args.settlementId,
    f: args.from,
    t: args.to,
    a: args.amountMicro.toString(),
    x: Date.now() + (args.ttlMs ?? 30 * 60_000), // default 30 min expiry
    n: randomBytes(8).toString('hex'), // unique nonce per intent
  };
  return { token: signIntent(intent, key), intent };
}

// --- group invite tokens --------------------------------------------------
// A short-lived, HMAC-signed join code. The token is the sole authority for
// which group it joins — never trust a groupId supplied alongside it.

export type InvitePayload = { v: 1; g: string; x: number; n: string };

export function mintInviteToken(
  args: { groupId: string; ttlMs?: number },
  key: string,
): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + (args.ttlMs ?? 7 * 24 * 60 * 60_000); // 7 days
  const payloadObj: InvitePayload = {
    v: 1,
    g: args.groupId,
    x: expiresAt,
    n: randomBytes(8).toString('hex'),
  };
  const payload = b64url(Buffer.from(JSON.stringify(payloadObj)));
  const mac = b64url(createHmac('sha256', key).update(payload).digest());
  return { token: `splitcircle-inv.${payload}.${mac}`, expiresAt };
}

export function verifyInviteToken(token: string, key: string): InvitePayload | null {
  const [prefix, payload, mac] = token.split('.');
  if (prefix !== 'splitcircle-inv' || !payload || !mac) return null;
  const expect = b64url(createHmac('sha256', key).update(payload).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(),
    ) as InvitePayload;
    if (obj.v !== 1 || typeof obj.g !== 'string' || obj.x < Date.now()) return null;
    return obj;
  } catch {
    return null;
  }
}

export function verifyIntent(token: string, key: string): SettleIntent | null {
  const [prefix, payload, mac] = token.split('.');
  if (prefix !== 'splitcircle' || !payload || !mac) return null;
  const expect = b64url(createHmac('sha256', key).update(payload).digest());
  // constant-time compare — this guards money movement; don't use !==
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const intent = JSON.parse(
      Buffer.from(
        payload.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString(),
    ) as SettleIntent;
    if (intent.x < Date.now()) return null; // expired
    return intent;
  } catch {
    return null;
  }
}
