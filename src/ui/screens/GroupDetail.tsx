import { useMemo, useState } from 'react';
import type { Address } from '../../domain/types';
import type { GroupSession } from '../../app/state/groupStore';
import { asAddress, addrEq } from '../../domain/validation';
import { Amount } from '../components/Amount';
import { BalanceCard } from '../components/BalanceCard';
import { MemberChip } from '../components/MemberChip';
import { SettleFlow } from '../components/SettleFlow';
import { GraphCanvas } from '../components/GraphCanvas';
import { AddExpense } from './AddExpense';
import { firstName, crc } from '../../utils/format';
import { useSettlement, legKey, type LegState } from '../../app/state/settlementStore';
import { grossDebts, type Transfer } from '../../domain/settle';

export function GroupDetail({
  session,
  address,
}: {
  session: GroupSession;
  address: Address;
}) {
  const { group, plan } = session;
  const { legs, settle } = useSettlement(group?.id ?? null, session.reload);
  const [adding, setAdding] = useState(false);
  const [inviteAddr, setInviteAddr] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const myBalance = useMemo(() => {
    const b = plan?.balances.find((x) => addrEq(x.address, address));
    return b?.amountMicro ?? 0n;
  }, [plan, address]);

  const gross = useMemo(() => grossDebts(group?.expenses ?? []), [group]);

  if (!group) return null;

  async function copyInvite() {
    try {
      const link = await session.createInviteLink();
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard may be blocked in the iframe, or minting failed; surface nothing
         destructive — the user can retry the button. */
    }
  }

  async function addMember() {
    setInviteError(null);
    let addr: Address;
    try {
      addr = asAddress(inviteAddr.trim());
    } catch {
      setInviteError('Enter a valid wallet address.');
      return;
    }
    await session.invite(addr);
    setInviteAddr('');
  }

  if (adding) {
    return (
      <AddExpense
        group={group}
        defaultPayer={address}
        onSubmit={async (input) => {
          await session.addExpense(input);
          setAdding(false);
        }}
        onCancel={() => setAdding(false)}
      />
    );
  }

  const activeExpenses = group.expenses.filter((e) => !e.voided);
  const myTransfers = plan?.transfers.filter((t) => addrEq(t.from, address)) ?? [];
  const otherTransfers = plan?.transfers.filter((t) => !addrEq(t.from, address)) ?? [];

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="masthead">
        <div>
          <h1>{group.name}</h1>
          <span className="sub">{group.members.length} members</span>
        </div>
        <button className="btn ghost" onClick={session.leaveView}>
          Switch
        </button>
      </div>

      <BalanceCard micro={myBalance} />

      {/* settlement plan */}
      <div className="card">
        <div className="section-title">Settle up</div>
        {plan && (
          <GraphCanvas
            members={group.members}
            gross={gross}
            plan={plan.transfers}
            legs={legs}
          />
        )}
        {plan && plan.transfers.length === 0 ? (
          <p className="muted" style={{ margin: '8px 0 0' }}>
            Everyone's square. Nothing to settle.
          </p>
        ) : (
          <div className="stack">
            {myTransfers.map((t, i) => (
              <SettleRow
                key={`me-${i}`}
                transfer={t}
                payeeName={firstName(group.members, t.to)}
                state={legs[legKey(t)]}
                onSettle={() => settle(t)}
              />
            ))}
            {otherTransfers.length > 0 && (
              <>
                <div className="section-title" style={{ marginTop: 8 }}>
                  Between others
                </div>
                {otherTransfers.map((t, i) => (
                  <div className="plan-row" key={`o-${i}`}>
                    <div className="desc">
                      <span>
                        {firstName(group.members, t.from)} →{' '}
                        {firstName(group.members, t.to)}
                      </span>
                    </div>
                    <Amount micro={t.amountMicro} />
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* expenses */}
      <div className="card">
        <div className="spread" style={{ marginBottom: 6 }}>
          <div className="section-title" style={{ margin: 0 }}>
            Expenses
          </div>
          <button className="btn primary" onClick={() => setAdding(true)}>
            Add expense
          </button>
        </div>
        {activeExpenses.length === 0 ? (
          <p className="muted" style={{ margin: '8px 0 0' }}>
            No expenses yet. Add the first one and SplitCircle will keep the tally.
          </p>
        ) : (
          <div>
            {activeExpenses.map((e) => (
              <div className="row" key={e.id}>
                <div className="meta">
                  <span className="title">{e.description}</span>
                  <span className="sub">
                    {firstName(group.members, e.paidBy)} paid · split{' '}
                    {e.shares.length} ways
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Amount micro={e.amountMicro} />
                  <button
                    className="btn ghost"
                    style={{ minHeight: 36, padding: '6px 10px' }}
                    onClick={() => session.voidExpense(e.id)}
                  >
                    Void
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* members + invite */}
      <div className="card">
        <div className="section-title">Members</div>
        <div className="stack" style={{ gap: 10, marginBottom: 14 }}>
          {group.members.map((m) => (
            <div className="spread" key={m.address}>
              <MemberChip member={m} full />
              {addrEq(m.address, address) && <span className="pill">you</span>}
            </div>
          ))}
        </div>

        <div className="field" style={{ marginBottom: 8 }}>
          <label htmlFor="invite">Add member by address</label>
          <input
            id="invite"
            placeholder="0x…"
            value={inviteAddr}
            onChange={(e) => setInviteAddr(e.target.value)}
          />
        </div>
        <div className="spread" style={{ gap: 8 }}>
          <button className="btn ghost" onClick={copyInvite}>
            {copied ? 'Link copied' : 'Copy invite link'}
          </button>
          <button className="btn primary" onClick={addMember} disabled={!inviteAddr.trim()}>
            Add member
          </button>
        </div>
        {inviteError && <p className="error">{inviteError}</p>}
      </div>

      <p className="muted" style={{ fontSize: '0.75rem', textAlign: 'center' }}>
        Group id <code>{group.id}</code>
      </p>
    </div>
  );
}

function SettleRow({
  transfer,
  payeeName,
  state,
  onSettle,
}: {
  transfer: Transfer;
  payeeName: string;
  state: LegState | undefined;
  onSettle: () => void;
}) {
  const phase = state?.phase ?? 'idle';
  const busy = phase === 'routing' || phase === 'submitting' || phase === 'confirming';
  const showFlow = busy || phase === 'confirmed';

  const label =
    phase === 'routing'
      ? 'Finding route…'
      : phase === 'submitting'
        ? 'Confirm in wallet…'
        : phase === 'confirming'
          ? 'Settling…'
          : phase === 'confirmed'
            ? 'Settled'
            : 'Settle up';

  return (
    <div className="plan-row">
      <div className="desc">
        <span>
          Pay <strong>{payeeName}</strong> {crc(transfer.amountMicro)}
        </span>
        {showFlow && (
          <SettleFlow
            hops={state?.hops ?? 1}
            flowing={busy}
            done={phase === 'confirmed'}
            fromLabel="You"
            toLabel={payeeName}
          />
        )}
        <span className="sr-status" role="status" aria-live="polite">
          {busy || phase === 'confirmed' ? label : ''}
        </span>
        {phase === 'short' && (
          <span className="note">
            You can send {crc(state?.maxMicro ?? 0n)} to {payeeName} right now over your
            Circles connections. {state?.message}
          </span>
        )}
        {phase === 'error' && <span className="note error">{state?.message}</span>}
        {phase === 'confirmed' && (
          <span className="note" style={{ color: 'var(--settled)' }}>
            Paid over your Circles connections.
          </span>
        )}
      </div>
      <button
        className={`btn ${phase === 'confirmed' ? 'ghost' : 'primary'}`}
        onClick={onSettle}
        disabled={busy || phase === 'confirmed'}
        aria-label={`Settle up with ${payeeName}`}
      >
        {label}
      </button>
    </div>
  );
}
