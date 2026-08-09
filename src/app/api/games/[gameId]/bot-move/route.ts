import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { games, moves as movesTable } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { parseFEN, makeMove, generateSAN, generateLegalMoves, squareToAlgebraic, stateToFEN } from "@/lib/chess-engine";
import { settleTimeout, elapsedSecondsFor, finalizeGame, buildPgn, notifyGameUpdate, serializeGame, repetitionCount } from "@/lib/game-service";
import { analyzePosition } from "@/lib/stockfish-analysis";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;
    
    const [existing] = await db.select().from(games).where(eq(games.id, gameId));
    if (!existing) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    const game = await settleTimeout(existing);
    if (game.status !== "playing") return NextResponse.json({ error: "Game not active" }, { status: 400 });

    const state = parseFEN(game.fen);
    
    // Check if it's actually the bot's turn
    const isWhiteBot = game.whitePlayerName?.startsWith("Stockfish");
    const isBlackBot = game.blackPlayerName?.startsWith("Stockfish");
    
    if ((state.turn === 'w' && !isWhiteBot) || (state.turn === 'b' && !isBlackBot)) {
      return NextResponse.json({ error: "Not bot's turn" }, { status: 400 });
    }

    // Ask stockfish for best move
    const analysis = await analyzePosition(game.fen, 10);
    
    if (!analysis || !analysis.bestMove) {
      return NextResponse.json({ error: "Bot could not find move" }, { status: 500 });
    }

    // Find the move in legal moves
    const legal = generateLegalMoves(state, state.turn);
    const chosen = legal.find(m => {
      const fromAlg = squareToAlgebraic(m.from);
      const toAlg = squareToAlgebraic(m.to);
      const promoAlg = m.promotion ? m.promotion.toLowerCase() : "";
      return (fromAlg + toAlg + promoAlg) === analysis.bestMove;
    });

    if (!chosen) {
      // Fallback to random move if stockfish returned nonsense (shouldn't happen)
      const randomMove = legal[Math.floor(Math.random() * legal.length)];
      if (!randomMove) return NextResponse.json({ error: "No legal moves" }, { status: 400 });
      Object.assign(chosen ?? {}, randomMove);
    }

    // Execute move exactly like normal player
    const san = generateSAN(state, chosen!);
    const nextState = makeMove(state, chosen!);

    const elapsed = elapsedSecondsFor(game);
    const moverRemaining = (state.turn === "w" ? game.whiteTimeRemaining : game.blackTimeRemaining) - elapsed;

    if (moverRemaining <= 0) {
      const winner = state.turn === "w" ? "b" : "w";
      const finished = await finalizeGame(gameId, winner, "timeout", {
        white: state.turn === "w" ? 0 : game.whiteTimeRemaining,
        black: state.turn === "b" ? 0 : game.blackTimeRemaining,
      });
      return NextResponse.json({ game: serializeGame(finished ?? game) });
    }

    const newMoverTime = moverRemaining + game.increment;
    const whiteTime = state.turn === "w" ? newMoverTime : game.whiteTimeRemaining;
    const blackTime = state.turn === "b" ? newMoverTime : game.blackTimeRemaining;

    const priorMoves = await db.select().from(movesTable).where(eq(movesTable.gameId, gameId)).orderBy(asc(movesTable.moveNumber), asc(movesTable.id));
    const ply = priorMoves.length + 1;
    const pgn = buildPgn([...priorMoves.map((m) => m.san), san + (chosen!.checkmate ? "#" : chosen!.check ? "+" : "")]);

    const [inserted] = await db.insert(movesTable).values({
      gameId,
      moveNumber: ply,
      san,
      from: squareToAlgebraic(chosen!.from),
      to: squareToAlgebraic(chosen!.to),
      piece: chosen!.piece as string,
      captured: (chosen!.captured as string) ?? null,
      promotion: chosen!.promotion ?? null,
      check: Boolean(chosen!.check),
      checkmate: Boolean(chosen!.checkmate),
      castle: chosen!.castle ?? null,
      enPassant: Boolean(chosen!.enPassant),
    }).returning();

    const [updated] = await db.update(games).set({
      fen: stateToFEN(nextState),
      pgn,
      whiteTimeRemaining: whiteTime,
      blackTimeRemaining: blackTime,
      lastMoveAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(games.id, gameId)).returning();

    let finalGame = updated;

    if (nextState.gameOver) {
      const winner = nextState.winner === "draw" || nextState.winner === null ? "draw" : nextState.winner;
      const finished = await finalizeGame(gameId, winner, nextState.reason || "unknown", { white: whiteTime, black: blackTime });
      if (finished) finalGame = finished;
    } else if (repetitionCount([...priorMoves, inserted]) >= 3) {
      const finished = await finalizeGame(gameId, "draw", "threefold repetition", { white: whiteTime, black: blackTime });
      if (finished) finalGame = finished;
    }

    await notifyGameUpdate(gameId);

    return NextResponse.json({ move: inserted, game: serializeGame(finalGame) });
  } catch (error) {
    console.error("Bot Move error:", error);
    return NextResponse.json({ error: "Failed to process bot move" }, { status: 500 });
  }
}
