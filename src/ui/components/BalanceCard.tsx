import { Amount } from './Amount';

/** One number, big — the glanceable "where do I stand" summary for the
 *  connected member. Positive = you're owed, negative = you owe, 0 = square. */
export function BalanceCard({ micro }: { micro: bigint }) {
  if (micro === 0n) {
    return (
      <div className="card balance-card">
        <span className="label">Your balance</span>
        <span className="square">You're all square. 🎉</span>
      </div>
    );
  }
  const owed = micro > 0n;
  return (
    <div className="card balance-card">
      <span className="label">{owed ? "You're owed" : 'You owe'}</span>
      <Amount micro={owed ? micro : -micro} tone={owed ? 'owed' : 'owe'} big />
    </div>
  );
}
