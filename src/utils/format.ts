import { formatCrc } from '../domain/money';
import type { Address, Member } from '../domain/types';
import { fallbackName } from '../domain/validation';

export function crc(micro: bigint, decimals = 2): string {
  return `${formatCrc(micro, decimals)} CRC`;
}

export function nameFor(members: Member[], address: Address): string {
  const m = members.find((x) => x.address.toLowerCase() === address.toLowerCase());
  return m ? fallbackName(m) : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function firstName(members: Member[], address: Address): string {
  return nameFor(members, address).split(/\s+/)[0];
}

export function monogram(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith('0x')) return trimmed.slice(2, 4).toUpperCase();
  return trimmed.slice(0, 1).toUpperCase() || '?';
}
