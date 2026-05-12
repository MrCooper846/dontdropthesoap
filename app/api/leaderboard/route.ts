import { NextResponse } from "next/server";
import { getGlobalLeaderboard } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const leaderboard = await getGlobalLeaderboard(10);
  return NextResponse.json({ leaderboard });
}
