import { describe, it, expect } from 'vitest';
import {
  mintSettleIntent,
  verifyIntent,
  signIntent,
  mintInviteToken,
  verifyInviteToken,
} from '../server/intents';

const KEY = 'test-secret-key';
const FROM = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const TO = '0x2222222222222222222222222222222222222222' as `0x${string}`;

const baseArgs = {
  groupId: 'grp_abc',
  settlementId: 'set_xyz',
  from: FROM,
  to: TO,
  amountMicro: 12_500_000n,
};

describe('settlement intents', () => {
  it('round-trips a freshly minted token', () => {
    const { token, intent } = mintSettleIntent(baseArgs, KEY);
    const verified = verifyIntent(token, KEY);
    expect(verified).not.toBeNull();
    expect(verified).toEqual(intent);
    expect(verified!.g).toBe('grp_abc');
    expect(verified!.s).toBe('set_xyz');
    expect(verified!.f).toBe(FROM);
    expect(verified!.t).toBe(TO);
    expect(verified!.a).toBe('12500000');
  });

  it('rejects a token signed with a different key', () => {
    const { token } = mintSettleIntent(baseArgs, KEY);
    expect(verifyIntent(token, 'wrong-key')).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const { token } = mintSettleIntent(baseArgs, KEY);
    const [prefix, payload, mac] = token.split('.');
    // flip a character in the payload; the mac no longer matches
    const altered = payload.slice(0, -1) + (payload.slice(-1) === 'A' ? 'B' : 'A');
    expect(verifyIntent(`${prefix}.${altered}.${mac}`, KEY)).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifyIntent('not-a-token', KEY)).toBeNull();
    expect(verifyIntent('splitcircle..', KEY)).toBeNull();
    expect(verifyIntent('wrongprefix.a.b', KEY)).toBeNull();
  });

  it('rejects an expired token', () => {
    const { token } = mintSettleIntent({ ...baseArgs, ttlMs: -1 }, KEY);
    expect(verifyIntent(token, KEY)).toBeNull();
  });

  it('mints unique nonces for identical inputs', () => {
    const a = mintSettleIntent(baseArgs, KEY);
    const b = mintSettleIntent(baseArgs, KEY);
    expect(a.intent.n).not.toBe(b.intent.n);
    expect(a.token).not.toBe(b.token);
  });

  it('signIntent is deterministic for a fixed intent', () => {
    const intent = {
      v: 1 as const,
      g: 'g',
      s: 's',
      f: FROM,
      t: TO,
      a: '1',
      x: 9_999_999_999_999,
      n: 'fixednonce',
    };
    expect(signIntent(intent, KEY)).toBe(signIntent(intent, KEY));
  });
});

describe('invite tokens', () => {
  it('round-trips and carries the group id', () => {
    const { token, expiresAt } = mintInviteToken({ groupId: 'grp_trip' }, KEY);
    expect(expiresAt).toBeGreaterThan(Date.now());
    const v = verifyInviteToken(token, KEY);
    expect(v).not.toBeNull();
    expect(v!.g).toBe('grp_trip');
  });

  it('rejects wrong key, tamper, expiry, and malformed tokens', () => {
    const { token } = mintInviteToken({ groupId: 'grp_trip' }, KEY);
    expect(verifyInviteToken(token, 'other')).toBeNull();
    const [p, payload, mac] = token.split('.');
    const altered = payload.slice(0, -1) + (payload.slice(-1) === 'A' ? 'B' : 'A');
    expect(verifyInviteToken(`${p}.${altered}.${mac}`, KEY)).toBeNull();
    expect(verifyInviteToken(mintInviteToken({ groupId: 'g', ttlMs: -1 }, KEY).token, KEY)).toBeNull();
    expect(verifyInviteToken('nope', KEY)).toBeNull();
    // a settlement token must not validate as an invite (distinct prefix)
    const settle = mintSettleIntent(baseArgs, KEY).token;
    expect(verifyInviteToken(settle, KEY)).toBeNull();
  });
});
