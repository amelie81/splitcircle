import type { PathfindingResult } from '@aboutcircles/sdk-types';
import type { Address } from '../domain/types';

// Shapes accepted by core.hubV2.operateFlowMatrix(...). Mirrors the Hub V2 ABI:
//   _flowVertices  address[]              sorted-ascending unique addresses
//   _flow          {streamSinkId,amount}[]  one entry per transfer edge
//   _streams       {sourceCoordinate,flowEdgeIds,data}[]
//   _packedCoordinates bytes             3 big-endian uint16 per edge:
//                                        [tokenOwner, from, to] as vertex indices
export interface FlowEdge {
  streamSinkId: number;
  amount: bigint;
}
export interface Stream {
  sourceCoordinate: number;
  flowEdgeIds: number[];
  data: `0x${string}`;
}
export interface FlowMatrixArgs {
  flowVertices: Address[];
  flowEdges: FlowEdge[];
  streams: Stream[];
  packedCoordinates: `0x${string}`;
}

function u16(n: number): string {
  if (n < 0 || n > 0xffff) throw new Error(`coordinate out of uint16 range: ${n}`);
  return n.toString(16).padStart(4, '0');
}

/** Convert a pathfinder result for a single `from → to` flow into the argument
 *  tuple for Hub V2 `operateFlowMatrix`, embedding `txData` as the stream's
 *  metadata so the transfer carries our settlement-intent reference on-chain.
 *
 *  The contract requires `flowVertices` to be strictly ascending and unique, and
 *  reads coordinates as uint16 indices into that array. A single debtor→creditor
 *  settlement is exactly one stream whose terminal (sink) edges are those that
 *  deliver to the creditor. */
export function createFlowMatrix(
  from: Address,
  to: Address,
  result: PathfindingResult,
  txData: `0x${string}`,
): FlowMatrixArgs {
  const { transfers } = result;
  if (transfers.length === 0) throw new Error('empty path');

  // 1) sorted-ascending unique vertex set over every address the edges touch
  const set = new Map<string, Address>();
  const add = (a: string) => set.set(a.toLowerCase(), a as Address);
  add(from);
  add(to);
  for (const t of transfers) {
    add(t.from);
    add(t.to);
    add(t.tokenOwner);
  }
  const flowVertices = [...set.values()].sort((a, b) => {
    const av = BigInt(a);
    const bv = BigInt(b);
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
  const coord = new Map<string, number>();
  flowVertices.forEach((a, i) => coord.set(a.toLowerCase(), i));
  const idx = (a: string) => {
    const c = coord.get(a.toLowerCase());
    if (c === undefined) throw new Error(`address not in vertex set: ${a}`);
    return c;
  };

  // 2) one flow edge per transfer step; sink edges deliver to the creditor
  const sink = to.toLowerCase();
  const flowEdges: FlowEdge[] = [];
  const sinkEdgeIds: number[] = [];
  let packed = '';
  transfers.forEach((t, i) => {
    const isSink = t.to.toLowerCase() === sink;
    flowEdges.push({ streamSinkId: isSink ? 1 : 0, amount: t.value });
    if (isSink) sinkEdgeIds.push(i);
    packed += u16(idx(t.tokenOwner)) + u16(idx(t.from)) + u16(idx(t.to));
  });

  // 3) a single stream sourced at the debtor, carrying the intent in `data`
  const streams: Stream[] = [
    {
      sourceCoordinate: idx(from),
      flowEdgeIds: sinkEdgeIds,
      data: txData,
    },
  ];

  return {
    flowVertices,
    flowEdges,
    streams,
    packedCoordinates: `0x${packed}`,
  };
}
