"use client";

import { formatTime } from "@/lib/utils";

interface GameTimerProps {
  /** Authoritative seconds remaining, supplied by the parent (server-derived). */
  seconds: number;
  totalSeconds: number;
  isActive: boolean;
  playerColor: "w" | "b";
  playerName?: string;
  rating?: number;
  isYou?: boolean;
  captured?: string[];
  materialDiff?: number;
}

const pieceToUnicode: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

/**
 * Presentational clock. It intentionally owns no timer of its own — the game
 * page holds a single ticking source that is re-synced from the server, so the
 * two clocks can never drift apart.
 */
export default function GameTimer({
  seconds,
  totalSeconds,
  isActive,
  playerColor,
  playerName,
  rating,
  isYou,
  captured = [],
  materialDiff = 0,
}: GameTimerProps) {
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(100, (seconds / totalSeconds) * 100)) : 0;
  const isLow = seconds <= 30;
  const isCritical = seconds <= 10;

  return (
    <div
      className={`card p-3 transition-all ${
        isActive ? "ring-2 ring-[var(--accent)]" : "opacity-90"
      }`}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">{playerColor === "w" ? "♔" : "♚"}</span>
          <span className="font-medium text-sm truncate">
            {playerName || (playerColor === "w" ? "White" : "Black")}
          </span>
          {isYou && <span className="text-[10px] text-[var(--text-muted)] shrink-0">(you)</span>}
        </div>
        {typeof rating === "number" && (
          <span className="text-xs text-[var(--text-muted)] shrink-0">{rating}</span>
        )}
      </div>

      <div
        className={`timer text-3xl font-bold text-center py-2 px-3 rounded-md ${
          isCritical && isActive
            ? "bg-red-900/50 text-red-400 animate-pulse"
            : isLow && isActive
            ? "bg-yellow-900/30 text-yellow-400"
            : isActive
            ? "bg-[var(--bg-input)] text-[var(--text-primary)]"
            : "bg-[var(--bg-dark)] text-[var(--text-secondary)]"
        }`}
      >
        {formatTime(seconds)}
      </div>

      <div className="mt-2 h-1 rounded-full bg-[var(--bg-dark)] overflow-hidden">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            isCritical ? "bg-red-500" : isLow ? "bg-yellow-500" : "bg-green-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex items-center gap-0.5 flex-wrap min-h-[20px]">
        {captured.map((p, i) => (
          <span key={i} className="text-base leading-none">
            {pieceToUnicode[p] ?? p}
          </span>
        ))}
        {materialDiff > 0 && (
          <span className="text-xs text-[var(--text-muted)] ml-1">+{materialDiff}</span>
        )}
      </div>
    </div>
  );
}
