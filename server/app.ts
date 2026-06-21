import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { env } from './env.js';
import { createStore } from './store.js';
import { mintSettleIntent, mintInviteToken, verifyInviteToken } from './intents.js';
import { matchSettlement } from './matcher.js';
import { newId } from '../src/utils/id.js';
import {
  groupFromWire,
  type WireGroup,
  type WireExpense,
  type WireSettlement,
  type WirePlan,
} from '../src/api/wire.js';
import { computeBalances, applyConfirmedSettlements } from '../src/domain/balances.js';
import { minimalSettlement } from '../src/domain/settle.js';
import { validateExpense, asAddress, isMember } from '../src/domain/validation.js';
import type { Address } from '../src/domain/types.js';

export const store = createStore({ dbPath: env.dbPath });

export const app = new Hono();
app.use('/*', cors());

app.get('/health', (c) => c.json({ ok: true }));

// --- groups ---------------------------------------------------------------

app.post('/api/groups', async (c) => {
  const body = await c.req.json<{
    name: string;
    createdBy: string;
    displayName?: string;
    avatarUrl?: string;
  }>();
  let creator: Address;
  try {
    creator = asAddress(body.createdBy);
  } catch {
    return c.json({ error: 'invalid creator address' }, 400);
  }
  if (!body.name?.trim()) return c.json({ error: 'group name required' }, 400);

  const now = Date.now();
  const group: WireGroup = {
    id: newId('grp'),
    name: body.name.trim(),
    createdBy: creator,
    createdAt: now,
    members: [
      {
        address: creator,
        displayName: body.displayName?.trim() || '',
        avatarUrl: body.avatarUrl,
        joinedAt: now,
      },
    ],
    expenses: [],
    settlements: [],
  };
  await store.putGroup(group);
  return c.json(group, 201);
});

app.get('/api/groups/:id', async (c) => {
  const group = await store.getGroup(c.req.param('id'));
  if (!group) return c.json({ error: 'not found' }, 404);
  return c.json(group);
});

// --- members (the invite / referral landing) ------------------------------

app.post('/api/groups/:id/members', async (c) => {
  const body = await c.req.json<{
    address: string;
    displayName?: string;
    avatarUrl?: string;
  }>();
  let address: Address;
  try {
    address = asAddress(body.address);
  } catch {
    return c.json({ error: 'invalid address' }, 400);
  }
  const updated = await store.updateGroup(c.req.param('id'), (g) => {
    const domain = groupFromWire(g);
    if (isMember(domain, address)) return; // idempotent join
    g.members.push({
      address,
      displayName: body.displayName?.trim() || '',
      avatarUrl: body.avatarUrl,
      joinedAt: Date.now(),
    });
  });
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json(updated);
});

// Mint a short-lived signed invite token for a group. The link built from it is
// what gets shared; the token is the sole authority for which group it joins.
app.post('/api/groups/:id/invite', async (c) => {
  const id = c.req.param('id');
  if (!(await store.getGroup(id))) return c.json({ error: 'not found' }, 404);
  const { token, expiresAt } = mintInviteToken({ groupId: id }, env.hmacKey);
  return c.json({ token, expiresAt });
});

// Redeem an invite token: the joining wallet adds itself as a member. The group
// is derived from the verified token, never from a caller-supplied id.
app.post('/api/join', async (c) => {
  const body = await c.req.json<{ token: string; address: string; displayName?: string }>();
  const payload = verifyInviteToken(body.token ?? '', env.hmacKey);
  if (!payload) return c.json({ error: 'invalid or expired invite' }, 400);
  let address: Address;
  try {
    address = asAddress(body.address);
  } catch {
    return c.json({ error: 'invalid address' }, 400);
  }
  const updated = await store.updateGroup(payload.g, (g) => {
    const domain = groupFromWire(g);
    if (isMember(domain, address)) return; // idempotent join
    g.members.push({
      address,
      displayName: body.displayName?.trim() || '',
      joinedAt: Date.now(),
    });
  });
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json(updated);
});

// --- expenses -------------------------------------------------------------

app.post('/api/groups/:id/expenses', async (c) => {
  const id = c.req.param('id');
  const group = await store.getGroup(id);
  if (!group) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{
    description: string;
    amountMicro: string;
    paidBy: string;
    shares: { member: string; weight: number }[];
    createdBy: string;
  }>();

  let draft;
  try {
    draft = {
      description: body.description ?? '',
      amountMicro: BigInt(body.amountMicro),
      paidBy: asAddress(body.paidBy),
      shares: body.shares.map((s) => ({ member: asAddress(s.member), weight: s.weight })),
    };
  } catch {
    return c.json({ error: 'malformed expense' }, 400);
  }

  const problems = validateExpense(groupFromWire(group), draft);
  if (problems.length) return c.json({ error: problems.join(' ') }, 400);

  const createdBy = asAddress(body.createdBy);
  const expense: WireExpense = {
    id: newId('exp'),
    groupId: id,
    description: draft.description.trim(),
    amountMicro: draft.amountMicro.toString(),
    paidBy: draft.paidBy,
    shares: draft.shares,
    createdAt: Date.now(),
    createdBy,
  };
  const updated = await store.updateGroup(id, (g) => {
    g.expenses.push(expense);
  });
  return c.json(updated, 201);
});

app.post('/api/groups/:id/expenses/:eid/void', async (c) => {
  const updated = await store.updateGroup(c.req.param('id'), (g) => {
    const e = g.expenses.find((x) => x.id === c.req.param('eid'));
    if (e) e.voided = true; // soft delete; financial history is preserved
  });
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json(updated);
});

// --- balances + minimal settlement plan -----------------------------------

app.get('/api/groups/:id/plan', async (c) => {
  const group = await store.getGroup(c.req.param('id'));
  if (!group) return c.json({ error: 'not found' }, 404);
  const domain = groupFromWire(group);
  const members = domain.members.map((m) => m.address);
  const raw = computeBalances(members, domain.expenses);
  const net = applyConfirmedSettlements(raw, domain.settlements);
  const transfers = minimalSettlement(net);
  const plan: WirePlan = {
    balances: [...net].map(([address, v]) => ({ address, amountMicro: v.toString() })),
    transfers: transfers.map((t) => ({
      from: t.from,
      to: t.to,
      amountMicro: t.amountMicro.toString(),
    })),
  };
  return c.json(plan);
});

// --- settlement proposal (mints an HMAC intent; matcher confirms off chain) --

app.post('/api/groups/:id/settlements/propose', async (c) => {
  const id = c.req.param('id');
  const group = await store.getGroup(id);
  if (!group) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{ from: string; to: string; amountMicro: string }>();
  let from: Address, to: Address, amount: bigint;
  try {
    from = asAddress(body.from);
    to = asAddress(body.to);
    amount = BigInt(body.amountMicro);
  } catch {
    return c.json({ error: 'malformed proposal' }, 400);
  }
  if (amount <= 0n) return c.json({ error: 'amount must be positive' }, 400);

  const settlementId = newId('set');
  const { token } = mintSettleIntent(
    { groupId: id, settlementId, from, to, amountMicro: amount },
    env.hmacKey,
  );
  const settlement: WireSettlement = {
    id: settlementId,
    groupId: id,
    from,
    to,
    amountMicro: amount.toString(),
    intentToken: token,
    status: 'proposed',
    createdAt: Date.now(),
  };
  await store.updateGroup(id, (g) => {
    g.settlements.push(settlement);
  });
  return c.json(settlement, 201);
});

// The frontend reports its submission so the matcher can narrow the indexer scan.
// This does NOT confirm the settlement — only the matcher does, off the indexer.
app.post('/api/groups/:id/settlements/:sid/submit', async (c) => {
  const body = await c.req.json<{ txReference?: string; block?: number }>();
  const updated = await store.updateGroup(c.req.param('id'), (g) => {
    const s = g.settlements.find((x) => x.id === c.req.param('sid'));
    if (s && s.status === 'proposed') {
      s.status = 'submitted';
      if (body.txReference) s.txReference = body.txReference;
      if (typeof body.block === 'number') s.submittedBlock = body.block;
    }
  });
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

// Poll target. Runs the matcher (idempotent) and returns the live status.
app.get('/api/groups/:id/settlements/:sid', async (c) => {
  const result = await matchSettlement(store, c.req.param('id'), c.req.param('sid'));
  return c.json(result);
});
