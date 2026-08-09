import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { games, moves } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { analyzeGame } from "@/lib/game-analysis";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const gameId = String(body.gameId ?? "").trim();

    if (!gameId) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    // Verify the game exists and is finished.
    const [game] = await db.select().from(games).where(eq(games.id, gameId));
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
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

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("Error analyzing game:", error);
    return NextResponse.json(
      { error: "Failed to analyze game" },
      { status: 500 }
    );
  }
}
