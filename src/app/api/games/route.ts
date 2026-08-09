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
    const blackNameRaw = String(blackPlayerName ?? "").trim();
    const blackName = blackNameRaw || null;

    const whiteUser = await upsertUser(whiteName);
    const blackUser = blackName
      ? await upsertUser(
          // Guarantee two distinct identities even if both boxes had the same name.
          blackName === whiteName ? `${blackName} (black)` : blackName
        )
      : null;

    const initial = Math.floor(seconds);
    const gameId = randomUUID().slice(0, 8);

    const [newGame] = await db
      .insert(games)
      .values({
        id: gameId,
        whitePlayerId: whiteUser?.id ?? null,
        blackPlayerId: blackUser?.id ?? null,
        whitePlayerName: whiteUser?.username ?? whiteName,
        blackPlayerName: blackUser?.username ?? blackName,
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
