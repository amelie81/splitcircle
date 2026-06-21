import { useSyncExternalStore } from 'react';
import { isMiniappMode, onWalletChange } from '../../host/bridge';
import { asAddress } from '../../domain/validation';
import type { Address } from '../../domain/types';

export interface WalletState {
  miniapp: boolean;
  address: Address | null;
  // becomes true after the first onWalletChange callback fires
  ready: boolean;
}

let state: WalletState = {
  miniapp: isMiniappMode(),
  address: null,
  ready: false,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// onWalletChange is authoritative: it fires immediately with the current state
// and again on every change. We reset group-scoped caches elsewhere by reacting
// to address changes, so accounts never bleed data into each other.
let started = false;
function start() {
  if (started || !state.miniapp) return;
  started = true;
  onWalletChange((raw) => {
    const address = raw ? safeAddress(raw) : null;
    state = { ...state, address, ready: true };
    emit();
  });
}

function safeAddress(raw: string): Address | null {
  try {
    return asAddress(raw);
  } catch {
    return null;
  }
}

export function getWalletState(): WalletState {
  return state;
}

export function subscribeWallet(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWallet(): WalletState {
  return useSyncExternalStore(subscribeWallet, getWalletState, getWalletState);
}
