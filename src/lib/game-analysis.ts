import { analyzePosition } from "@/lib/stockfish-analysis";
import {
  createInitialState,
  generateLegalMoves,
  getAllLegalMoves,
  makeMove,
  stateToFEN,
  algebraicToSquare,
  type GameState,
} from "@/lib/chess-engine";
import {
  type MoveClassification,
  type GameAnalysisResult,
  type ClassificationCounts,
} from "./game-analysis-types";

/**
 * Parse the score text returned by `analyzeFen` into centipawns from white's
 * perspective. The `analyzeFen` function already returns the score from white's
 * perspective (positive = white advantage).
 */
function parseScoreText(scoreText: string): { cp: number; isMate: boolean } {
  if (scoreText.startsWith("#")) {
    return { cp: 10000, isMate: true };
  }
  if (scoreText.startsWith("-#")) {
    return { cp: -10000, isMate: true };
  }
  const val = parseFloat(scoreText);
  if (!Number.isFinite(val)) return { cp: 0, isMate: false };
  // scoreText is in pawns (e.g. "+0.34"), convert to centipawns
  return { cp: Math.round(val * 100), isMate: false };
}

/** 
 * Calculate Win Probability from centipawns (from White's perspective).
 * Returns a value between 0 and 1. Lichess formula.
 */
function getWinProb(cp: number): number {
  return 0.5 + 0.5 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** 
 * Calculate move accuracy (0-100) based on WP loss. Lichess formula.
 */
function getMoveAccuracy(evalBefore: number, evalAfter: number, isWhite: boolean): number {
  const wpBefore = getWinProb(isWhite ? evalBefore : -evalBefore);
  const wpAfter = getWinProb(isWhite ? evalAfter : -evalAfter);
  
  const wpLoss = Math.max(0, wpBefore - wpAfter);
  
  if (wpLoss === 0) return 100;
  const lossPercent = wpLoss * 100;
  const accuracy = 103.166811 * Math.exp(-0.04354 * lossPercent) - 3.166925;
  return Math.max(0, Math.min(100, accuracy));
}

function emptyCounts(): ClassificationCounts {
  return {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  };
}

function getMaterialBalance(board: (string | null)[][]): { w: number, b: number } {
  let w = 0, b = 0;
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) {
        const v = values[p.toLowerCase()] || 0;
        if (p === p.toUpperCase()) w += v;
        else b += v;
      }
    }
  }
  return { w, b };
}

/**
 * Replays one move using the same pattern as `replayTo` / `repetitionCount`
 * in the existing codebase — find the legal move and apply it.
 */
function applyMoveFromRecord(
  state: GameState,
  m: { from: string; to: string; promotion: string | null }
): GameState | null {
  const from = algebraicToSquare(m.from);
  const to = algebraicToSquare(m.to);
  const legal = generateLegalMoves(state, state.turn);
  const found = legal.find(
    (c) =>
      c.from.row === from.row &&
      c.from.col === from.col &&
      c.to.row === to.row &&
      c.to.col === to.col &&
      (m.promotion ? c.promotion === m.promotion : !c.promotion)
  );
  if (!found) return null;
  return makeMove(state, found);
}

export async function analyzeGame(
  moveList: Array<{
    san: string;
    from: string;
    to: string;
    promotion: string | null;
  }>,
  onProgress?: (completed: number, total: number) => void
): Promise<GameAnalysisResult> {
  const classifications: MoveClassification[] = [];
  const summary = { white: emptyCounts(), black: emptyCounts() };

  let state = createInitialState();
  let currentFen = stateToFEN(state);

  // Analyze the starting position to get the initial eval.
  let previousEval = 0;
  let previousIsMate = false;
  let previousBestMove: string | null = null;
  let previousBestMoveSan: string | null = null;
  
  try {
    // Request 2 lines to find the gap between the best move and the second best move
    const initial = await analyzePosition(currentFen, 14, 20, undefined, undefined, undefined, 0, 2);
    if (initial) {
      const parsed = parseScoreText(initial.scoreText);
      previousEval = parsed.cp;
      previousIsMate = parsed.isMate;
      previousBestMove = initial.bestMove ?? null;
      previousBestMoveSan = initial.bestMoveSan ?? null;
    }
  } catch {
    // Engine failed on starting position — use 0.
  }

  let whiteAccTotal = 0;
  let blackAccTotal = 0;

  try {
    for (let i = 0; i < moveList.length; i++) {
      const move = moveList[i];
      const isWhite = i % 2 === 0;
      const fenBeforeMove = currentFen;
      const evalBefore = previousEval;
      const bestMoveForThisTurn = previousBestMove;
      const bestMoveSanForThisTurn = previousBestMoveSan;

      const matBefore = getMaterialBalance(state.board);
      const ourMatBefore = isWhite ? matBefore.w - matBefore.b : matBefore.b - matBefore.w;

      // Check if any of our pieces were ALREADY hanging before we made our move.
      // We do this by temporarily giving the opponent the turn and seeing if they can win material.
      const stateForOpponentBefore = { ...state, turn: isWhite ? "b" : "w" as "w" | "b" };
      const oppLegalsBefore = getAllLegalMoves(stateForOpponentBefore);
      let materialLossBefore = 0;
      for (const oppMove of oppLegalsBefore) {
        // Optimization: only consider captures
        if (stateForOpponentBefore.board[oppMove.to.row][oppMove.to.col] !== null || oppMove.enPassant) {
          const testState = makeMove(stateForOpponentBefore, oppMove);
          const testMat = getMaterialBalance(testState.board);
          const ourTestMat = isWhite ? testMat.w - testMat.b : testMat.b - testMat.w;
          const loss = ourMatBefore - ourTestMat;
          if (loss > materialLossBefore) {
            materialLossBefore = loss;
          }
        }
      }

      // Apply the move to get the next position.
      const stateBeforeOurMove = state;
      const nextState = applyMoveFromRecord(state, move);
      if (!nextState) {
        // Illegal move — skip remainder.
        break;
      }
      
      state = nextState;
      currentFen = stateToFEN(state);

      // Analyze the position AFTER the move.
      let evalAfter = previousEval;
      let afterIsMate = previousIsMate;
      let nextBestMove: string | null = null;
      let nextBestMoveSan: string | null = null;

      let secondBestGap = 0;
      let isSacrifice = false;
      try {
        const result = await analyzePosition(currentFen, 14, 20, undefined, undefined, undefined, 0, 2);
        if (result) {
          const parsed = parseScoreText(result.scoreText);
          evalAfter = parsed.cp;
          afterIsMate = parsed.isMate;
          nextBestMove = result.bestMove ?? null;
          nextBestMoveSan = result.bestMoveSan ?? null;
          
          if (result.lines && result.lines.length > 1) {
            secondBestGap = Math.abs(result.lines[0].score - result.lines[1].score);
          }
          
          if (result.lines && result.lines.length > 0) {
            // Find max material opponent can win IMMEDIATELY after our move
            const oppLegalsAfter = getAllLegalMoves(state);
            let materialLossAfter = 0;
            let capturedPieceWeJustMoved = false;

            // Find the move object we just played
            const legalsBeforeOurMove = getAllLegalMoves(stateBeforeOurMove);
            const moveWeJustPlayed = legalsBeforeOurMove.find(m => m.san === move.san);

            for (const oppMove of oppLegalsAfter) {
              if (state.board[oppMove.to.row][oppMove.to.col] !== null || oppMove.enPassant) {
                const testState = makeMove(state, oppMove);
                const testMat = getMaterialBalance(testState.board);
                const ourTestMat = isWhite ? testMat.w - testMat.b : testMat.b - testMat.w;
                const loss = ourMatBefore - ourTestMat;
                
                if (loss > materialLossAfter) {
                  materialLossAfter = loss;
                }

                // If this capture targets the square we just moved to, and it loses material!
                if (loss >= 2 && moveWeJustPlayed && oppMove.to.row === moveWeJustPlayed.to.row && oppMove.to.col === moveWeJustPlayed.to.col) {
                  capturedPieceWeJustMoved = true;
                }
              }
            }
            
            // For a move to be a sacrifice:
            // 1. The opponent must be able to capture material immediately (loss >= 2)
            // 2. AND either they capture the exact piece we just moved (direct sacrifice)
            //    OR the material they can capture NOW is strictly greater than what they could capture BEFORE our move (leaving a new piece hanging)
            if (materialLossAfter >= 2 && (capturedPieceWeJustMoved || materialLossAfter > materialLossBefore)) {
              isSacrifice = true;
            }
          }
        }
      } catch {
        // Fallback if analysis fails for this move
      }

      // Compute centipawn loss from the moving side's perspective.
      let cpLoss: number;
      if (isWhite) {
        cpLoss = evalBefore - evalAfter;
      } else {
        cpLoss = evalAfter - evalBefore;
      }
      cpLoss = Math.max(0, cpLoss);

      // Classify the move.
      let classification: MoveClassification["classification"];
      
      // If we found the absolute best move, or a move that is practically best
      const foundBestMove = cpLoss <= 10;
      
      if (i < 6) {
        classification = "book";
      } else if (cpLoss >= 200) {
        classification = "blunder";
      } else if (cpLoss >= 100) {
        classification = "mistake";
      } else if (cpLoss >= 50) {
        classification = "inaccuracy";
      } else if (foundBestMove && isSacrifice) {
        // The move played was best and it involved an intentional sacrifice!
        classification = "brilliant";
      } else if (foundBestMove && secondBestGap >= 150) {
        // The move played was significantly better than alternatives (only working move)
        classification = "great";
      } else if (cpLoss >= 20) {
        classification = "good";
      } else if (cpLoss >= 10) {
        classification = "excellent";
      } else {
        classification = "best";
      }

      const acc = getMoveAccuracy(evalBefore, evalAfter, isWhite);

      if (isWhite) whiteAccTotal += acc;
      else blackAccTotal += acc;

      if (isWhite) summary.white[classification]++;
      else summary.black[classification]++;

      classifications.push({
        ply: i,
        san: move.san || "",
        fen: fenBeforeMove,
        evalBefore,
        evalAfter,
        bestMove: bestMoveSanForThisTurn || bestMoveForThisTurn,
        bestEval: evalAfter,
        cpLoss: Math.abs(evalBefore - evalAfter),
        classification,
        isMate: afterIsMate || previousIsMate,
      });

      // Update for next iteration
      previousEval = evalAfter;
      previousIsMate = afterIsMate;
      previousBestMove = nextBestMove;
      previousBestMoveSan = nextBestMoveSan;

      if (onProgress) {
        onProgress(i + 1, moveList.length);
      }
    }
  } finally {
    // Backend engine persists as a singleton via stockfish-worker, no need to terminate here.
  }

  const whiteCount = Math.ceil(moveList.length / 2);
  const blackCount = Math.floor(moveList.length / 2);

  return {
    moves: classifications,
    whiteAccuracy: whiteCount > 0 ? (whiteAccTotal / whiteCount) : 100,
    blackAccuracy: blackCount > 0 ? (blackAccTotal / blackCount) : 100,
    summary,
  };
}
