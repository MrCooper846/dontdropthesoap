import { NextResponse } from "next/server";
import { getGlobalLeaderboard } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  try {
    const leaderboard = await getGlobalLeaderboard(10);
    return NextResponse.json(
      { leaderboard },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  } catch (error) {
    console.error("Failed to load global noodle rankings", error);
    return NextResponse.json({ leaderboard: [], error: "Failed to load noodle rankings." }, { status: 500 });
  }
}
