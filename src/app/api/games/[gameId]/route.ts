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
    const getBotElo = (name: string | null) => {
      if (!name) return undefined;
      const match = name.match(/Stockfish \(Level (\d+)\)/);
      if (match) {
        const level = parseInt(match[1]);
        const elos = [0, 400, 800, 1100, 1400, 1700, 2000, 2300, 2500, 2700, 2900, 3100, 3300];
        return elos[level] || 1500;
      }
      return undefined;
    };

    if (game.whitePlayerId) {
      const [w] = await db.select().from(users).where(eq(users.id, game.whitePlayerId));
      if (w) players.white = { username: w.username, rating: w.rating };
    } else {
      const botElo = getBotElo(game.whitePlayerName);
      if (botElo) players.white = { username: game.whitePlayerName || "Stockfish", rating: botElo };
    }

    if (game.blackPlayerId) {
      const [b] = await db.select().from(users).where(eq(users.id, game.blackPlayerId));
      if (b) players.black = { username: b.username, rating: b.rating };
    } else {
      const botElo = getBotElo(game.blackPlayerName);
      if (botElo) players.black = { username: game.blackPlayerName || "Stockfish", rating: botElo };
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
