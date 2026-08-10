"use client";

import { useEffect, useRef } from "react";
import { CLASSIFICATION_COLORS, CLASSIFICATION_ICONS } from "@/lib/game-analysis-types";

export interface HistoryMove {
  san: string;
  check?: boolean;
  checkmate?: boolean;
  classification?: string;
}

interface MoveHistoryProps {
  moves: HistoryMove[];
  /** Index (ply) of the move currently shown on the board. */
  activeMoveIndex?: number;
  onMoveClick?: (index: number) => void;
  className?: string;
}

export default function MoveHistory({
  moves,
  activeMoveIndex,
  onMoveClick,
  className = "",
}: MoveHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [moves.length]);

  // Pair plies into "1. e4 e5" rows. The full-move number is derived from the
  // ply index, never from a stored counter.
  const rows: Array<{ number: number; white?: HistoryMove; whitePly?: number; black?: HistoryMove; blackPly?: number }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      number: i / 2 + 1,
      white: moves[i],
      whitePly: i,
      black: moves[i + 1],
      blackPly: moves[i + 1] ? i + 1 : undefined,
    });
  }

  return (
    <div className={`card flex flex-col ${className}`}>
      <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <span>📋</span> Moves
        </h3>
        <span className="text-xs text-[var(--text-muted)]">{moves.length} plies</span>
      </div>

      <div ref={scrollRef} className="move-history overflow-y-auto flex-1 min-h-0 p-2">
        {rows.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-muted)] text-sm">
            No moves yet
          </div>
        ) : (
          <div className="space-y-0.5">
            {rows.map((row) => (
              <div key={row.number} className="flex items-center gap-1">
                <span className="text-[var(--text-muted)] text-xs w-7 text-right mr-1 shrink-0 font-mono">
                  {row.number}.
                </span>
                <MoveEntry
                  move={row.white}
                  ply={row.whitePly}
                  isActive={activeMoveIndex === row.whitePly}
                  onClick={onMoveClick}
                />
                <MoveEntry
                  move={row.black}
                  ply={row.blackPly}
                  isActive={activeMoveIndex === row.blackPly}
                  onClick={onMoveClick}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MoveEntry({
  move,
  ply,
  isActive,
  onClick,
}: {
  move?: HistoryMove;
  ply?: number;
  isActive: boolean;
  onClick?: (index: number) => void;
}) {
  if (!move || ply === undefined) return <div className="flex-1" />;

  const hasSuffix = move.san.endsWith('+') || move.san.endsWith('#');
  const suffix = hasSuffix ? "" : (move.checkmate ? "#" : move.check ? "+" : "");

  return (
    <button
      type="button"
      className={`move-entry flex-1 text-sm text-left flex items-center justify-between ${isActive ? "active" : ""}`}
      onClick={() => onClick?.(ply)}
    >
      <span className="font-mono">
        {move.san}{suffix}
      </span>
      {move.classification && CLASSIFICATION_COLORS[move.classification as keyof typeof CLASSIFICATION_COLORS] && (
        <span 
          className="text-[10px] font-bold px-1 rounded-sm ml-1 shrink-0 leading-tight"
          style={{ 
            backgroundColor: CLASSIFICATION_COLORS[move.classification as keyof typeof CLASSIFICATION_COLORS],
            color: '#fff'
          }}
        >
          {CLASSIFICATION_ICONS[move.classification as keyof typeof CLASSIFICATION_ICONS]}
        </span>
      )}
    </button>
  );
}
