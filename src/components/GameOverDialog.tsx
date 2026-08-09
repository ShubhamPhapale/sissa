"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface GameOverDialogProps {
  winner: "w" | "b" | "draw";
  reason: string;
  whiteName: string;
  blackName: string;
  myColor: "w" | "b" | null;
  onRematch?: () => void;
  onReview?: () => void;
}

const REASON_TEXT: Record<string, string> = {
  checkmate: "by checkmate",
  resignation: "by resignation",
  timeout: "on time",
  stalemate: "by stalemate",
  agreement: "by agreement",
  "50-move rule": "by the 50-move rule",
  "insufficient material": "by insufficient material",
};

export default function GameOverDialog({
  winner,
  reason,
  whiteName,
  blackName,
  myColor,
  onRematch,
  onReview,
}: GameOverDialogProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return (
      <button
        onClick={() => setDismissed(false)}
        className="absolute top-2 right-2 z-50 btn btn-secondary text-xs"
      >
        Show result
      </button>
    );
  }

  const winnerName = winner === "w" ? whiteName : winner === "b" ? blackName : null;
  const detail = REASON_TEXT[reason] ?? reason;

  const outcome =
    myColor === null
      ? null
      : winner === "draw"
      ? "draw"
      : winner === myColor
      ? "win"
      : "loss";

  return (
    <div className="game-over-overlay">
      <div className="card p-6 max-w-xs w-full text-center slide-in">

        <h2 className="text-2xl font-bold mb-1">
          {winner === "draw" ? "Draw" : `${winnerName} wins`}
        </h2>
        <p className="text-[var(--text-secondary)] text-sm mb-1">{detail}</p>

        <p className="font-mono text-lg mb-4">
          {winner === "draw" ? "½–½" : winner === "w" ? "1–0" : "0–1"}
        </p>

        {outcome && (
          <div
            className={`mb-4 py-1.5 rounded-md text-sm font-semibold ${
              outcome === "win"
                ? "bg-green-900/30 text-green-400"
                : outcome === "loss"
                ? "bg-red-900/30 text-red-400"
                : "bg-yellow-900/25 text-yellow-400"
            }`}
          >
            {outcome === "win" ? "You won!" : outcome === "loss" ? "You lost" : "Drawn game"}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {onRematch && (
            <button onClick={onRematch} className="btn btn-primary">
              Rematch
            </button>
          )}
          {onReview && (
            <button
              onClick={() => {
                setDismissed(true);
                onReview();
              }}
              className="btn btn-secondary"
            >
              Review game
            </button>
          )}
          <button onClick={() => router.push("/")} className="btn btn-secondary">
            Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
