import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Plan } from '../../api/client';
import { fetchProfile } from '../../chain/profiles';
import type { Address, Group } from '../../domain/types';
import { onAppData } from '../../host/bridge';

const LS_KEY = 'splitcircle.groupId';

export interface GroupSession {
  group: Group | null;
  plan: Plan | null;
  loading: boolean;
  error: string | null;
  open: (id: string) => void;
  reload: () => Promise<void>;
  leaveView: () => void;
  create: (name: string) => Promise<void>;
  addExpense: (input: {
    description: string;
    amountMicro: bigint;
    paidBy: Address;
    shares: { member: Address; weight: number }[];
  }) => Promise<void>;
  voidExpense: (expenseId: string) => Promise<void>;
  invite: (address: Address) => Promise<void>;
  createInviteLink: () => Promise<string>;
}

const INVITE_PREFIX = 'splitcircle-inv.';

/** Resolve a display name from the Circles profile, falling back to empty so the
 *  domain layer's address shortener takes over. */
async function nameFromProfile(address: Address): Promise<string> {
  const profile = await fetchProfile(address);
  return profile?.name?.trim() ?? '';
}

export function useGroupSession(address: Address | null): GroupSession {
  const [groupId, setGroupId] = useState<string | null>(
    () => localStorage.getItem(LS_KEY),
  );
  const [group, setGroup] = useState<Group | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const open = useCallback((id: string) => {
    localStorage.setItem(LS_KEY, id);
    setGroupId(id);
  }, []);

  const leaveView = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setGroupId(null);
    setGroup(null);
    setPlan(null);
    setError(null);
  }, []);

  const load = useCallback(async (id: string) => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const [g, p] = await Promise.all([api.getGroup(id), api.getPlan(id)]);
      if (seq !== reqSeq.current) return; // a newer load superseded this one
      setGroup(g);
      setPlan(p);
    } catch (e) {
      if (seq !== reqSeq.current) return;
      setError(e instanceof Error ? e.message : 'Could not load this group.');
      setGroup(null);
      setPlan(null);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    if (groupId) await load(groupId);
  }, [groupId, load]);

  // Reset everything when the connected wallet changes — accounts must never
  // bleed group state into one another.
  useEffect(() => {
    setGroup(null);
    setPlan(null);
  }, [address]);

  // Load whenever the active group id changes (and a wallet is connected).
  useEffect(() => {
    if (groupId && address) load(groupId);
  }, [groupId, address, load]);

  // Invite links arrive via the host ?data= channel. Capture the payload and let
  // the effect below resolve it once a wallet is connected.
  useEffect(() => {
    onAppData((data) => {
      const d = data.trim();
      if (d) setPendingData(d);
    });
  }, []);

  // Resolve a pending invite payload. A signed invite token auto-joins the
  // connected wallet (verified + de-expired server-side); a bare id just opens
  // the group for viewing. Never auto-join from an unsigned payload.
  useEffect(() => {
    if (!pendingData) return;
    const data = pendingData;
    if (data.startsWith(INVITE_PREFIX)) {
      if (!address) return; // wait until connected, then join
      (async () => {
        try {
          const displayName = await nameFromProfile(address);
          const g = await api.joinWithToken({ token: data, address, displayName });
          setPendingData(null);
          open(g.id);
        } catch (e) {
          setPendingData(null);
          setError(e instanceof Error ? e.message : 'That invite link is invalid or expired.');
        }
      })();
    } else {
      setPendingData(null);
      open(data);
    }
  }, [pendingData, address, open]);

  const create = useCallback(
    async (name: string) => {
      if (!address) throw new Error('connect first');
      setLoading(true);
      setError(null);
      try {
        const displayName = await nameFromProfile(address);
        const g = await api.createGroup({ name, createdBy: address, displayName });
        open(g.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not create the group.');
        setLoading(false);
      }
    },
    [address, open],
  );

  const addExpense = useCallback<GroupSession['addExpense']>(
    async (input) => {
      if (!groupId || !address) throw new Error('no group');
      await api.addExpense(groupId, { ...input, createdBy: address });
      await load(groupId);
    },
    [groupId, address, load],
  );

  const voidExpense = useCallback(
    async (expenseId: string) => {
      if (!groupId) return;
      await api.voidExpense(groupId, expenseId);
      await load(groupId);
    },
    [groupId, load],
  );

  const invite = useCallback(
    async (member: Address) => {
      if (!groupId) return;
      const displayName = await nameFromProfile(member);
      await api.addMember(groupId, { address: member, displayName });
      await load(groupId);
    },
    [groupId, load],
  );

  const createInviteLink = useCallback(async () => {
    if (!groupId) throw new Error('no group');
    const { token } = await api.createInvite(groupId);
    return `${window.location.origin}?data=${encodeURIComponent(token)}`;
  }, [groupId]);

  return {
    group,
    plan,
    loading,
    error,
    open,
    reload,
    leaveView,
    create,
    addExpense,
    voidExpense,
    invite,
    createInviteLink,
  };
}
