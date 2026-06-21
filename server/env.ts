import { randomBytes } from 'node:crypto';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing env ${name}`);
  return v;
}

// In production the HMAC key MUST be provided. For the demo we generate an
// ephemeral one so the server still boots, but warn loudly — intents minted
// against an ephemeral key do not survive a restart.
function hmacKey(): string {
  const fromEnv = process.env.SPLITCIRCLE_HMAC_KEY;
  if (fromEnv && fromEnv !== 'replace-with-32-byte-random-hex') return fromEnv;
  const ephemeral = randomBytes(32).toString('hex');
  console.warn(
    '[splitcircle] SPLITCIRCLE_HMAC_KEY not set — using an ephemeral key. ' +
      'Settlement intents will not survive a restart.',
  );
  return ephemeral;
}

export const env = {
  port: Number(required('PORT', '8787')),
  hmacKey: hmacKey(),
  dbPath: required('SPLITCIRCLE_DB', './data/splitcircle.json'),
  circlesRpcUrl: required('CIRCLES_RPC_URL', 'https://rpc.aboutcircles.com/'),
  pathfinderRpcUrl: required('PATHFINDER_RPC_URL', 'https://rpc.circlesubi.network/'),
};
