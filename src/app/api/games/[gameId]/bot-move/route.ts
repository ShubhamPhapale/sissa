import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { games, moves as movesTable } from "@/db/schema";
import { eq, asc, and } from "drizzle-orm";
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

    // Parse bot level
    const botName = isWhiteBot ? game.whitePlayerName : game.blackPlayerName;
    const match = botName?.match(/Level (\d+)/);
    const level = match ? Math.max(1, Math.min(12, parseInt(match[1]))) : 5;
    
    // Calibrate bots from absolute beginner (Level 1) to Super GM (Level 12)
    const botConfigs = [
      { depth: 1, skill: 0, time: 50 },     // Level 1: Absolute beginner
      { depth: 2, skill: 1, time: 100 },    // Level 2
      { depth: 3, skill: 3, time: 150 },    // Level 3
      { depth: 4, skill: 5, time: 200 },    // Level 4
      { depth: 5, skill: 7, time: 300 },    // Level 5: Intermediate
      { depth: 7, skill: 9, time: 400 },    // Level 6
      { depth: 9, skill: 11, time: 500 },   // Level 7
      { depth: 11, skill: 13, time: 700 },  // Level 8
      { depth: 13, skill: 15, time: 1000 }, // Level 9
      { depth: 15, skill: 17, time: 1300 }, // Level 10
      { depth: 17, skill: 19, time: 1600 }, // Level 11
      { depth: 20, skill: 20, time: 2000 }, // Level 12: Super GM
    ];
    
    const config = botConfigs[level - 1] || botConfigs[4];

    // Ask stockfish for best move
    const analysis = await analyzePosition(game.fen, config.depth, config.skill, undefined, undefined, undefined, config.time);
    
    let chosen;
    if (analysis && analysis.bestMove) {
      // Find the move in legal moves
      const legal = generateLegalMoves(state, state.turn);
      chosen = legal.find(m => {
        const fromAlg = squareToAlgebraic(m.from);
        const toAlg = squareToAlgebraic(m.to);
        const promoAlg = m.promotion ? m.promotion.toLowerCase() : "";
        return (fromAlg + toAlg + promoAlg) === analysis.bestMove;
      });
    }

    if (!chosen) {
      const legal = generateLegalMoves(state, state.turn);
      // Fallback to random move if stockfish returned nonsense (e.g. timeout)
      chosen = legal[Math.floor(Math.random() * legal.length)];
      if (!chosen) return NextResponse.json({ error: "No legal moves" }, { status: 400 });
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
    const fullSan = san + (chosen!.checkmate ? "#" : chosen!.check ? "+" : "");
    const pgn = buildPgn([...priorMoves.map((m) => m.san), fullSan]);

    const [updated] = await db.update(games).set({
      fen: stateToFEN(nextState),
      pgn,
      whiteTimeRemaining: whiteTime,
      blackTimeRemaining: blackTime,
      lastMoveAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(games.id, gameId), eq(games.fen, game.fen))).returning();

    if (!updated) {
      return NextResponse.json({ error: "State changed, please retry" }, { status: 409 });
    }

    const [inserted] = await db.insert(movesTable).values({
      gameId,
      moveNumber: ply,
      san: fullSan,
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
