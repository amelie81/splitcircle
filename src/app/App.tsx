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
      <div>
        <h1>SplitCircle</h1>
        <span className="sub">Shared expenses, settled in CRC</span>
      </div>
    </div>
  );
}
