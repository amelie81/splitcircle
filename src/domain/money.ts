export const MICRO = 1_000_000n; // 1 CRC = 1e6 µCRC (our internal unit)

/** Parse a user-typed amount like "12.5" or "12,50" into µCRC. Rejects junk. */
export function parseCrc(input: string): bigint {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error('invalid amount');
  const [whole, frac = ''] = s.split('.');
  const fracPadded = (frac + '000000').slice(0, 6);
  return BigInt(whole) * MICRO + BigInt(fracPadded);
}

/** Format µCRC for display: 2 decimals by default (banking-style). */
export function formatCrc(micro: bigint, decimals = 2): string {
  const neg = micro < 0n;
  const abs = neg ? -micro : micro;
  const whole = abs / MICRO;
  const frac = (abs % MICRO).toString().padStart(6, '0').slice(0, decimals);
  return `${neg ? '-' : ''}${whole}${decimals ? '.' + frac : ''}`;
}

/** µCRC -> Pathfinder/protocol native unit. VERIFY the exponent in Phase A (§5.2). */
export function microToPathfinder(micro: bigint): bigint {
  return micro * 10n ** 12n;
}

export function pathfinderToMicro(amt: bigint): bigint {
  return amt / 10n ** 12n;
}
