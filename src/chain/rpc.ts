import { CirclesRpc } from '@aboutcircles/sdk-rpc';

// Two endpoints, two jobs (see spec §5.1). Phase A/D should VERIFY which endpoint
// answers which method; until then route each call to the documented instance.
// 1) Profiles + general indexer reads (getProfileByAddress, circles_events):
export const CIRCLES_RPC_URL = 'https://rpc.aboutcircles.com/';
// 2) Pathfinder routing (findPath / findMaxFlow):
export const PATHFINDER_RPC_URL = 'https://rpc.circlesubi.network/';

// Pathfinder routing instance:
export const pathfinderRpc = new CirclesRpc(PATHFINDER_RPC_URL);
// General reads instance (profiles, events):
export const readRpc = new CirclesRpc(CIRCLES_RPC_URL);
