import { NextResponse } from "next/server";
import { createAccount, generatePrivateKey } from "genlayer-js";
import {
  getClient,
  getProtocolState,
  CONTRACT_ADDRESS,
} from "@/lib/genlayer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handleRebalance(request);
}

export async function POST(request: Request) {
  return handleRebalance(request);
}

async function handleRebalance(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized keeper" }, { status: 401 });
    }

    const rawKey = process.env.KEEPER_PRIVATE_KEY;
    const privateKey = (rawKey && rawKey.startsWith("0x") ? rawKey : generatePrivateKey()) as `0x${string}`;
    const account = createAccount(privateKey);
    const client = getClient(account);

    // Trigger AI consensus rebalance on-chain
    const txHash = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "rebalance_policy",
      args: [],
      value: BigInt(0),
    });

    // Wait for validator consensus with extended retry window
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      retries: 50,
      interval: 4000,
    });

    const updatedState = await getProtocolState();

    return NextResponse.json({
      success: true,
      keeper: account.address,
      transactionHash: txHash,
      receiptStatus: receipt?.statusName || "ACCEPTED",
      state: updatedState,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
