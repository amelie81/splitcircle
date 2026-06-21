import { describe, it, expect } from 'vitest';
import { createFlowMatrix } from '../src/chain/flowMatrix';
import type { Address } from '../src/domain/types';
import type { PathfindingResult } from '@aboutcircles/sdk-types';

const A = '0x1111111111111111111111111111111111111111' as Address;
const B = '0x2222222222222222222222222222222222222222' as Address;
const C = '0x3333333333333333333333333333333333333333' as Address;
const DATA = '0xabcd' as `0x${string}`;

describe('createFlowMatrix', () => {
  it('encodes a direct single-hop transfer', () => {
    const result: PathfindingResult = {
      maxFlow: 12n,
      transfers: [{ from: A, to: C, tokenOwner: A, value: 12n }],
    };
    const m = createFlowMatrix(A, C, result, DATA);
    expect(m.flowVertices).toEqual([A, C]);
    // edge: [tokenOwner A=0, from A=0, to C=1] -> 0000 0000 0001
    expect(m.packedCoordinates).toBe('0x000000000001');
    expect(m.flowEdges).toEqual([{ streamSinkId: 1, amount: 12n }]);
    expect(m.streams).toEqual([{ sourceCoordinate: 0, flowEdgeIds: [0], data: DATA }]);
  });

  it('encodes a two-hop path and marks only the sink edge', () => {
    const result: PathfindingResult = {
      maxFlow: 5n,
      transfers: [
        { from: A, to: B, tokenOwner: A, value: 5n },
        { from: B, to: C, tokenOwner: B, value: 5n },
      ],
    };
    const m = createFlowMatrix(A, C, result, DATA);
    expect(m.flowVertices).toEqual([A, B, C]); // sorted ascending, unique
    // edge0 [0,0,1] edge1 [1,1,2]
    expect(m.packedCoordinates).toBe('0x000000000001000100010002');
    expect(m.flowEdges).toEqual([
      { streamSinkId: 0, amount: 5n }, // A->B, intermediate
      { streamSinkId: 1, amount: 5n }, // B->C, delivers to creditor
    ]);
    expect(m.streams[0].sourceCoordinate).toBe(0); // sourced at debtor A
    expect(m.streams[0].flowEdgeIds).toEqual([1]); // the sink edge
  });

  it('keeps vertices ascending regardless of path order', () => {
    const result: PathfindingResult = {
      maxFlow: 1n,
      transfers: [{ from: C, to: A, tokenOwner: B, value: 1n }],
    };
    const m = createFlowMatrix(C, A, result, DATA);
    expect(m.flowVertices).toEqual([A, B, C]);
  });

  it('throws on an empty path', () => {
    expect(() => createFlowMatrix(A, C, { maxFlow: 0n, transfers: [] }, DATA)).toThrow();
  });
});
