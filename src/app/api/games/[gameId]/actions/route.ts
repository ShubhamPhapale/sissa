import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { games } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseFEN } from "@/lib/chess-engine";
import { finalizeGame, serializeGame, settleTimeout, notifyGameUpdate } from "@/lib/game-service";

type Action =
  | "resign"
  | "offer-draw"
  | "accept-draw"
  | "decline-draw"
  | "claim-timeout";

/**
 * Game actions that are not moves. Every result-changing action is validated
 * server-side, so a client can only ever resign *itself* and a draw requires
 * both sides to agree.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;
    const body = await req.json().catch(() => ({}));
    const action = body.action as Action;
    const color = body.color as "w" | "b" | undefined;

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }
    if (color !== "w" && color !== "b") {
      return NextResponse.json({ error: "Missing or invalid color" }, { status: 400 });
    }

    const [row] = await db.select().from(games).where(eq(games.id, gameId));
    if (!row) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const game = await settleTimeout(row);
    if (game.status !== "playing") {
      return NextResponse.json(
        { error: "Game is already finished", game: serializeGame(game) },
        { status: 409 }
      );
    }

    switch (action) {
      case "resign": {
        // A player may only resign on their own behalf.
        const winner = color === "w" ? "b" : "w";
        const finished = await finalizeGame(gameId, winner, "resignation");
        await notifyGameUpdate(gameId);
        return NextResponse.json({ game: serializeGame(finished ?? game) });
      }

      case "offer-draw": {
        if (game.drawOfferedBy === color) {
          return NextResponse.json({ game: serializeGame(game) });
        }
        // Offering while an opposing offer stands = accepting it.
        if (game.drawOfferedBy && game.drawOfferedBy !== color) {
          const finished = await finalizeGame(gameId, "draw", "agreement");
          await notifyGameUpdate(gameId);
          return NextResponse.json({ game: serializeGame(finished ?? game) });
        }
        const [updated] = await db
          .update(games)
          .set({ drawOfferedBy: color, updatedAt: new Date() })
          .where(eq(games.id, gameId))
          .returning();
        await notifyGameUpdate(gameId);
        return NextResponse.json({ game: serializeGame(updated) });
      }

      case "accept-draw": {
        if (!game.drawOfferedBy || game.drawOfferedBy === color) {
          return NextResponse.json(
            { error: "No draw offer from your opponent" },
            { status: 409 }
          );
        }
        const finished = await finalizeGame(gameId, "draw", "agreement");
        await notifyGameUpdate(gameId);
        return NextResponse.json({ game: serializeGame(finished ?? game) });
      }

      case "decline-draw": {
        const [updated] = await db
          .update(games)
          .set({ drawOfferedBy: null, updatedAt: new Date() })
          .where(eq(games.id, gameId))
          .returning();
        await notifyGameUpdate(gameId);
        return NextResponse.json({ game: serializeGame(updated) });
      }

      case "claim-timeout": {
        // Only valid if the opponent's flag has actually fallen.
        const settled = await settleTimeout(game);
        if (settled.status === "playing") {
          const turn = parseFEN(settled.fen).turn;
          return NextResponse.json(
            { error: `No flag fall (${turn} still has time)`, game: serializeGame(settled) },
            { status: 409 }
          );
        }
        await notifyGameUpdate(gameId);
        return NextResponse.json({ game: serializeGame(settled) });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("Error performing action:", error);
    return NextResponse.json({ error: "Failed to perform action" }, { status: 500 });
  }
}
