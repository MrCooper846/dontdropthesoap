import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.SOAP_LEGACY !== "true"
  ) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const { getGlobalLeaderboard } = await import("@/lib/leaderboard");
    const leaderboard = await getGlobalLeaderboard(10);
    return NextResponse.json(
      { leaderboard },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch {
    console.error(
      JSON.stringify({
        event: "legacy.leaderboard.failed",
        code: "INTERNAL_ERROR",
      }),
    );
    return NextResponse.json(
      { leaderboard: [], error: "Failed to load noodle rankings." },
      { status: 500 },
    );
  }
}
