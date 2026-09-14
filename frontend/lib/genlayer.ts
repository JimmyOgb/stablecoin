import { createClient, createAccount, generatePrivateKey, chains } from "genlayer-js";

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0xf7908d23780bA6fd489B5835f13143c5aF15Fe06") as `0x${string}`;

export const RPC_URL =
  process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api";

export interface ProtocolState {
  collateral_ratio: number;
  stability_fee_bps: number;
  last_reasoning: string;
  total_minted: number;
  total_collateral: number;
  asset_price_usd: number;
  last_fee_update?: number;
  cumulative_interest_factor?: number;
}

export interface UserPosition {
  user: string;
  collateral: number | string;
  collateral_usd: number;
  debt: number | string;
  max_debt: number | string;
  current_cr_bps: number;
  is_solvent: boolean;
  ausd_balance?: number | string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getClient(account?: any) {
  return createClient({
    chain: chains.studionet,
    endpoint: RPC_URL,
    account: account || undefined,
  });
}

export async function getProtocolState(): Promise<ProtocolState> {
  const client = getClient();
  const state = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_state",
    args: [],
  });
  return state as unknown as ProtocolState;
}

export async function getUserPosition(address: string): Promise<UserPosition> {
  const client = getClient();
  const position = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_user_position",
    args: [address],
  });
  return position as unknown as UserPosition;
}

export async function getAusdBalance(address: string): Promise<number | string> {
  const client = getClient();
  const balance = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "balance_of",
    args: [address],
  });
  return balance as unknown as (number | string);
}

export { createAccount, generatePrivateKey };
