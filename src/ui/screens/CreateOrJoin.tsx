import { useState } from 'react';

export function CreateOrJoin({
  onCreate,
  onOpen,
  busy,
  error,
}: {
  onCreate: (name: string) => void;
  onOpen: (id: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [name, setName] = useState('');
  const [joinId, setJoinId] = useState('');

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Start a group</h2>
        <div className="field">
          <label htmlFor="gname">Group name</label>
          <input
            id="gname"
            placeholder="Munich weekend"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button
          className="btn primary block"
          disabled={busy || !name.trim()}
          onClick={() => onCreate(name.trim())}
        >
          {busy ? 'Creating…' : 'Create group'}
        </button>
      </div>

      <div className="card sunk">
        <h3 style={{ fontFamily: 'inherit', fontSize: '0.875rem', marginBottom: 10 }}>
          Have an invite?
        </h3>
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor="jid">Group id</label>
          <input
            id="jid"
            placeholder="grp_…"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
          />
        </div>
        <button
          className="btn ghost block"
          disabled={!joinId.trim()}
          onClick={() => onOpen(joinId.trim())}
        >
          Open group
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
