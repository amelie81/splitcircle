import { useState } from 'react';
import type { Address, Group } from '../../domain/types';
import { parseCrc } from '../../domain/money';
import { fallbackName } from '../../domain/validation';

export function AddExpense({
  group,
  defaultPayer,
  onSubmit,
  onCancel,
}: {
  group: Group;
  defaultPayer: Address;
  onSubmit: (input: {
    description: string;
    amountMicro: bigint;
    paidBy: Address;
    shares: { member: Address; weight: number }[];
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState<Address>(defaultPayer);
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(group.members.map((m) => m.address.toLowerCase())),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(addr: Address) {
    const key = addr.toLowerCase();
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submit() {
    setError(null);
    let amountMicro: bigint;
    try {
      amountMicro = parseCrc(amount);
    } catch {
      setError('Enter a valid amount, e.g. 12.50.');
      return;
    }
    if (amountMicro <= 0n) {
      setError('Amount must be greater than zero.');
      return;
    }
    const shares = group.members
      .filter((m) => included.has(m.address.toLowerCase()))
      .map((m) => ({ member: m.address, weight: 1 }));
    if (shares.length === 0) {
      setError('Pick at least one person to split between.');
      return;
    }
    if (!description.trim()) {
      setError('Add a short description.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ description: description.trim(), amountMicro, paidBy, shares });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the expense.');
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: '1.25rem' }}>Add expense</h2>
        <button className="btn ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>

      <div className="field">
        <label htmlFor="desc">What for</label>
        <input
          id="desc"
          placeholder="Airbnb, dinner, train…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="amt">Amount (CRC)</label>
        <input
          id="amt"
          inputMode="decimal"
          placeholder="90.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="payer">Paid by</label>
        <select
          id="payer"
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value as Address)}
        >
          {group.members.map((m) => (
            <option key={m.address} value={m.address}>
              {fallbackName(m)}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Split equally between</label>
        <div className="checks">
          {group.members.map((m) => (
            <label key={m.address}>
              <input
                type="checkbox"
                checked={included.has(m.address.toLowerCase())}
                onChange={() => toggle(m.address)}
              />
              {fallbackName(m).split(/\s+/)[0]}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <button className="btn primary block" onClick={submit} disabled={busy}>
        {busy ? 'Saving…' : 'Add expense'}
      </button>
    </div>
  );
}
