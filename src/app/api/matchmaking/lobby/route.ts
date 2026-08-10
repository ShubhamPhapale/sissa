import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { matchmaking, users } from "@/db/schema";
import { eq, lte, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    // 1. Cleanup old requests (older than 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    await db.delete(matchmaking).where(lte(matchmaking.createdAt, fiveMinutesAgo));

    // 2. Fetch active requests
    const activeRequests = await db
      .select({
        id: matchmaking.id,
        rating: matchmaking.rating,
        timeControl: matchmaking.timeControl,
        increment: matchmaking.increment,
        username: users.username,
        userId: users.id,
      })
      .from(matchmaking)
      .leftJoin(users, eq(matchmaking.userId, users.id))
      .orderBy(desc(matchmaking.createdAt))
      .limit(50);

    return NextResponse.json({ lobby: activeRequests });
  } catch (error) {
    console.error("Lobby fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch lobby" }, { status: 500 });
  }
}
