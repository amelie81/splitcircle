import { useState } from 'react';
import { requestCreateAccount } from '../../host/bridge';

export function Connect({ miniapp }: { miniapp: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!miniapp) {
    return (
      <div className="card empty">
        <h2>Open SplitCircle inside Circles</h2>
        <p className="muted">
          SplitCircle runs as a Mini App in the Circles wallet. Open it from there to
          connect your account and settle up.
        </p>
      </div>
    );
  }

  // requestCreateAccount must be called directly inside the click handler with no
  // await before it, or the browser blocks the passkey prompt.
  function connect() {
    setBusy(true);
    setError(null);
    requestCreateAccount()
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Connection cancelled.'),
      )
      .finally(() => setBusy(false));
  }

  return (
    <div className="card empty">
      <h2>Split expenses, settle in CRC</h2>
      <p className="muted">
        Track who paid for what on your trip or flat, then clear every debt with a
        single tap over your Circles connections.
      </p>
      <button className="btn primary block" onClick={connect} disabled={busy}>
        {busy ? 'Connecting…' : 'Connect'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
