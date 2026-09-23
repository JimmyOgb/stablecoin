import { createClient, chains } from "genlayer-js";

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x570b0cf93Ca31200B6706E2534fC4d90ea0ff5C6") as `0x${string}`;

export const RPC_URL =
  process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api";

export interface ProtocolState {
  collateral_ratio: number;
  mint_collateral_ratio?: number;
  liquidation_ratio?: number;
  stability_fee_bps: number;
  last_reasoning: string;
  total_minted: number;
  total_collateral: number;
  total_collateral_usd?: number;
  solvency_ratio_bps?: number;
  eth_price_usd?: number;
  asset_price_usd: number;
  collateral_price_usd?: number;
  last_fee_update?: number;
  cumulative_interest_factor?: number;
  is_telemetry_verified?: boolean;
  telemetry_source?: string;
  telemetry_timestamp?: number;
}

export interface UserPosition {
  user: string;
  collateral: number | string;
  collateral_usd: number;
  debt: number | string;
  max_debt: number | string;
  current_cr_bps: number;
  mint_collateral_ratio?: number;
  liquidation_ratio?: number;
  is_solvent: boolean;
  is_liquidatable?: boolean;
  ausd_balance?: number | string;
  eth_price_usd?: number;
  asset_price_usd?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getClient(accountOrAddress?: any, provider?: any) {
  return createClient({
    chain: chains.studionet,
    endpoint: RPC_URL,
    account: accountOrAddress || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider: provider || (typeof window !== "undefined" ? (window as any).ethereum : undefined),
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
