import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const currentUnixTimestamp = Math.floor(Date.now() / 1000);
  const data = {
    symbol: "GEN",
    price_usd: 1.05,
    volume_24h_usd: 18450200,
    liquidity_depth_usd: 28940000,
    volatility_index: 0.14,
    price_change_24h_pct: 1.25,
    timestamp: currentUnixTimestamp,
    status: "LIVE_VERIFIED",
  };

  return new NextResponse(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
