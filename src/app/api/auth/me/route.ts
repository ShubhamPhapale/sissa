import { NextRequest, NextResponse } from "next/server";
import { getSessionFromReq } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req);
    if (!session) {
      return NextResponse.json({ user: null });
    }

    const [user] = await db.select({
      id: users.id,
      username: users.username,
      rating: users.rapidRating, // Default to rapid for general display
      bulletRating: users.bulletRating,
      blitzRating: users.blitzRating,
      rapidRating: users.rapidRating,
      classicalRating: users.classicalRating,
      wins: users.wins,
      losses: users.losses,
      draws: users.draws
    }).from(users).where(eq(users.id, session.userId));

    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ user: null });
  }
}
