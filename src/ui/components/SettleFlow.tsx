import { useMemo } from 'react';

/**
 * Decorative animation of value travelling from the debtor through the
 * trust graph to the creditor. `hops` is the number of route edges (>=1);
 * we render hops-1 intermediate nodes between the two endpoints.
 *
 * `flowing` drives the moving dots (routing/submitting/confirming). When the
 * payment has landed (`done`) the path fills solid and the dots stop.
 */
export function SettleFlow({
  hops = 1,
  flowing,
  done,
  fromLabel,
  toLabel,
}: {
  hops?: number;
  flowing: boolean;
  done?: boolean;
  fromLabel: string;
  toLabel: string;
}) {
  // Cap intermediate nodes so a long route still reads cleanly on a phone.
  const inner = Math.min(Math.max(hops - 1, 0), 3);
  const nodes = inner + 2; // endpoints included
  const W = 260;
  const H = 44;
  const pad = 16;
  const span = W - pad * 2;

  const xs = useMemo(
    () => Array.from({ length: nodes }, (_, i) => pad + (span * i) / (nodes - 1)),
    [nodes, span],
  );
  const cy = H / 2;

  return (
    <div className="settle-flow" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="presentation">
        <line
          x1={xs[0]}
          y1={cy}
          x2={xs[xs.length - 1]}
          y2={cy}
          className={`flow-track${done ? ' done' : ''}`}
        />
        {flowing &&
          [0, 1, 2].map((i) => (
            <circle key={i} r="3" className="flow-dot" cy={cy}>
              <animate
                attributeName="cx"
                from={xs[0]}
                to={xs[xs.length - 1]}
                dur="1.6s"
                begin={`${i * 0.53}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}
        {xs.map((x, i) => (
          <circle
            key={i}
            cx={x}
            cy={cy}
            r={i === 0 || i === xs.length - 1 ? 6 : 4}
            className={`flow-node${i === xs.length - 1 && done ? ' arrived' : ''}`}
          />
        ))}
      </svg>
      <div className="flow-ends">
        <span>{fromLabel}</span>
        <span>{toLabel}</span>
      </div>
    </div>
  );
}
