import type { PathfindingResult } from '@aboutcircles/sdk-types';
import { pathfinderRpc } from './rpc';
import { microToPathfinder, pathfinderToMicro } from '../domain/money';
import type { Address } from '../domain/types';

/** Maximum CRC, in µCRC, that `from` can route to `to` over the trust graph
 *  right now. Used to annotate/disable a settle leg the graph can't fully carry. */
export async function maxRoutableMicro(from: Address, to: Address): Promise<bigint> {
  const maxFlow = await pathfinderRpc.pathfinder.findMaxFlow({
    from,
    to,
    useWrappedBalances: true, // include ERC20 wrappers the sender may hold
  });
  return pathfinderToMicro(maxFlow);
}

/** Find a concrete route for `targetMicro` µCRC from `from` to `to`. Pathfinder
 *  amounts are protocol-native atto-units; conversion lives in money.ts. */
export async function routeFor(
  from: Address,
  to: Address,
  targetMicro: bigint,
): Promise<PathfindingResult> {
  return pathfinderRpc.pathfinder.findPath({
    from,
    to,
    targetFlow: microToPathfinder(targetMicro),
    useWrappedBalances: true,
    maxTransfers: 6, // cap hops for responsiveness; raise if maxFlow falls short
  });
}
