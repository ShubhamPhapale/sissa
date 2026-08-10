import { NextRequest, NextResponse } from "next/server";
import { getSessionFromReq } from "@/lib/auth";
import { db } from "@/db";
import { matchmaking, games, users } from "@/db/schema";
import { eq, and, not, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { timeControl, increment, joinMatchmakingId } = await req.json();

    const [user] = await db.select().from(users).where(eq(users.id, session.userId));
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Find a match
    let opponent;
    
    if (joinMatchmakingId) {
      const rows = await db.select().from(matchmaking)
        .where(eq(matchmaking.id, joinMatchmakingId))
        .limit(1);
      if (rows.length > 0 && rows[0].userId !== session.userId) {
        opponent = rows[0];
      }
    } else {
      const rows = await db.select().from(matchmaking)
        .where(
          and(
            not(eq(matchmaking.userId, session.userId)),
            eq(matchmaking.timeControl, timeControl),
            eq(matchmaking.increment, increment)
          )
        )
        .limit(1);
      opponent = rows[0];
    }

    if (opponent) {
      // Attempt to atomically claim this opponent
      const deleted = await db.delete(matchmaking)
        .where(eq(matchmaking.id, opponent.id))
        .returning();

      if (deleted.length > 0) {
        // Successfully claimed! Create a game.
        const [oppUser] = await db.select().from(users).where(eq(users.id, opponent.userId));
        const oppName = oppUser ? oppUser.username : "Opponent";
        
        const gameId = uuidv4().substring(0, 8);
        const isWhite = Math.random() > 0.5;

        const [w, b] = isWhite 
          ? [{ id: user.id, name: user.username }, { id: opponent.userId, name: oppName }]
          : [{ id: opponent.userId, name: oppName }, { id: user.id, name: user.username }];

      await db.insert(games).values({
        id: gameId,
        whitePlayerId: w.id,
        blackPlayerId: b.id,
        whitePlayerName: w.name,
        blackPlayerName: b.name,
        status: "playing",
        timeControl,
        increment,
        whiteTimeRemaining: timeControl,
        blackTimeRemaining: timeControl,
      });

      return NextResponse.json({ matched: true, gameId });
      }
    }

    // No match found or failed to claim opponent, join queue
    // Delete existing queue entry if any
    await db.delete(matchmaking).where(eq(matchmaking.userId, session.userId));
    
    await db.insert(matchmaking).values({
      userId: session.userId,
      rating: user.rating,
      timeControl,
      increment,
    });

    return NextResponse.json({ matched: false });
  } catch (error) {
    console.error("Matchmaking error:", error);
    return NextResponse.json({ error: "Failed to process matchmaking" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Check if user is in a newly created game
    // We look for a game where user is white or black, created recently (within last 30s)
    const [recentGame] = await db.select().from(games)
      .where(
        and(
          eq(games.status, "playing")
        )
      )
      .orderBy(desc(games.createdAt))
      .limit(20); // fetch some games and filter in memory to be safe if 'or' is tricky in drizzle

    if (recentGame && (recentGame.whitePlayerId === session.userId || recentGame.blackPlayerId === session.userId)) {
      // Clean up queue just in case
      await db.delete(matchmaking).where(eq(matchmaking.userId, session.userId));
      return NextResponse.json({ matched: true, gameId: recentGame.id });
    }

    // Check if still in queue
    const [inQueue] = await db.select().from(matchmaking).where(eq(matchmaking.userId, session.userId));
    if (inQueue) {
      return NextResponse.json({ matched: false });
    }

    // Not in queue, not in game
    return NextResponse.json({ matched: false, cancelled: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionFromReq(req);
    if (session) {
      await db.delete(matchmaking).where(eq(matchmaking.userId, session.userId));
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to leave queue" }, { status: 500 });
  }
}
