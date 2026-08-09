"use client";

import { useEffect, useState } from "react";

interface GameControlsProps {
  onResign: () => void;
  onOfferDraw: () => void;
  onAcceptDraw: () => void;
  onDeclineDraw: () => void;
  onFlipBoard: () => void;
  isPlayerTurn: boolean;
  isSpectator: boolean;
  gameActive: boolean;
  /** 'w' | 'b' | null — who currently has a draw offer standing. */
  drawOfferedBy: string | null;
  myColor: "w" | "b" | null;
  busy?: boolean;
}

export default function GameControls({
  onResign,
  onOfferDraw,
  onAcceptDraw,
  onDeclineDraw,
  onFlipBoard,
  isPlayerTurn,
  isSpectator,
  gameActive,
  drawOfferedBy,
  myColor,
  busy,
}: GameControlsProps) {
  const [confirmResign, setConfirmResign] = useState(false);

  useEffect(() => {
    if (!confirmResign) return;
    const t = setTimeout(() => setConfirmResign(false), 5000);
    return () => clearTimeout(t);
  }, [confirmResign]);

  const offerFromOpponent = Boolean(drawOfferedBy && myColor && drawOfferedBy !== myColor);
  const offerFromMe = Boolean(drawOfferedBy && myColor && drawOfferedBy === myColor);

  return (
    <div className="card p-3">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        Controls
      </h3>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={onFlipBoard} className="btn btn-secondary text-sm col-span-2">
          Flip board
        </button>

        {!isSpectator && gameActive && (
          <>
            <button
              onClick={onOfferDraw}
              disabled={busy || offerFromMe}
              className="btn btn-secondary text-sm disabled:opacity-50"
            >
              {offerFromMe ? "Offered" : "Draw"}
            </button>
            <button
              onClick={() => {
                if (confirmResign) {
                  onResign();
                  setConfirmResign(false);
                } else {
                  setConfirmResign(true);
                }
              }}
              disabled={busy}
              className={`btn text-sm ${confirmResign ? "btn-danger" : "btn-secondary"}`}
            >
              {confirmResign ? "Sure?" : "Resign"}
            </button>
          </>
        )}
      </div>

      {offerFromOpponent && !isSpectator && gameActive && (
        <div className="mt-3 p-3 rounded-md bg-blue-900/25 border border-blue-700/40 slide-in">
          <p className="text-sm mb-2">Your opponent offers a draw.</p>
          <div className="flex gap-2">
            <button onClick={onAcceptDraw} disabled={busy} className="btn btn-primary text-xs flex-1">
              Accept
            </button>
            <button onClick={onDeclineDraw} disabled={busy} className="btn btn-secondary text-xs flex-1">
              Decline
            </button>
          </div>
        </div>
      )}

      {isSpectator && (
        <div className="mt-3 p-2 rounded-md bg-[var(--bg-input)] text-center text-xs text-[var(--text-secondary)]">
          Spectating — board is read-only
        </div>
      )}

      {!isSpectator && gameActive && isPlayerTurn && (
        <div className="mt-3 p-2 rounded-md bg-green-900/20 border border-green-800/40 text-center">
          <span className="text-green-400 text-sm font-medium">Your turn</span>
        </div>
      )}
    </div>
  );
}
