"use client";

import { useEffect, useRef, useState } from "react";
import {
  type GameState,
  type Move,
  type Square,
  getLegalMovesForPiece,
  getAllLegalMoves,
  squareToAlgebraic,
  algebraicToSquare,
  isInCheck,
} from "@/lib/chess-engine";
import ChessPiece from "./ChessPiece";

import {
  CLASSIFICATION_COLORS,
  CLASSIFICATION_ICONS,
} from "@/lib/game-analysis-types";

interface ChessBoardProps {
  gameState: GameState;
  playerColor: "w" | "b";
  onMove: (move: Move) => void;
  lastMove?: Move | null;
  boardFlipped?: boolean;
  /** When false the board is read-only (spectating, finished games, replay). */
  interactive?: boolean;
  /** When true, any player can move any color's pieces (useful for review mode). */
  allowBothColors?: boolean;
  /** Classification of the last move to show as a badge. */
  lastMoveClassification?: string | null;
  /** Best move arrow to display. {from: string, to: string, color?: string} */
  bestMoveArrow?: { from: string; to: string; color?: string } | null;
}

export default function ChessBoard({
  gameState,
  playerColor,
  onMove,
  lastMove,
  boardFlipped = false,
  interactive = true,
  allowBothColors = false,
  lastMoveClassification = null,
  bestMoveArrow = null,
}: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [squareSize, setSquareSize] = useState(0);

  // XOR: black sees the board flipped by default, and the flip button toggles
  // from whatever that player's default orientation is.
  const flipped = (playerColor === "b") !== boardFlipped;

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const updateSize = () => {
      setSquareSize(board.getBoundingClientRect().width / 8);
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(board);

    return () => observer.disconnect();
  }, []);

  const pieceSize = Math.max(24, Math.min(56, Math.floor(squareSize * 0.72) || 40));

  const handleSquareClick = (row: number, col: number) => {
    if (!interactive || gameState.gameOver) return;

    const clickedPiece = gameState.board[row][col];
    const clickedColor = clickedPiece
      ? clickedPiece === clickedPiece.toUpperCase()
        ? "w"
        : "b"
      : null;

    // If a piece is already selected
    if (selectedSquare) {
      // Check if clicking on own piece - select it instead
      if (clickedColor === gameState.turn && (clickedColor === playerColor || allowBothColors)) {
        const sq: Square = { row, col };
        setSelectedSquare(sq);
        setLegalMoves(getLegalMovesForPiece(gameState, sq));
        return;
      }

      // Try to make the move
      const targetMove = legalMoves.find(
        (m) => m.to.row === row && m.to.col === col && !m.promotion
      );

      if (targetMove) {
        onMove(targetMove);
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }

      // Check for promotion moves
      const promoMoves = legalMoves.filter(
        (m) => m.to.row === row && m.to.col === col && m.promotion
      );

      if (promoMoves.length > 0) {
        setPendingPromotion({
          from: selectedSquare,
          to: { row, col },
        });
        return;
      }

      // Deselect
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    // No piece selected - select if it's the current player's piece
    if (clickedColor === gameState.turn && (clickedColor === playerColor || allowBothColors)) {
      const sq: Square = { row, col };
      setSelectedSquare(sq);
      setLegalMoves(getLegalMovesForPiece(gameState, sq));
    }
  };

  const handlePromotion = (promoType: "Q" | "R" | "B" | "N") => {
    if (!pendingPromotion) return;

    const move = legalMoves.find(
      (m) =>
        m.from.row === pendingPromotion.from.row &&
        m.from.col === pendingPromotion.from.col &&
        m.to.row === pendingPromotion.to.row &&
        m.to.col === pendingPromotion.to.col &&
        m.promotion === promoType
    );

    if (move) {
      onMove(move);
    }

    setSelectedSquare(null);
    setLegalMoves([]);
    setPendingPromotion(null);
  };

  const isLastMoveSquare = (row: number, col: number) => {
    if (!lastMove) return false;
    return (
      (lastMove.from.row === row && lastMove.from.col === col) ||
      (lastMove.to.row === row && lastMove.to.col === col)
    );
  };

  const isLegalTarget = (row: number, col: number) => {
    return legalMoves.some((m) => m.to.row === row && m.to.col === col);
  };

  const kingInCheckSquare = (): Square | null => {
    if (isInCheck(gameState.board, gameState.turn)) {
      const king = gameState.turn === "w" ? "K" : "k";
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (gameState.board[r][c] === king) {
            return { row: r, col: c };
          }
        }
      }
    }
    return null;
  };

  const checkSq = kingInCheckSquare();

  // Render order
  const renderRows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const renderCols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const fileLetters = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const rankNumbers = [8, 7, 6, 5, 4, 3, 2, 1];

  return (
    <div className="relative">
      <div className="chess-board" ref={boardRef}>
        {renderRows.map((row) =>
          renderCols.map((col) => {
            const piece = gameState.board[row][col];
            const isLight = (row + col) % 2 === 0;
            const isSelected =
              selectedSquare?.row === row && selectedSquare?.col === col;
            const isLast = isLastMoveSquare(row, col);
            const isLegal = isLegalTarget(row, col);
            const hasCapture = isLegal && piece !== null;
            const isCheck =
              checkSq?.row === row && checkSq?.col === col;
            
            const isLastMoveTarget = lastMove && lastMove.to.row === row && lastMove.to.col === col;

            // File label (bottom row)
            const showFileLabel =
              (!flipped && row === 7) || (flipped && row === 0);
            // Rank label (first col)
            const showRankLabel =
              (!flipped && col === 0) || (flipped && col === 7);

            return (
              <div
                key={`${row}-${col}`}
                className={`chess-square ${isLight ? "light" : "dark"} ${
                  isSelected ? "selected" : ""
                } ${isLast && !isSelected ? "last-move" : ""} ${
                  isCheck ? "check" : ""
                }`}
                onClick={() => handleSquareClick(row, col)}
              >
                {showRankLabel && <span className="rank-label">{8 - row}</span>}
                {showFileLabel && <span className="file-label">{fileLetters[col]}</span>}

                {piece && (
                  <ChessPiece
                    piece={piece}
                    size={pieceSize}
                    className={`chess-piece ${
                      isSelected ? "dragging" : ""
                    }`}
                  />
                )}

                {isLastMoveTarget && lastMoveClassification && (
                  <div 
                    className="absolute -top-2 -right-2 w-[22px] h-[22px] flex items-center justify-center text-[11px] font-bold text-white rounded-full z-10 shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
                    style={{ backgroundColor: CLASSIFICATION_COLORS[lastMoveClassification] }}
                    title={lastMoveClassification}
                  >
                    {CLASSIFICATION_ICONS[lastMoveClassification]}
                  </div>
                )}

                {isLegal && !hasCapture && (
                  <div
                    className="absolute w-3 h-3 rounded-full bg-black/20"
                    style={{ pointerEvents: "none" }}
                  />
                )}
                {isLegal && hasCapture && (
                  <div
                    className="absolute inset-0.5 rounded-full border-[3px] border-black/20"
                    style={{ pointerEvents: "none" }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Promotion Dialog */}
      {pendingPromotion && (
        <div className="promotion-dialog">
          <div className="promotion-options">
            {(["Q", "R", "B", "N"] as const).map((promo) => {
              const pieceChar =
                gameState.turn === "w" ? promo : promo.toLowerCase();
              return (
                <div
                  key={promo}
                  className="promotion-option"
                  onClick={() => handlePromotion(promo)}
                >
                  <ChessPiece piece={pieceChar} size={48} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SVG Layer for Arrows */}
      {bestMoveArrow && (
        <svg
          className="absolute inset-0 pointer-events-none z-20"
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="4"
              markerHeight="4"
              refX="3"
              refY="2"
              orient="auto"
            >
              <polygon points="0 0, 4 2, 0 4" fill={bestMoveArrow.color || "rgba(0, 128, 255, 0.7)"} />
            </marker>
          </defs>
          {(() => {
            const sqFrom = algebraicToSquare(bestMoveArrow.from);
            const sqTo = algebraicToSquare(bestMoveArrow.to);

            let x1 = sqFrom.col * 12.5 + 6.25;
            let y1 = sqFrom.row * 12.5 + 6.25;
            let x2 = sqTo.col * 12.5 + 6.25;
            let y2 = sqTo.row * 12.5 + 6.25;

            if (flipped) {
              x1 = (7 - sqFrom.col) * 12.5 + 6.25;
              y1 = (7 - sqFrom.row) * 12.5 + 6.25;
              x2 = (7 - sqTo.col) * 12.5 + 6.25;
              y2 = (7 - sqTo.row) * 12.5 + 6.25;
            }

            // Adjust x2, y2 to shorten the line slightly so arrowhead doesn't cover the center
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            const shorten = 3.5;
            const nx = x2 - (dx / len) * shorten;
            const ny = y2 - (dy / len) * shorten;

            return (
              <line
                x1={x1}
                y1={y1}
                x2={nx}
                y2={ny}
                stroke={bestMoveArrow.color || "rgba(0, 128, 255, 0.7)"}
                strokeWidth="2.5"
                strokeLinecap="round"
                markerEnd="url(#arrowhead)"
                opacity="0.8"
              />
            );
          })()}
        </svg>
      )}
    </div>
  );
}
