import { NextRequest } from "next/server";
import { db, pool } from "@/db";
import { games, moves as movesTable, users } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { serializeGame, settleTimeout, gameEmitter } from "@/lib/game-service";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await context.params;

  let cleanup = () => {};

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      const channel = `game_update_${gameId}`;

      const closeStream = () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(pingInterval);
        gameEmitter.off(channel, sendUpdate);
        try { controller.close(); } catch {}
      };

      cleanup = closeStream;
      req.signal.addEventListener("abort", closeStream);

      const sendUpdate = async () => {
        if (isClosed) return;
        try {
          const [row] = await db.select().from(games).where(eq(games.id, gameId));
          if (!row) return;

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

          const data = JSON.stringify({
            game: serializeGame(game),
            moves: gameMoves,
            players,
          });

          controller.enqueue(`data: ${data}\n\n`);
        } catch (error) {
          console.error("Error sending SSE update:", error);
        }
      };

      gameEmitter.on(channel, sendUpdate);

      // Send initial data immediately
      await sendUpdate();

      // Keep connection alive with periodic pings
      const pingInterval = setInterval(() => {
        if (!isClosed) {
          try {
            controller.enqueue(": ping\n\n");
          } catch {
            closeStream();
          }
        }
      }, 15000);
    },
    cancel() {
      cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
