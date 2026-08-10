import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { moves as movesTable, games } from "@/db/schema";
import { eq, asc, and } from "drizzle-orm";
import {
  parseFEN,
  stateToFEN,
  makeMove,
  generateSAN,
  generateLegalMoves,
  algebraicToSquare,
  squareToAlgebraic,
} from "@/lib/chess-engine";
import {
  buildPgn,
  finalizeGame,
  liveClocks,
  serializeGame,
  settleTimeout,
  elapsedSecondsFor,
  repetitionCount,
  notifyGameUpdate,
} from "@/lib/game-service";

const SQUARE_RE = /^[a-h][1-8]$/;

/**
 * Submits a move. The server is authoritative: it re-derives the position from
 * the stored FEN, verifies the move is legal for the side to move, and computes
 * the resulting position, clocks and game result itself. Clients cannot inject
 * a FEN, a result, or an illegal move.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;
    console.log(`[Move Request] Started for game ${gameId}`);
    const body = await req.json().catch(() => ({}));
    const { from, to, promotion, playerColor } = body as {
      from?: string;
      to?: string;
      promotion?: string;
      playerColor?: string;
    };

    if (!from || !to || !SQUARE_RE.test(from) || !SQUARE_RE.test(to)) {
      console.warn(`[Move Request] Invalid squares from=${from} to=${to}`);
      return NextResponse.json({ error: "Invalid 'from'/'to' square" }, { status: 400 });
    }
    if (promotion && !["Q", "R", "B", "N"].includes(promotion)) {
      return NextResponse.json({ error: "Invalid promotion piece" }, { status: 400 });
    }

    const [existing] = await db.select().from(games).where(eq(games.id, gameId));
    if (!existing) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Apply any pending flag-fall before accepting a move.
    const game = await settleTimeout(existing);
    if (game.status !== "playing") {
      return NextResponse.json(
        { error: "Game is not active", game: serializeGame(game) },
        { status: 409 }
      );
    }

    const state = parseFEN(game.fen);

    if (playerColor && playerColor !== state.turn) {
      return NextResponse.json(
        { error: "Not your turn", game: serializeGame(game) },
        { status: 409 }
      );
    }

    const fromSq = algebraicToSquare(from);
    const toSq = algebraicToSquare(to);

    const legal = generateLegalMoves(state, state.turn);
    const candidates = legal.filter(
      (m) =>
        m.from.row === fromSq.row &&
        m.from.col === fromSq.col &&
        m.to.row === toSq.row &&
        m.to.col === toSq.col
    );

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: `Illegal move: ${from}${to}`, game: serializeGame(game) },
        { status: 422 }
      );
    }

    // Promotion moves come in four flavours; pick the requested one (default queen).
    const chosen =
      candidates.find((m) => (promotion ? m.promotion === promotion : !m.promotion)) ??
      candidates.find((m) => m.promotion === "Q") ??
      candidates[0];

    // SAN must be generated against the position *before* the move.
    const san = generateSAN(state, chosen);
    const nextState = makeMove(state, chosen);

    // Deduct thinking time from the mover, then add the increment.
    const elapsed = elapsedSecondsFor(game);
    const moverRemaining =
      (state.turn === "w" ? game.whiteTimeRemaining : game.blackTimeRemaining) - elapsed;

    if (moverRemaining <= 0) {
      const winner = state.turn === "w" ? "b" : "w";
      const finished = await finalizeGame(gameId, winner, "timeout", {
        white: state.turn === "w" ? 0 : game.whiteTimeRemaining,
        black: state.turn === "b" ? 0 : game.blackTimeRemaining,
      });
      return NextResponse.json(
        { error: "Flag fell", game: serializeGame(finished ?? game) },
        { status: 409 }
      );
    }

    const newMoverTime = moverRemaining + game.increment;
    const whiteTime = state.turn === "w" ? newMoverTime : game.whiteTimeRemaining;
    const blackTime = state.turn === "b" ? newMoverTime : game.blackTimeRemaining;

    const priorMoves = await db
      .select()
      .from(movesTable)
      .where(eq(movesTable.gameId, gameId))
      .orderBy(asc(movesTable.moveNumber), asc(movesTable.id));

    const ply = priorMoves.length + 1;
    const fullSan = san + (chosen.checkmate ? "#" : chosen.check ? "+" : "");

    const pgn = buildPgn([
      ...priorMoves.map((m) => m.san),
      fullSan,
    ]);

    const [updated] = await db
      .update(games)
      .set({
        fen: stateToFEN(nextState),
        pgn,
        whiteTimeRemaining: whiteTime,
        blackTimeRemaining: blackTime,
        drawOfferedBy: null, // any pending offer is declined by moving
        lastMoveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(games.id, gameId), eq(games.fen, game.fen)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "State changed, please retry" }, { status: 409 });
    }

    const [inserted] = await db
      .insert(movesTable)
      .values({
        gameId,
        moveNumber: ply,
        san: fullSan,
        from: squareToAlgebraic(chosen.from),
        to: squareToAlgebraic(chosen.to),
        piece: chosen.piece as string,
        captured: (chosen.captured as string) ?? null,
        promotion: chosen.promotion ?? null,
        check: Boolean(chosen.check),
        checkmate: Boolean(chosen.checkmate),
        castle: chosen.castle ?? null,
        enPassant: Boolean(chosen.enPassant),
      })
      .returning();

    let finalGame = updated;

    if (nextState.gameOver) {
      const winner =
        nextState.winner === "draw" || nextState.winner === null ? "draw" : nextState.winner;
      const finished = await finalizeGame(gameId, winner, nextState.reason || "unknown", {
        white: whiteTime,
        black: blackTime,
      });
      if (finished) finalGame = finished;
    } else if (repetitionCount([...priorMoves, inserted]) >= 3) {
      // FIDE 9.2 — the same position occurred three times.
      const finished = await finalizeGame(gameId, "draw", "threefold repetition", {
        white: whiteTime,
        black: blackTime,
      });
      if (finished) finalGame = finished;
    }

    await notifyGameUpdate(gameId);

    console.log(`[Move Request] Success for game ${gameId}: ${from}->${to}`);
    return NextResponse.json(
      {
        move: inserted,
        game: serializeGame(finalGame),
        moves: [...priorMoves, inserted],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Move Request] FATAL ERROR submitting move:", error);
    return NextResponse.json({ error: "Failed to submit move" }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;
    const gameMoves = await db
      .select()
      .from(movesTable)
      .where(eq(movesTable.gameId, gameId))
      .orderBy(asc(movesTable.moveNumber), asc(movesTable.id));
    return NextResponse.json({ moves: gameMoves });
  } catch (error) {
    console.error("Error getting moves:", error);
    return NextResponse.json({ error: "Failed to get moves" }, { status: 500 });
  }
}
