import { useWallet } from './state/walletStore';
import { useGroupSession } from './state/groupStore';
import { Connect } from '../ui/screens/Connect';
import { CreateOrJoin } from '../ui/screens/CreateOrJoin';
import { GroupDetail } from '../ui/screens/GroupDetail';

export function App() {
  const wallet = useWallet();
  const session = useGroupSession(wallet.address);

  // Not inside the host, or host hasn't reported a wallet yet.
  if (!wallet.miniapp || !wallet.address) {
    return (
      <div className="app">
        <Masthead />
        {wallet.miniapp && !wallet.ready ? (
          <div className="card empty" role="status" aria-live="polite">
            <p className="muted">Connecting to your Circles account…</p>
          </div>
        ) : (
          <Connect miniapp={wallet.miniapp} />
        )}
      </div>
    );
  }

  return (
    <div className="app">
      {!session.group && <Masthead />}
      {session.loading && !session.group && (
        <div className="card empty" role="status" aria-live="polite">
          <p className="muted">Loading group…</p>
        </div>
      )}
      {session.group ? (
        <GroupDetail session={session} address={wallet.address} />
      ) : (
        !session.loading && (
          <CreateOrJoin
            onCreate={(name) => session.create(name)}
            onOpen={(id) => session.open(id)}
            busy={session.loading}
            error={session.error}
          />
        )
      )}
    </div>
  );
}

function Masthead() {
  return (
    <div className="masthead">
      <div className="brand">
        <BrandMark />
        <div>
          <h1>SplitCircle</h1>
          <span className="sub">Shared expenses, settled in CRC</span>
        </div>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="sc-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c5cff" />
          <stop offset="55%" stopColor="#6c47d6" />
          <stop offset="100%" stopColor="#9d4edd" />
        </linearGradient>
      </defs>
      <circle cx="15" cy="20" r="11" fill="url(#sc-brand)" opacity="0.55" />
      <circle cx="25" cy="20" r="11" fill="none" stroke="url(#sc-brand)" strokeWidth="2.5" />
    </svg>
  );
}
