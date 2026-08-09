import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { games, moves as movesTable, users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { serializeGame, settleTimeout } from "@/lib/game-service";

/**
 * Returns the full authoritative game state: position, move list, live clocks
 * and player ratings. Flag-falls are settled here so an abandoned game still
 * resolves correctly for whoever loads it next.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;

    const [row] = await db.select().from(games).where(eq(games.id, gameId));
    if (!row) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const game = await settleTimeout(row);

    const gameMoves = await db
      .select()
      .from(movesTable)
      .where(eq(movesTable.gameId, gameId))
      .orderBy(asc(movesTable.moveNumber), asc(movesTable.id));

    const players: Record<string, { username: string; rating: number } | null> = {
      white: null,
      black: null,
    };
    if (game.whitePlayerId) {
      const [w] = await db.select().from(users).where(eq(users.id, game.whitePlayerId));
      if (w) players.white = { username: w.username, rating: w.rating };
    }
    if (game.blackPlayerId) {
      const [b] = await db.select().from(users).where(eq(users.id, game.blackPlayerId));
      if (b) players.black = { username: b.username, rating: b.rating };
    }

    return NextResponse.json({
      game: serializeGame(game),
      moves: gameMoves,
      players,
    });
  } catch (error) {
    console.error("Error getting game:", error);
    return NextResponse.json({ error: "Failed to get game" }, { status: 500 });
  }
}
