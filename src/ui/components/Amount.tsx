import { formatCrc } from '../../domain/money';

type Tone = 'plain' | 'owe' | 'owed' | 'settled';

export function Amount({
  micro,
  tone = 'plain',
  big = false,
  decimals = 2,
  withUnit = true,
}: {
  micro: bigint;
  tone?: Tone;
  big?: boolean;
  decimals?: number;
  withUnit?: boolean;
}) {
  const cls = ['amount', big ? 'big' : '', tone === 'plain' ? '' : tone]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls}>
      {formatCrc(micro, decimals)}
      {withUnit ? ' CRC' : ''}
    </span>
  );
}
