"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import ChessBoard from "@/components/ChessBoard";
import MoveHistory from "@/components/MoveHistory";
import {
  parseFEN,
  makeMove,
  generateSAN,
  stateToFEN,
  algebraicToSquare,
  GameState,
  Move,
  isInCheck,
  isCheckmate,
} from "@/lib/chess-engine";
import { StockfishAnalysis } from "@/lib/stockfish-analysis";

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export interface ApiMove {
  from: string;
  to: string;
  promotion?: "Q" | "R" | "B" | "N";
  san: string;
  piece: string;
  color: "w" | "b";
  check: boolean;
  checkmate: boolean;
}

export default function AnalysisClient() {
  const [boardFlipped, setBoardFlipped] = useState(false);
  
  // Local state
  const [moves, setMoves] = useState<ApiMove[]>([]);
  const [states, setStates] = useState<GameState[]>([parseFEN(INITIAL_FEN)]);
  const [viewPly, setViewPly] = useState<number | null>(null);

  // Analysis state
  const [analysis, setAnalysis] = useState<StockfishAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisDepth, setAnalysisDepth] = useState(20);

  const activePly = viewPly ?? moves.length - 1;
  const displayState = states[activePly + 1];
  const displayFen = stateToFEN(displayState);
  
  const lastMove = activePly >= 0 ? {
    from: algebraicToSquare(moves[activePly].from),
    to: algebraicToSquare(moves[activePly].to),
    piece: moves[activePly].piece as Move["piece"]
  } : undefined;

  // SSE Analysis
  useEffect(() => {
    let active = true;
    let evtSource: EventSource | null = null;
    
    setAnalysis(null);
    setAnalysisError(null);
    setAnalysisLoading(true);

    const startStream = () => {
      if (!active) return;
      const query = new URLSearchParams({
        fen: displayFen,
        depth: analysisDepth.toString()
      });
      evtSource = new EventSource(`/api/analysis/stream?${query.toString()}`);

      let isDone = false;
      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "start") {
            setAnalysisLoading(false);
          } else if (data.type === "progress") {
            setAnalysis(data);
          } else if (data.type === "done") {
            isDone = true;
            setAnalysis(data);
            evtSource?.close();
          }
        } catch (err) {
          console.error("Parse error", err);
        }
      };

      evtSource.onerror = () => {
        if (isDone) return;
        setAnalysisError("Connection to analysis engine lost.");
        evtSource?.close();
      };
    };

    // debouncing
    const timer = setTimeout(startStream, 600);

    return () => {
      active = false;
      clearTimeout(timer);
      if (evtSource) evtSource.close();
    };
  }, [displayFen, analysisDepth]);

  const evalHeight = useMemo(() => {
    if (!analysis || !analysis.scoreText) return "50%";
    if (analysis.scoreText.startsWith("-#")) return "0%";
    if (analysis.scoreText.startsWith("#")) return "100%";
    const score = Number(analysis.scoreText);
    if (!Number.isFinite(score)) return "50%";
    return `${Math.max(0, Math.min(100, 50 + score * 5))}%`;
  }, [analysis]);

  const bestMoveArrow = useMemo(() => {
    const bMove = analysis?.bestMove || (analysis?.pv && analysis.pv[0]);
    if (bMove && bMove.length >= 4) {
      return {
        from: bMove.substring(0, 2),
        to: bMove.substring(2, 4),
        color: "rgba(0, 128, 255, 0.7)", // blue arrow
      };
    }
    return null;
  }, [analysis]);

  const handleMove = (m: Move) => {
    // If we're looking at history, truncate the future moves
    const currentPly = activePly;
    const currentState = states[currentPly + 1];
    
    const san = generateSAN(currentState, m);
    const nextState = makeMove(currentState, m);
    
    const apiMove: ApiMove = {
      from: `${m.from.col}${m.from.row}`,
      to: `${m.to.col}${m.to.row}`,
      promotion: m.promotion,
      san,
      piece: (m.piece as string) || "",
      color: currentState.turn,
      check: isInCheck(nextState.board, nextState.turn),
      checkmate: isCheckmate(nextState)
    };

    setMoves(prev => [...prev.slice(0, currentPly + 1), apiMove]);
    setStates(prev => [...prev.slice(0, currentPly + 2), nextState]);
    setViewPly(null);
  };

  const handleReset = () => {
    setMoves([]);
    setStates([parseFEN(INITIAL_FEN)]);
    setViewPly(null);
  };

  return (
    <main className="flex-1 p-4">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <h2 className="text-xl font-bold">Analysis Board</h2>
          <div className="flex gap-2">
            <button onClick={handleReset} className="btn btn-secondary">
              Reset Board
            </button>
            <button onClick={() => setBoardFlipped(!boardFlipped)} className="btn btn-secondary">
              Flip Board
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 lg:items-start lg:justify-center">
          
          {/* Board Area */}
          <div className="w-full flex flex-col items-center" style={{ maxWidth: 'min(680px, calc(100vh - 180px))' }}>
            <div className="flex flex-row items-stretch gap-2 w-full">
              <div className="w-4 rounded bg-[#333] overflow-hidden flex flex-col-reverse shadow-inner shrink-0 relative">
                <div 
                  className="w-full bg-[#f0f0f0] transition-all duration-500 ease-out absolute bottom-0"
                  style={{ height: evalHeight }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <ChessBoard
                  gameState={displayState}
                  playerColor="w"
                  onMove={handleMove}
                  lastMove={lastMove}
                  boardFlipped={boardFlipped}
                  interactive={true}
                  allowBothColors={true}
                  bestMoveArrow={bestMoveArrow}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => setViewPly(0)}
                disabled={moves.length === 0}
                className="btn btn-secondary text-xs disabled:opacity-40 px-3"
              >
                First
              </button>
              <button
                onClick={() => setViewPly(p => {
                  const cur = p === null ? moves.length - 1 : p;
                  return Math.max(0, cur - 1);
                })}
                disabled={moves.length === 0}
                className="btn btn-secondary text-xs disabled:opacity-40 px-4"
              >
                Prev
              </button>
              <button
                onClick={() => setViewPly(p => (p === null || p + 1 >= moves.length - 1 ? null : p + 1))}
                disabled={viewPly === null}
                className="btn btn-secondary text-xs disabled:opacity-40 px-4"
              >
                Next
              </button>
              <button
                onClick={() => setViewPly(null)}
                disabled={viewPly === null}
                className="btn btn-secondary text-xs disabled:opacity-40 px-3"
              >
                Last
              </button>
            </div>
          </div>

          {/* Right Column: History & Stockfish */}
          <div className="w-full lg:w-[260px] xl:w-[320px] shrink-0 flex flex-col gap-4 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
            <MoveHistory
              moves={moves.map(m => ({ san: m.san, check: m.check, checkmate: m.checkmate }))}
              activeMoveIndex={activePly}
              onMoveClick={(i) => setViewPly(i === moves.length - 1 ? null : i)}
              className="flex-1 min-h-0"
            />

            <div className="card p-3 shrink-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  Stockfish
                </h4>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {analysisLoading ? "Analyzing" : analysis?.depth ? `Depth ${analysis.depth}` : "Idle"}
                  </span>
                  {analysisDepth < 99 && (
                    <button 
                      onClick={() => setAnalysisDepth(d => Math.min(99, d + 10))}
                      title="Increase depth by 10"
                      className="flex items-center justify-center w-4 h-4 rounded bg-white/10 text-white hover:bg-[var(--accent)] transition-colors text-[10px]"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>

              {analysisError ? (
                <p className="text-sm text-[var(--text-secondary)]">{analysisError}</p>
              ) : analysis ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-white/8 bg-black/20 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Eval</span>
                      <span className="font-semibold text-[var(--text-primary)]">{analysis.scoreText}</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">
                      Best line
                    </p>
                    <p className="text-sm text-[var(--text-primary)]">
                      {analysis.bestMoveSan ?? analysis.bestMove ?? "Calculating..."}
                    </p>
                    {((analysis.pvSan?.length > 0 ? analysis.pvSan : analysis.pv) || []).length > 0 && (
                      <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                        {(analysis.pvSan?.length > 0 ? analysis.pvSan : analysis.pv).slice(1).join(" ")}
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
