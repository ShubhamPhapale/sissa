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
    <div className={`flex items-center justify-between py-2 transition-all ${isActive ? "" : "opacity-90"}`}>
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate text-[var(--text-primary)]">
            {playerName || (playerColor === "w" ? "White" : "Black")}
          </span>
          {typeof rating === "number" && (
            <span className="text-xs font-medium text-[var(--text-muted)] shrink-0">({rating})</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-wrap min-h-[16px] mt-0.5 opacity-80">
          {captured.map((p, i) => (
            <span key={i} className="text-sm leading-none" style={{ color: p === p.toLowerCase() ? "#000" : "#fff", textShadow: "0 0 1px #888" }}>
              {pieceToUnicode[p]}
            </span>
          ))}
          {materialDiff > 0 && (
            <span className="text-[10px] text-[var(--text-muted)] font-medium ml-1">+{materialDiff}</span>
          )}
        </div>
      </div>

      <div className="relative shrink-0 text-right min-w-[100px]">
        <div
          className={`px-3 py-1.5 rounded-sm font-mono text-xl font-bold tracking-wider inline-flex justify-center transition-colors shadow-sm ${
            isActive
              ? isCritical
                ? "bg-red-600/90 text-white animate-pulse"
                : "bg-[var(--bg-card)] text-white shadow-inner shadow-[var(--accent)] ring-1 ring-[var(--accent)]"
              : "bg-[#1f1e1b] text-[var(--text-muted)]"
          }`}
        >
          {formatTime(seconds)}
        </div>
        <div className="w-full h-1 mt-1 rounded-full bg-black/50 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              isCritical ? "bg-red-500" : isLow ? "bg-yellow-500" : "bg-green-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
