import { useEffect, useMemo, useState } from 'react';
import type { Member, Address } from '../../domain/types';
import type { Transfer } from '../../domain/settle';
import { legKey, type LegState } from '../../app/state/settlementStore';
import { firstName, monogram } from '../../utils/format';
import { formatCrc } from '../../domain/money';

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduce(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

interface Node {
  address: Address;
  name: string;
  mono: string;
  x: number;
  y: number;
  lx: number; // name label, pushed radially outward to clear the arcs
  ly: number;
}

/**
 * The signature element: members sit on a ring; the tangle of gross IOUs
 * (thin) fades as the minimal plan (few, thick) draws in. Confirmed legs turn
 * green. When everyone is square the ring is drawn calm and closed.
 */
export function GraphCanvas({
  members,
  gross,
  plan,
  legs,
}: {
  members: Member[];
  gross: Transfer[];
  plan: Transfer[];
  legs: Record<string, LegState>;
}) {
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(reduce);

  const planSig = useMemo(
    () => plan.map((t) => `${t.from}-${t.to}-${t.amountMicro}`).join('|'),
    [plan],
  );

  useEffect(() => {
    if (reduce) {
      setCollapsed(true);
      return;
    }
    setCollapsed(false);
    const t = setTimeout(() => setCollapsed(true), 480);
    return () => clearTimeout(t);
  }, [reduce, planSig]);

  const W = 320;
  const H = 272;
  const cx = W / 2;
  const cy = H / 2;
  const R = 88;

  const nodes = useMemo<Map<Address, Node>>(() => {
    const m = new Map<Address, Node>();
    const n = members.length;
    members.forEach((mem, i) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
      const name = firstName(members, mem.address);
      const x = cx + R * Math.cos(ang);
      const y = cy + R * Math.sin(ang);
      m.set(mem.address, {
        address: mem.address,
        name,
        mono: monogram(name),
        x,
        y,
        lx: cx + (R + 26) * Math.cos(ang),
        ly: cy + (R + 26) * Math.sin(ang) + 4,
      });
    });
    return m;
  }, [members, cx, cy]);

  const square = plan.length === 0;

  function arcPath(from: Address, to: Address): string {
    const a = nodes.get(from);
    const b = nodes.get(to);
    if (!a || !b) return '';
    // bow the curve toward the centre so opposing pairs don't overlap
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const ctrlX = mx + (cx - mx) * 0.32;
    const ctrlY = my + (cy - my) * 0.32;
    return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(
      1,
    )} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }

  function midpoint(from: Address, to: Address) {
    const a = nodes.get(from);
    const b = nodes.get(to);
    if (!a || !b) return { x: cx, y: cy };
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    return { x: mx + (cx - mx) * 0.18, y: my + (cy - my) * 0.18 };
  }

  return (
    <div className={`graph${collapsed ? ' collapsed' : ''}`} role="img" aria-label={graphLabel(plan, members, square)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="arrow-head" />
          </marker>
          <marker
            id="arrow-settled"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="arrow-head settled" />
          </marker>
        </defs>

        {/* calm closing ring when square */}
        {square && (
          <circle cx={cx} cy={cy} r={R} className="ring-closed" fill="none" />
        )}

        {/* the tangle — fades out on collapse */}
        {!square &&
          gross.map((t, i) => (
            <path key={`g-${i}`} d={arcPath(t.from, t.to)} className="gross-arc" fill="none" />
          ))}

        {/* the minimal plan — draws in on collapse */}
        {!square &&
          plan.map((t, i) => {
            const confirmed = legs[legKey(t)]?.phase === 'confirmed';
            return (
              <path
                key={`p-${i}`}
                d={arcPath(t.from, t.to)}
                className={`plan-arc${confirmed ? ' settled' : ''}`}
                fill="none"
                markerEnd={`url(#${confirmed ? 'arrow-settled' : 'arrow'})`}
              />
            );
          })}

        {/* amount labels on plan arcs */}
        {!square &&
          collapsed &&
          plan.map((t, i) => {
            const p = midpoint(t.from, t.to);
            const confirmed = legs[legKey(t)]?.phase === 'confirmed';
            return (
              <text
                key={`l-${i}`}
                x={p.x}
                y={p.y}
                className={`arc-label${confirmed ? ' settled' : ''}`}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {formatCrc(t.amountMicro)}
              </text>
            );
          })}

        {/* member nodes */}
        {[...nodes.values()].map((n) => (
          <g key={n.address}>
            <circle cx={n.x} cy={n.y} r="17" className="node-dot" />
            <text x={n.x} y={n.y} className="node-mono" textAnchor="middle" dominantBaseline="central">
              {n.mono}
            </text>
            <text x={n.lx} y={n.ly} className="node-name" textAnchor="middle">
              {n.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function graphLabel(plan: Transfer[], members: Member[], square: boolean): string {
  if (square) return 'Everyone is square. No payments needed.';
  const lines = plan.map(
    (t) => `${firstName(members, t.from)} pays ${firstName(members, t.to)} ${formatCrc(t.amountMicro)} CRC`,
  );
  return `Settlement plan: ${lines.join('; ')}.`;
}
