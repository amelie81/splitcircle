import { CIRCLES_RPC_URL } from './rpc';
import type { Address } from '../domain/types';

export interface CirclesProfile {
  name?: string;
  description?: string;
  previewImageUrl?: string;
  imageUrl?: string;
}

const cache = new Map<string, CirclesProfile | null>();

/** Look up a Circles profile by address. Returns null for brand-new accounts —
 *  that is normal, not an error. Results are cached for the session. */
export async function fetchProfile(address: Address): Promise<CirclesProfile | null> {
  const key = address.toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const res = await fetch(CIRCLES_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'circles_getProfileByAddress',
        params: [address],
      }),
    });
    if (!res.ok) throw new Error(`profile rpc ${res.status}`);
    const { result, error } = await res.json();
    if (error) throw new Error(error.message ?? 'profile rpc error');
    const profile = (result ?? null) as CirclesProfile | null;
    cache.set(key, profile);
    return profile;
  } catch {
    cache.set(key, null); // don't hammer the RPC on repeated misses
    return null;
  }
}
