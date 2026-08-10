"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import ChessBoard from "@/components/ChessBoard";
import MoveHistory from "@/components/MoveHistory";
import { 
  type Move, 
  type GameState, 
  parseFEN, 
  makeMove, 
  stateToFEN,
  algebraicToSquare,
  squareToAlgebraic,
  isInCheck,
  isCheckmate,
  generateSAN,
  parsePGN,
  buildPgn
} from "@/lib/chess-engine";
import GameAnalysis from "@/components/GameAnalysis";
import { GameAnalysisResult } from "@/lib/game-analysis-types";
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
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const [analysis, setAnalysis] = useState<StockfishAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisDepth, setAnalysisDepth] = useState(20);
  const [multiPV, setMultiPV] = useState(1);
  const [activeTab, setActiveTab] = useState<"engine" | "review">("engine");
  const [pgnInput, setPgnInput] = useState("");
  const [fenInput, setFenInput] = useState(INITIAL_FEN);
  const [fullGameAnalysis, setFullGameAnalysis] = useState<GameAnalysisResult | null>(null);

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
    setFenInput(displayFen);
  }, [displayFen]);

  const handleFenSubmit = () => {
    try {
      const state = parseFEN(fenInput);
      setStates([state]);
      setMoves([]);
      setViewPly(null);
      setFullGameAnalysis(null);
    } catch {
      setFenInput(displayFen); // reset on error
    }
  };

  const handlePgnImport = () => {
    try {
      const { moves: parsedMoves, states: parsedStates } = parsePGN(pgnInput);
      
      const apiMoves: ApiMove[] = parsedMoves.map((m, i) => {
        const s = parsedStates[i];
        const next = parsedStates[i+1];
        return {
          from: squareToAlgebraic(m.from),
          to: squareToAlgebraic(m.to),
          promotion: m.promotion,
          san: generateSAN(s, m),
          piece: m.piece as string,
          color: s.turn,
          check: isInCheck(next.board, next.turn),
          checkmate: isCheckmate(next)
        };
      });

      setStates(parsedStates);
      setMoves(apiMoves);
      setViewPly(null);
      setFullGameAnalysis(null);
      setActiveTab("review"); // Auto-switch to review
    } catch (e) {
      alert("Invalid PGN or move!");
    }
  };

  useEffect(() => {
    // Automatically update the PGN textarea to match the current game when moves change
    const currentPgn = buildPgn(moves.map(m => m.san));
    setPgnInput(currentPgn);
  }, [moves]);

  useEffect(() => {
    let active = true;
    let evtSource: EventSource | null = null;
    
    setAnalysisError(null);
    
    if (!analysisEnabled) {
      setAnalysis(null);
      setAnalysisLoading(false);
      return;
    }
    
    setAnalysisLoading(true);

    const startStream = () => {
      if (!active) return;
      const query = new URLSearchParams({
        fen: displayFen,
        depth: analysisDepth.toString(),
        multipv: multiPV.toString()
      });
      evtSource = new EventSource(`/api/analysis/stream?${query.toString()}`);

      let isDone = false;
      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "start") {
            setAnalysisLoading(false);
          } else if (data.type === "progress" || data.type === "done") {
            if (data.type === "done") {
              isDone = true;
              evtSource?.close();
            }
            setAnalysis((prev) => {
              if (prev && data.depth < prev.depth && prev.scoreText) {
                // If the new analysis is shallower than what we already have, ignore it visually
                // to prevent the "calculating from start" visual glitch when increasing depth
                return prev;
              }
              return data;
            });
          }
        } catch (err) {
          console.error("Parse error", err);
        }
      };

      evtSource.onerror = () => {
        if (isDone) return;
        setAnalysisLoading(false);
        evtSource?.close();
      };
    };

    // debouncing
    const timer = setTimeout(startStream, 150);

    return () => {
      active = false;
      clearTimeout(timer);
      if (evtSource) evtSource.close();
    };
  }, [displayFen, analysisDepth, multiPV, analysisEnabled]);

  const evalHeight = useMemo(() => {
    if (!analysis || !analysis.scoreText) return "50%";
    if (analysis.scoreText.startsWith("-#")) return "0%";
    if (analysis.scoreText.startsWith("#")) return "100%";
    const score = Number(analysis.scoreText);
    if (!Number.isFinite(score)) return "50%";
    return `${Math.max(0, Math.min(100, 50 + score * 5))}%`;
  }, [analysis]);

  const bestMoveArrows = useMemo(() => {
    if (!analysis) return null;
    
    if (!analysis.lines || analysis.lines.length === 0) {
      const bMove = analysis.bestMove || (analysis.pv && analysis.pv[0]);
      if (bMove && bMove.length >= 4 && bMove !== "(none)") {
        return [{
          from: bMove.substring(0, 2),
          to: bMove.substring(2, 4),
          color: "rgba(0, 128, 255)", 
          width: 2.2,
          opacity: 1,
        }];
      }
      return null;
    }

    const bestScore = analysis.lines[0].score;
    return analysis.lines.map((line) => {
      const bMove = line.pv[0];
      if (!bMove || bMove.length < 4 || bMove === "(none)") return null;
      
      const scoreDiff = Math.max(0, Math.abs(bestScore - line.score) / 100); 
      const opacity = Math.max(0.3, 1 - scoreDiff * 0.4);
      const width = Math.max(0.8, 2.2 - scoreDiff * 0.6);

      return {
        from: bMove.substring(0, 2),
        to: bMove.substring(2, 4),
        color: "rgba(0, 128, 255)", 
        width,
        opacity,
      };
    }).filter(Boolean) as any[];
  }, [analysis]);

  const handleMove = (m: Move) => {
    // If we're looking at history, truncate the future moves
    const currentPly = activePly;
    const currentState = states[currentPly + 1];
    
    const san = generateSAN(currentState, m);
    const nextState = makeMove(currentState, m);
    
    const apiMove: ApiMove = {
      from: squareToAlgebraic(m.from),
      to: squareToAlgebraic(m.to),
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
    setFullGameAnalysis(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setViewPly((p) => {
          const cur = p === null ? moves.length - 1 : p;
          return Math.max(-1, cur - 1);
        });
      } else if (e.key === "ArrowRight") {
        setViewPly((p) => {
          if (p === null) return null;
          return p + 1 >= moves.length - 1 ? null : p + 1;
        });
      } else if (e.key === "f") {
        setBoardFlipped((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moves.length]);

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
              <div 
                className="w-4 rounded bg-[#333] overflow-hidden flex flex-col-reverse shadow-inner shrink-0 relative transition-transform duration-500"
                style={{ transform: boardFlipped ? "rotate(180deg)" : "none" }}
              >
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
                  bestMoveArrows={bestMoveArrows}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between w-full gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={fenInput}
                  onChange={(e) => setFenInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFenSubmit()}
                  className="bg-[var(--bg-input)] rounded px-3 py-2 text-xs font-mono text-[var(--text-primary)] w-full sm:w-64 border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
                  placeholder="Paste FEN here..."
                />
                <button
                  onClick={handleFenSubmit}
                  className="btn btn-secondary text-xs px-3 py-2"
                >
                  Load
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(displayFen)}
                  className="btn btn-secondary text-xs px-3 py-2"
                  title="Copy FEN"
                >
                  Copy
                </button>
              </div>

              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setViewPly(-1)}
                  disabled={moves.length === 0}
                  className="btn btn-secondary text-sm font-bold disabled:opacity-40 px-3 py-2"
                  title="First"
                >
                  &lt;&lt;
                </button>
                <button
                  onClick={() => setViewPly(p => {
                    const cur = p === null ? moves.length - 1 : p;
                    return Math.max(-1, cur - 1);
                  })}
                  disabled={moves.length === 0}
                  className="btn btn-secondary text-sm font-bold disabled:opacity-40 px-4 py-2"
                  title="Prev"
                >
                  &lt;
                </button>
                <button
                  onClick={() => setViewPly(p => (p === null || p + 1 >= moves.length - 1 ? null : p + 1))}
                  disabled={viewPly === null}
                  className="btn btn-secondary text-sm font-bold disabled:opacity-40 px-4 py-2"
                  title="Next"
                >
                  &gt;
                </button>
                <button
                  onClick={() => setViewPly(null)}
                  disabled={viewPly === null}
                  className="btn btn-secondary text-sm font-bold disabled:opacity-40 px-3 py-2"
                  title="Last"
                >
                  &gt;&gt;
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: History & Stockfish */}
          <div className="w-full lg:w-[320px] flex flex-col gap-4 max-h-[85vh]">
            
            {/* PGN Import */}
            <div className="card p-3 flex flex-col gap-2">
              <textarea
                value={pgnInput}
                onChange={(e) => setPgnInput(e.target.value)}
                placeholder="Paste PGN here to analyze a game..."
                className="w-full h-20 bg-[var(--bg-input)] rounded px-3 py-2 text-xs font-mono text-[var(--text-primary)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)] resize-none"
              />
              <button
                onClick={handlePgnImport}
                disabled={!pgnInput.trim()}
                className="btn btn-primary w-full py-1.5 text-xs disabled:opacity-50"
              >
                Import Game
              </button>
            </div>

            <div className="flex border-b border-[var(--border)]">
              <button
                onClick={() => setActiveTab("engine")}
                className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "engine"
                    ? "border-[var(--accent)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Engine
              </button>
              <button
                onClick={() => setActiveTab("review")}
                className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "review"
                    ? "border-[var(--accent)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Game Review
              </button>
            </div>

            {activeTab === "engine" ? (
              <>
                <div className="card p-3 shrink-0">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-3">
                      <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                        Stockfish
                      </h4>
                      <button
                        onClick={() => setAnalysisEnabled(!analysisEnabled)}
                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${analysisEnabled ? 'bg-[var(--accent)]' : 'bg-[#333]'}`}
                      >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${analysisEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {!analysisEnabled ? "Off" : analysisLoading ? "Analyzing" : analysis?.depth ? `Depth ${analysis.depth}` : "Idle"}
                        </span>
                        {analysisEnabled && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              max="99"
                              value={analysisDepth}
                              onChange={(e) => setAnalysisDepth(Math.min(99, Math.max(1, parseInt(e.target.value) || 20)))}
                              title="Engine Depth"
                              className="w-10 bg-[#222] text-white text-xs text-center border border-white/10 rounded px-1 py-0.5 focus:outline-none focus:border-[var(--accent)]"
                            />
                            <select
                              value={multiPV}
                              onChange={(e) => setMultiPV(parseInt(e.target.value))}
                              title="Number of lines"
                              className="bg-[#222] text-white text-xs border border-white/10 rounded px-1 py-0.5 focus:outline-none focus:border-[var(--accent)]"
                            >
                              {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} {n === 1 ? 'Line' : 'Lines'}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
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

                      <div className="space-y-3 mt-2">
                        {(!analysis.lines || analysis.lines.length === 0) ? (
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">
                              Best line
                            </p>
                            <p className="text-sm text-[var(--text-primary)] font-medium">
                              {analysis.bestMoveSan ?? analysis.bestMove ?? "Calculating..."}
                            </p>
                            {((analysis.pvSan?.length > 0 ? analysis.pvSan : analysis.pv) || []).length > 0 && (
                              <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                                {(analysis.pvSan?.length > 0 ? analysis.pvSan : analysis.pv).slice(1).join(" ")}
                              </p>
                            )}
                          </div>
                        ) : (
                          analysis.lines.map((line, idx) => (
                            <div key={idx} className="bg-black/10 rounded p-2 border border-white/5">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-[11px] font-medium text-[var(--text-primary)]">
                                  Line {line.multipv}
                                </p>
                                <span className="text-xs font-semibold text-[var(--text-primary)]">
                                  {line.scoreText}
                                </span>
                              </div>
                              <p className="text-xs text-[var(--text-primary)] font-medium">
                                {(line.pvSan?.length > 0 ? line.pvSan : line.pv)[0] || ""}
                              </p>
                              <p className="text-xs text-[var(--text-secondary)] line-clamp-1 mt-0.5" title={(line.pvSan?.length > 0 ? line.pvSan : line.pv).slice(1).join(" ")}>
                                {(line.pvSan?.length > 0 ? line.pvSan : line.pv).slice(1).join(" ")}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <GameAnalysis
                  gameId="" // empty for ephemeral games
                  moves={moves}
                  activePly={activePly}
                  onMoveClick={(i) => setViewPly(i === moves.length - 1 ? null : i)}
                  onAnalysisComplete={setFullGameAnalysis}
                  initialAnalysis={fullGameAnalysis}
                />
              </div>
            )}

            {activeTab === "engine" && (
              <MoveHistory
                moves={moves.map((m, i) => ({ 
                  san: m.san, 
                  check: m.check, 
                  checkmate: m.checkmate,
                  classification: fullGameAnalysis?.moves[i]?.classification 
                }))}
                activeMoveIndex={activePly}
                onMoveClick={(i) => setViewPly(i === moves.length - 1 ? null : i)}
                className="flex-1 min-h-0"
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
