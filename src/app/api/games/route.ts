import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { games } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  MAX_TIME_CONTROL,
  MIN_TIME_CONTROL,
  serializeGame,
  upsertUser,
} from "@/lib/game-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { whitePlayerName, blackPlayerName, timeControl, increment } = body;

    const seconds = Number(timeControl);
    if (!Number.isFinite(seconds) || seconds < MIN_TIME_CONTROL || seconds > MAX_TIME_CONTROL) {
      return NextResponse.json(
        { error: `timeControl must be between ${MIN_TIME_CONTROL} and ${MAX_TIME_CONTROL} seconds` },
        { status: 400 }
      );
    }

    const inc = Number.isFinite(Number(increment))
      ? Math.min(60, Math.max(0, Math.floor(Number(increment))))
      : 0;

    const whiteName = String(whitePlayerName ?? "").trim() || "White";
    const blackName = String(blackPlayerName ?? "").trim() || null;

    // Use session if the user is authenticated.
    // For Matchmaking, they are authenticated. For Play with Friend/Computer, they might not be.
    // However, if they are authenticated, we don't actually pass userId in the body.
    // We should rely on getSessionFromReq to get their true identity if they created the game.
    const { getSessionFromReq } = await import("@/lib/auth");
    const session = await getSessionFromReq(req);
    
    const initial = Math.floor(seconds);
    const gameId = randomUUID().slice(0, 8);

    const [newGame] = await db
      .insert(games)
      .values({
        id: gameId,
        whitePlayerId: session ? session.userId : null,
        blackPlayerId: null, // second player joins later, or bot
        whitePlayerName: session ? session.username : whiteName,
        blackPlayerName: blackName,
        status: "playing",
        timeControl: initial,
        increment: inc,
        whiteTimeRemaining: initial,
        blackTimeRemaining: initial,
      })
      .returning();

    return NextResponse.json({ game: serializeGame(newGame) }, { status: 201 });
  } catch (error) {
    console.error("Error creating game:", error);
    return NextResponse.json({ error: "Failed to create game" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 20;

    const rows =
      status === "playing" || status === "finished"
        ? await db
            .select()
            .from(games)
            .where(eq(games.status, status))
            .orderBy(desc(games.createdAt))
            .limit(limit)
        : await db.select().from(games).orderBy(desc(games.createdAt)).limit(limit);

    return NextResponse.json({ games: rows.map(serializeGame) });
  } catch (error) {
    console.error("Error listing games:", error);
    return NextResponse.json({ error: "Failed to list games" }, { status: 500 });
  }
}
