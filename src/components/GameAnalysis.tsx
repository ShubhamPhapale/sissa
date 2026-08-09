"use client";

import React, { useState } from "react";
import { 
  type MoveClassification, 
  type GameAnalysisResult,
  CLASSIFICATION_COLORS,
  CLASSIFICATION_ICONS
} from "@/lib/game-analysis-types";

interface GameAnalysisProps {
  gameId: string;
  moves: Array<{ san: string; check?: boolean; checkmate?: boolean }>;
  onMoveClick?: (ply: number) => void;
  onAnalysisComplete?: (analysis: GameAnalysisResult) => void;
  activePly?: number;
  initialAnalysis?: GameAnalysisResult | null;
}

function getAccuracyColor(acc: number) {
  if (acc >= 80) return "#43a047";
  if (acc >= 60) return "#ffd54f";
  if (acc >= 40) return "#ff9800";
  return "#f44336";
}

export default function GameAnalysis({
  gameId,
  moves,
  onMoveClick,
  onAnalysisComplete,
  activePly,
  initialAnalysis,
}: GameAnalysisProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<GameAnalysisResult | null>(initialAnalysis || null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMove, setSelectedMove] = useState<MoveClassification | null>(null);

  React.useEffect(() => {
    if (initialAnalysis) setAnalysis(initialAnalysis);
  }, [initialAnalysis]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const response = await fetch("/api/analysis/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to analyze game");
      }
      const data = await response.json();
      setAnalysis(data.analysis);
      onAnalysisComplete?.(data.analysis);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Accuracy ring SVG
  const renderAccuracyRing = (accuracy: number, label: string, emoji: string) => {
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (accuracy / 100) * circumference;
    const color = getAccuracyColor(accuracy);

    return (
      <div className="flex flex-col items-center gap-2">
        <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
          <svg width="96" height="96" className="transform -rotate-90">
            <circle
              cx="48" cy="48" r={radius}
              stroke="var(--bg-input)" strokeWidth="7" fill="none"
            />
            <circle
              cx="48" cy="48" r={radius}
              stroke={color} strokeWidth="7" fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
            />
          </svg>
          <div className="absolute text-lg font-bold text-[var(--text-primary)]">
            {accuracy.toFixed(1)}%
          </div>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {emoji} {label}
        </span>
      </div>
    );
  };

  // Classification badge row
  const renderClassificationRow = (type: string, count: number) => {
    if (count === 0) return null;
    return (
      <div key={type} className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: CLASSIFICATION_COLORS[type] }}
          />
          <span className="text-xs capitalize text-[var(--text-secondary)]">
            {CLASSIFICATION_ICONS[type]} {type}
          </span>
        </div>
        <span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">
          {count}
        </span>
      </div>
    );
  };

  // Classification summary for one side
  const renderSideSummary = (title: string, counts: Record<string, number>) => {
    const entries = Object.entries(counts).filter(([, count]) => count > 0);
    if (entries.length === 0) return null;

    return (
      <div className="flex-1 rounded-xl p-3 bg-[var(--bg-input)]">
        <h4 className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2 text-center">
          {title}
        </h4>
        <div className="space-y-0.5">
          {entries.map(([type, count]) => renderClassificationRow(type, count))}
        </div>
      </div>
    );
  };

  // Eval graph
  const renderEvalGraph = () => {
    if (!analysis || analysis.moves.length === 0) return null;

    const width = 1000;
    const height = 120;
    const midY = height / 2;
    const clampEval = (cp: number) => Math.max(-500, Math.min(500, cp));
    const evalToY = (cp: number) => midY - (clampEval(cp) / 500) * midY;

    const points = analysis.moves.map((m, i) => {
      const x = (i / Math.max(1, analysis.moves.length - 1)) * width;
      const y = evalToY(m.evalAfter);
      return { x, y, classification: m.classification, ply: i };
    });

    // Build the filled area path — fill above/below the midline.
    // White area: from midline up to the eval line (when eval > 0).
    // Black area: from midline down to the eval line (when eval < 0).
    const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    // White fill (above midline)
    const whiteFillD =
      `M 0 ${midY} ` +
      points.map((p) => `L ${p.x} ${Math.min(p.y, midY)}`).join(" ") +
      ` L ${width} ${midY} Z`;

    // Black fill (below midline)
    const blackFillD =
      `M 0 ${midY} ` +
      points.map((p) => `L ${p.x} ${Math.max(p.y, midY)}`).join(" ") +
      ` L ${width} ${midY} Z`;

    return (
      <div className="w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-input)]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height: 120 }}>
          {/* Background halves */}
          <rect x="0" y="0" width={width} height={midY} fill="rgba(241,245,249,0.05)" />
          <rect x="0" y={midY} width={width} height={midY} fill="rgba(0,0,0,0.15)" />

          {/* Filled areas */}
          <path d={whiteFillD} fill="rgba(241,245,249,0.25)" />
          <path d={blackFillD} fill="rgba(30,30,30,0.5)" />

          {/* Center line */}
          <line
            x1="0" y1={midY} x2={width} y2={midY}
            stroke="var(--border)" strokeWidth="1" strokeDasharray="6 3"
          />

          {/* Eval line */}
          <path d={lineD} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />

          {/* Blunder / mistake markers */}
          {points
            .filter((p) => p.classification === "blunder" || p.classification === "mistake")
            .map((p) => (
              <circle
                key={p.ply}
                cx={p.x}
                cy={p.y}
                r="5"
                fill={CLASSIFICATION_COLORS[p.classification]}
                stroke="var(--bg-card)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                className="cursor-pointer"
                onClick={() => onMoveClick?.(p.ply)}
              />
            ))}

          {/* Active ply indicator */}
          {activePly !== undefined && activePly >= 0 && activePly < points.length && (
            <line
              x1={points[activePly].x}
              y1="0"
              x2={points[activePly].x}
              y2={height}
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeOpacity="0.6"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>
    );
  };

  // Annotated move list
  const renderMoveList = () => {
    const pairs: Array<{
      number: number;
      white?: { move: (typeof moves)[0]; analysis?: MoveClassification; ply: number };
      black?: { move: (typeof moves)[0]; analysis?: MoveClassification; ply: number };
    }> = [];

    for (let i = 0; i < moves.length; i += 2) {
      pairs.push({
        number: i / 2 + 1,
        white: moves[i]
          ? { move: moves[i], analysis: analysis?.moves[i], ply: i }
          : undefined,
        black: moves[i + 1]
          ? { move: moves[i + 1], analysis: analysis?.moves[i + 1], ply: i + 1 }
          : undefined,
      });
    }

    const renderMoveCell = (
      entry?: { move: (typeof moves)[0]; analysis?: MoveClassification; ply: number }
    ) => {
      if (!entry) return <div className="flex-1" />;
      const { move, analysis: mAnalysis, ply } = entry;
      const isActive = activePly === ply;
      const isSelected = selectedMove?.ply === ply;

      return (
        <button
          type="button"
          className={`flex-1 flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-all ${
            isActive
              ? "bg-[var(--accent)]/20 text-[var(--text-primary)]"
              : "hover:bg-white/5 text-[var(--text-secondary)]"
          }`}
          onClick={() => {
            onMoveClick?.(ply);
            if (mAnalysis) setSelectedMove(isSelected ? null : mAnalysis);
          }}
          title={
            mAnalysis
              ? `${mAnalysis.classification} · CP loss: ${mAnalysis.cpLoss}${
                  mAnalysis.bestMove ? ` · Best: ${mAnalysis.bestMove}` : ""
                }`
              : undefined
          }
        >
          <span className="font-mono text-sm">
            {move.san}
            {move.checkmate ? "#" : move.check ? "+" : ""}
          </span>
          {mAnalysis && (
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 ml-1.5"
              style={{ backgroundColor: CLASSIFICATION_COLORS[mAnalysis.classification] }}
            />
          )}
        </button>
      );
    };

    return (
      <div className="max-h-[280px] overflow-y-auto space-y-px">
        {pairs.map((pair) => (
          <div key={pair.number} className="flex items-center gap-0.5">
            <span className="text-[var(--text-muted)] text-xs w-7 text-right mr-1 shrink-0 font-mono">
              {pair.number}.
            </span>
            {renderMoveCell(pair.white)}
            {renderMoveCell(pair.black)}
          </div>
        ))}
      </div>
    );
  };

  // Selected move detail tooltip
  const renderMoveDetail = () => {
    if (!selectedMove) return null;
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-3 text-sm space-y-1.5 slide-in">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[var(--text-primary)]">
            {CLASSIFICATION_ICONS[selectedMove.classification]}{" "}
            <span className="capitalize">{selectedMove.classification}</span>
          </span>
          <button
            onClick={() => setSelectedMove(null)}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-xs"
          >
            ✕
          </button>
        </div>
        <div className="flex justify-between text-xs text-[var(--text-secondary)]">
          <span>Played: <span className="font-mono text-[var(--text-primary)]">{selectedMove.san}</span></span>
          <span>CP loss: <span className="font-mono text-[var(--text-primary)]">{selectedMove.cpLoss}</span></span>
        </div>
        {selectedMove.bestMove && selectedMove.classification !== "best" && (
          <div className="text-xs text-[var(--text-secondary)]">
            Best: <span className="font-mono text-emerald-400">{selectedMove.bestMove}</span>
          </div>
        )}
        <div className="flex justify-between text-xs text-[var(--text-muted)]">
          <span>Eval before: {(selectedMove.evalBefore / 100).toFixed(2)}</span>
          <span>Eval after: {(selectedMove.evalAfter / 100).toFixed(2)}</span>
        </div>
      </div>
    );
  };

  // -- Render states --

  if (!analysis && !isAnalyzing) {
    return (
      <div className="card p-5">
        <div className="text-center space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
            Post-Game Analysis
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            Analyze every move with Stockfish to find mistakes and brilliancies.
          </p>
          <button
            onClick={handleAnalyze}
            disabled={moves.length === 0}
            className="btn btn-primary px-5 py-2.5 text-sm disabled:opacity-40"
          >
            🔬 Analyze Game
          </button>
          {error && (
            <p className="text-xs text-red-400 mt-2">⚠ {error}</p>
          )}
        </div>
      </div>
    );
  }

  if (isAnalyzing) {
    return (
      <div className="card p-6 flex flex-col items-center justify-center">
        <div className="relative w-16 h-16 mb-4">
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{ backgroundColor: "var(--accent)" }}
          />
          <div
            className="relative w-full h-full rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--accent)" }}
          >
            <svg
              className="w-7 h-7 text-white animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        </div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] animate-pulse">
          Analyzing all moves…
        </h3>
        <p className="text-xs text-[var(--text-muted)] mt-1 text-center max-w-[200px]">
          Stockfish is evaluating {moves.length} positions. This may take a minute.
        </p>
      </div>
    );
  }

  // -- Analysis results --
  return (
    <div className="card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">
          Game Review
        </h3>
        <span className="text-[11px] text-[var(--text-muted)]">Depth 14</span>
      </div>

      {/* Accuracy rings */}
      <div className="flex justify-center gap-8">
        {renderAccuracyRing(analysis!.whiteAccuracy, "White", "♔")}
        {renderAccuracyRing(analysis!.blackAccuracy, "Black", "♚")}
      </div>

      {/* Classification summaries */}
      <div className="flex gap-3">
        {renderSideSummary("White", analysis!.summary.white as unknown as Record<string, number>)}
        {renderSideSummary("Black", analysis!.summary.black as unknown as Record<string, number>)}
      </div>

      {/* Eval graph */}
      {renderEvalGraph()}

      {/* Move detail (when a move is selected) */}
      {renderMoveDetail()}

      {/* Annotated move list */}
      <div>
        <h4 className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2">
          Annotated Moves
        </h4>
        {renderMoveList()}
      </div>

    </div>
  );
}
