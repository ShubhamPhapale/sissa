import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { games, moves } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { analyzeGame } from "@/lib/game-analysis";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.moves && Array.isArray(body.moves)) {
      const analysis = await analyzeGame(body.moves);
      return NextResponse.json({ analysis });
    }

    const gameId = String(body.gameId ?? "").trim();

    if (!gameId) {
      return NextResponse.json({ error: "gameId or moves are required" }, { status: 400 });
    }

    // Verify the game exists and is finished.
    const [game] = await db.select().from(games).where(eq(games.id, gameId));
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (game.analysis) {
      return NextResponse.json({ analysis: game.analysis });
    }

    // Fetch moves ordered by move number.
    const gameMoves = await db
      .select()
      .from(moves)
      .where(eq(moves.gameId, gameId))
      .orderBy(asc(moves.moveNumber), asc(moves.id));

    if (gameMoves.length === 0) {
      return NextResponse.json({ error: "No moves found for this game" }, { status: 404 });
    }

    const moveList = gameMoves.map((m) => ({
      san: m.san,
      from: m.from,
      to: m.to,
      promotion: m.promotion || null,
    }));

    const analysis = await analyzeGame(moveList);

    await db.update(games).set({ analysis }).where(eq(games.id, gameId));

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("Error analyzing game:", error);
    return NextResponse.json(
      { error: "Failed to analyze game" },
      { status: 500 }
    );
  }
}
