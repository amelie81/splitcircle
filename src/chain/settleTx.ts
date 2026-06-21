import { Core } from '@aboutcircles/sdk-core';
import { encodeCrcV2TransferData } from '@aboutcircles/sdk-utils';
import { sendTransactions, type Transaction } from '../host/bridge';
import { routeFor } from './pathfinder';
import { createFlowMatrix } from './flowMatrix';
import type { Address } from '../domain/types';

// Building calldata needs no RPC, so a default-config Core (Gnosis Chain) suffices.
const core = new Core();

/** Encode the HMAC settlement-intent token as Circles V2 transfer data so it is
 *  recoverable from the indexer event. 0x0001 = UTF-8 text payload. */
export function intentToTxData(intentToken: string): `0x${string}` {
  return encodeCrcV2TransferData([intentToken], 0x0001);
}

/** Normalize a tx value to the hex string the miniapp SDK expects. Accepts the
 *  BigInt the contract wrapper returns, or a decimal/hex string. */
function toHexValue(v: bigint | string | undefined): string {
  if (v === undefined || v === null || v === '') return '0x0';
  const n = typeof v === 'bigint' ? v : BigInt(v); // BigInt('0x..') and BigInt('123') both work
  return `0x${n.toString(16)}`;
}

/**
 * Build the settlement transfer for `from → to` of `amountMicro` µCRC, carrying
 * `intentToken` on-chain, and submit it through the host wallet.
 *
 * NOTE (Phase D, verify on-chain): this issues a single `operateFlowMatrix` over
 * the routed path. Routes that spend ERC20-wrapped balances also need unwrap /
 * approve transactions prepended — add them here once verified against a live
 * route. Returns the host's submission references (tx hashes).
 */
export async function submitSettlement(args: {
  from: Address;
  to: Address;
  amountMicro: bigint;
  intentToken: string;
}): Promise<string[]> {
  const route = await routeFor(args.from, args.to, args.amountMicro);
  if (route.transfers.length === 0) {
    throw new Error('No route found for this settlement.');
  }
  const txData = intentToTxData(args.intentToken);
  const m = createFlowMatrix(args.from, args.to, route, txData);
  const tx = core.hubV2.operateFlowMatrix(
    m.flowVertices,
    m.flowEdges,
    m.streams,
    m.packedCoordinates,
  );
  const hostTx: Transaction = {
    to: tx.to,
    data: tx.data ?? '0x',
    value: toHexValue(tx.value as bigint | string | undefined),
  };
  return sendTransactions([hostTx]);
}
