// Chess Engine - Full implementation of chess rules

export type Piece = "P" | "N" | "B" | "R" | "Q" | "K" | "p" | "n" | "b" | "r" | "q" | "k" | null;
export type Board = Piece[][];
export type Color = "w" | "b";

export interface Square {
  row: number;
  col: number;
}

export interface Move {
  from: Square;
  to: Square;
  piece: Piece;
  captured?: Piece;
  promotion?: "Q" | "R" | "B" | "N";
  castle?: "K" | "Q";
  enPassant?: boolean;
  check?: boolean;
  checkmate?: boolean;
  san?: string;
}

export interface GameState {
  board: Board;
  turn: Color;
  castlingRights: { K: boolean; Q: boolean; k: boolean; q: boolean };
  enPassantTarget: Square | null;
  halfMoveClock: number;
  fullMoveNumber: number;
  moveHistory: Move[];
  gameOver: boolean;
  winner: Color | "draw" | null;
  reason: string;
}

export const PIECE_VALUES: Record<string, number> = {
  P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0,
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

export const PIECE_UNICODE: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

export const PIECE_NAMES: Record<string, string> = {
  K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn",
  k: "King", q: "Queen", r: "Rook", b: "Bishop", n: "Knight", p: "Pawn",
};

export function getPieceColor(piece: Piece): Color | null {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? "w" : "b";
}

export function isWhitePiece(piece: Piece): boolean {
  return piece !== null && piece === piece.toUpperCase();
}

export function isBlackPiece(piece: Piece): boolean {
  return piece !== null && piece === piece.toLowerCase();
}

export function createInitialBoard(): Board {
  const board: Board = Array(8).fill(null).map(() => Array(8).fill(null));
  
  // Place black pieces
  board[0] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  board[1] = Array(8).fill("p");
  
  // Place white pieces
  board[7] = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  board[6] = Array(8).fill("P");
  
  return board;
}

export function cloneBoard(board: Board): Board {
  return board.map(row => [...row]);
}

export function squareToAlgebraic(sq: Square): string {
  return String.fromCharCode(97 + sq.col) + (8 - sq.row);
}

export function algebraicToSquare(alg: string): Square {
  return {
    col: alg.charCodeAt(0) - 97,
    row: 8 - parseInt(alg[1]),
  };
}

export function createInitialState(): GameState {
  return {
    board: createInitialBoard(),
    turn: "w",
    castlingRights: { K: true, Q: true, k: true, q: true },
    enPassantTarget: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    moveHistory: [],
    gameOver: false,
    winner: null,
    reason: "",
  };
}

export function parseFEN(fen: string): GameState {
  const parts = fen.split(" ");
  const boardRows = parts[0].split("/");
  const board: Board = [];
  
  for (const row of boardRows) {
    const boardRow: Piece[] = [];
    for (const char of row) {
      if (/\d/.test(char)) {
        for (let i = 0; i < parseInt(char); i++) {
          boardRow.push(null);
        }
      } else {
        boardRow.push(char as Piece);
      }
    }
    board.push(boardRow);
  }
  
  const castlingRights = {
    K: parts[2].includes("K"),
    Q: parts[2].includes("Q"),
    k: parts[2].includes("k"),
    q: parts[2].includes("q"),
  };
  
  let enPassantTarget: Square | null = null;
  if (parts[3] !== "-") {
    enPassantTarget = algebraicToSquare(parts[3]);
  }
  
  return {
    board,
    turn: parts[1] as Color,
    castlingRights,
    enPassantTarget,
    halfMoveClock: parseInt(parts[4]),
    fullMoveNumber: parseInt(parts[5]),
    moveHistory: [],
    gameOver: false,
    winner: null,
    reason: "",
  };
}

export function stateToFEN(state: GameState): string {
  let fen = "";
  
  for (let row = 0; row < 8; row++) {
    let emptyCount = 0;
    for (let col = 0; col < 8; col++) {
      if (state.board[row][col] === null) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          fen += emptyCount;
          emptyCount = 0;
        }
        fen += state.board[row][col];
      }
    }
    if (emptyCount > 0) fen += emptyCount;
    if (row < 7) fen += "/";
  }
  
  fen += ` ${state.turn} `;
  
  let castling = "";
  if (state.castlingRights.K) castling += "K";
  if (state.castlingRights.Q) castling += "Q";
  if (state.castlingRights.k) castling += "k";
  if (state.castlingRights.q) castling += "q";
  fen += (castling || "-") + " ";
  
  fen += (state.enPassantTarget ? squareToAlgebraic(state.enPassantTarget) : "-") + " ";
  fen += state.halfMoveClock + " ";
  fen += state.fullMoveNumber;
  
  return fen;
}

function isInBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function findKing(board: Board, color: Color): Square {
  const king = color === "w" ? "K" : "k";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (board[row][col] === king) {
        return { row, col };
      }
    }
  }
  throw new Error(`King not found for ${color}`);
}

function isSquareAttackedBy(board: Board, sq: Square, byColor: Color): boolean {
  // Check knight attacks
  const knightMoves = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  const enemyKnight = byColor === "w" ? "N" : "n";
  for (const [dr, dc] of knightMoves) {
    const r = sq.row + dr, c = sq.col + dc;
    if (isInBounds(r, c) && board[r][c] === enemyKnight) return true;
  }
  
  // Check pawn attacks
  const pawnDir = byColor === "w" ? 1 : -1; // pawns attack "forward" from their perspective
  const enemyPawn = byColor === "w" ? "P" : "p";
  for (const dc of [-1, 1]) {
    const r = sq.row + pawnDir, c = sq.col + dc;
    if (isInBounds(r, c) && board[r][c] === enemyPawn) return true;
  }
  
  // Check king attacks
  const enemyKing = byColor === "w" ? "K" : "k";
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = sq.row + dr, c = sq.col + dc;
      if (isInBounds(r, c) && board[r][c] === enemyKing) return true;
    }
  }
  
  // Check rook/queen attacks (straight lines)
  const enemyRook = byColor === "w" ? "R" : "r";
  const enemyQueen = byColor === "w" ? "Q" : "q";
  const straightDirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const [dr, dc] of straightDirs) {
    let r = sq.row + dr, c = sq.col + dc;
    while (isInBounds(r, c)) {
      if (board[r][c] !== null) {
        if (board[r][c] === enemyRook || board[r][c] === enemyQueen) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }
  
  // Check bishop/queen attacks (diagonals)
  const enemyBishop = byColor === "w" ? "B" : "b";
  const diagDirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [dr, dc] of diagDirs) {
    let r = sq.row + dr, c = sq.col + dc;
    while (isInBounds(r, c)) {
      if (board[r][c] !== null) {
        if (board[r][c] === enemyBishop || board[r][c] === enemyQueen) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }
  
  return false;
}

export function isInCheck(board: Board, color: Color): boolean {
  const kingSq = findKing(board, color);
  const enemyColor = color === "w" ? "b" : "w";
  return isSquareAttackedBy(board, kingSq, enemyColor);
}

function generatePseudoLegalMoves(state: GameState, color: Color): Move[] {
  const moves: Move[] = [];
  const { board } = state;
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece || getPieceColor(piece) !== color) continue;
      
      const from: Square = { row, col };
      const pieceType = piece.toUpperCase();
      
      if (pieceType === "P") {
        const dir = color === "w" ? -1 : 1;
        const startRow = color === "w" ? 6 : 1;
        const promoRow = color === "w" ? 0 : 7;
        
        // Forward one
        if (isInBounds(row + dir, col) && !board[row + dir][col]) {
          if (row + dir === promoRow) {
            for (const promo of ["Q", "R", "B", "N"] as const) {
              moves.push({ from, to: { row: row + dir, col }, piece, promotion: promo });
            }
          } else {
            moves.push({ from, to: { row: row + dir, col }, piece });
          }
          
          // Forward two from start
          if (row === startRow && !board[row + 2 * dir][col]) {
            moves.push({ from, to: { row: row + 2 * dir, col }, piece });
          }
        }
        
        // Captures
        for (const dc of [-1, 1]) {
          const nr = row + dir, nc = col + dc;
          if (!isInBounds(nr, nc)) continue;
          const target = board[nr][nc];
          if (target && getPieceColor(target) !== color) {
            if (nr === promoRow) {
              for (const promo of ["Q", "R", "B", "N"] as const) {
                moves.push({ from, to: { row: nr, col: nc }, piece, captured: target, promotion: promo });
              }
            } else {
              moves.push({ from, to: { row: nr, col: nc }, piece, captured: target });
            }
          }
          
          // En passant
          if (state.enPassantTarget && state.enPassantTarget.row === nr && state.enPassantTarget.col === nc) {
            const capturedPawn = color === "w" ? "p" : "P";
            moves.push({ from, to: { row: nr, col: nc }, piece, captured: capturedPawn, enPassant: true });
          }
        }
      } else if (pieceType === "N") {
        const knightMoves = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2], [1, 2], [2, -1], [2, 1],
        ];
        for (const [dr, dc] of knightMoves) {
          const nr = row + dr, nc = col + dc;
          if (!isInBounds(nr, nc)) continue;
          const target = board[nr][nc];
          if (target && getPieceColor(target) === color) continue;
          moves.push({ from, to: { row: nr, col: nc }, piece, captured: target || undefined });
        }
      } else if (pieceType === "K") {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr, nc = col + dc;
            if (!isInBounds(nr, nc)) continue;
            const target = board[nr][nc];
            if (target && getPieceColor(target) === color) continue;
            moves.push({ from, to: { row: nr, col: nc }, piece, captured: target || undefined });
          }
        }
        
        // Castling
        const enemyColor = color === "w" ? "b" : "w";
        if (!isInCheck(board, color)) {
          // Kingside
          const ksRight = color === "w" ? state.castlingRights.K : state.castlingRights.k;
          if (ksRight && !board[row][5] && !board[row][6]) {
            if (!isSquareAttackedBy(board, { row, col: 5 }, enemyColor) &&
                !isSquareAttackedBy(board, { row, col: 6 }, enemyColor)) {
              moves.push({ from, to: { row, col: 6 }, piece, castle: "K" });
            }
          }
          
          // Queenside
          const qsRight = color === "w" ? state.castlingRights.Q : state.castlingRights.q;
          if (qsRight && !board[row][3] && !board[row][2] && !board[row][1]) {
            if (!isSquareAttackedBy(board, { row, col: 3 }, enemyColor) &&
                !isSquareAttackedBy(board, { row, col: 2 }, enemyColor)) {
              moves.push({ from, to: { row, col: 2 }, piece, castle: "Q" });
            }
          }
        }
      } else {
        // Sliding pieces (B, R, Q)
        const dirs: number[][] = [];
        if (pieceType === "B" || pieceType === "Q") {
          dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
        }
        if (pieceType === "R" || pieceType === "Q") {
          dirs.push([0, 1], [0, -1], [1, 0], [-1, 0]);
        }
        
        for (const [dr, dc] of dirs) {
          let nr = row + dr, nc = col + dc;
          while (isInBounds(nr, nc)) {
            const target = board[nr][nc];
            if (target) {
              if (getPieceColor(target) !== color) {
                moves.push({ from, to: { row: nr, col: nc }, piece, captured: target });
              }
              break;
            }
            moves.push({ from, to: { row: nr, col: nc }, piece });
            nr += dr;
            nc += dc;
          }
        }
      }
    }
  }
  
  return moves;
}

/** Pure state transition: applies a move without terminal (mate/draw) detection. */
export function applyMove(state: GameState, move: Move): GameState {
  const newState: GameState = {
    board: cloneBoard(state.board),
    turn: state.turn === "w" ? "b" : "w",
    castlingRights: { ...state.castlingRights },
    enPassantTarget: null,
    halfMoveClock: state.halfMoveClock,
    fullMoveNumber: state.fullMoveNumber,
    moveHistory: [...state.moveHistory, move],
    gameOver: false,
    winner: null,
    reason: "",
  };
  
  const { board } = newState;
  const piece = move.piece;
  
  // Move the piece
  board[move.to.row][move.to.col] = piece;
  board[move.from.row][move.from.col] = null;
  
  // En passant capture
  if (move.enPassant) {
    const capturedRow = getPieceColor(piece) === "w" ? move.to.row + 1 : move.to.row - 1;
    board[capturedRow][move.to.col] = null;
  }
  
  // Promotion
  if (move.promotion) {
    const color = getPieceColor(piece);
    board[move.to.row][move.to.col] = color === "w" ? move.promotion : move.promotion.toLowerCase() as Piece;
  }
  
  // Castling - move the rook
  if (move.castle) {
    if (move.castle === "K") {
      board[move.from.row][5] = board[move.from.row][7];
      board[move.from.row][7] = null;
    } else {
      board[move.from.row][3] = board[move.from.row][0];
      board[move.from.row][0] = null;
    }
  }
  
  // Update castling rights
  if (piece === "K") {
    newState.castlingRights.K = false;
    newState.castlingRights.Q = false;
  }
  if (piece === "k") {
    newState.castlingRights.k = false;
    newState.castlingRights.q = false;
  }
  if (piece === "R" && move.from.row === 7 && move.from.col === 7) newState.castlingRights.K = false;
  if (piece === "R" && move.from.row === 7 && move.from.col === 0) newState.castlingRights.Q = false;
  if (piece === "r" && move.from.row === 0 && move.from.col === 7) newState.castlingRights.k = false;
  if (piece === "r" && move.from.row === 0 && move.from.col === 0) newState.castlingRights.q = false;
  // Also update if rook is captured
  if (move.to.row === 0 && move.to.col === 7) newState.castlingRights.k = false;
  if (move.to.row === 0 && move.to.col === 0) newState.castlingRights.q = false;
  if (move.to.row === 7 && move.to.col === 7) newState.castlingRights.K = false;
  if (move.to.row === 7 && move.to.col === 0) newState.castlingRights.Q = false;
  
  // Update en passant target
  if (piece && piece.toUpperCase() === "P" && Math.abs(move.from.row - move.to.row) === 2) {
    newState.enPassantTarget = {
      row: (move.from.row + move.to.row) / 2,
      col: move.from.col,
    };
  }
  
  // Update half move clock
  if (piece && piece.toUpperCase() === "P" || move.captured) {
    newState.halfMoveClock = 0;
  } else {
    newState.halfMoveClock++;
  }
  
  // Update full move number
  if (state.turn === "b") {
    newState.fullMoveNumber++;
  }
  
  return newState;
}

/**
 * Applies a move and additionally computes terminal conditions
 * (check, checkmate, stalemate, 50-move rule, insufficient material).
 */
export function makeMove(state: GameState, move: Move): GameState {
  const newState = applyMove(state, move);
  const moverColor = state.turn;

  const inCheck = isInCheck(newState.board, newState.turn);
  const legalMoves = generateLegalMoves(newState, newState.turn);

  if (legalMoves.length === 0) {
    newState.gameOver = true;
    if (inCheck) {
      move.checkmate = true;
      move.check = true;
      newState.winner = moverColor;
      newState.reason = "checkmate";
    } else {
      newState.winner = "draw";
      newState.reason = "stalemate";
    }
  } else if (inCheck) {
    move.check = true;
  }

  // Keep the recorded history entry in sync with the flags set above.
  const recorded = newState.moveHistory[newState.moveHistory.length - 1];
  if (recorded) {
    recorded.check = move.check;
    recorded.checkmate = move.checkmate;
  }

  // 50-move rule
  if (!newState.gameOver && newState.halfMoveClock >= 100) {
    newState.gameOver = true;
    newState.winner = "draw";
    newState.reason = "50-move rule";
  }

  // Insufficient material
  if (!newState.gameOver && isInsufficientMaterial(getAllPieces(newState.board))) {
    newState.gameOver = true;
    newState.winner = "draw";
    newState.reason = "insufficient material";
  }

  return newState;
}

function getAllPieces(board: Board): Piece[] {
  const pieces: Piece[] = [];
  for (const row of board) {
    for (const piece of row) {
      if (piece) pieces.push(piece);
    }
  }
  return pieces;
}

function isInsufficientMaterial(pieces: Piece[]): boolean {
  // K vs K
  if (pieces.length === 2) return true;
  // K+B vs K or K+N vs K
  if (pieces.length === 3) {
    const nonKing = pieces.find(p => p && p.toUpperCase() !== "K");
    if (nonKing && (nonKing.toUpperCase() === "B" || nonKing.toUpperCase() === "N")) return true;
  }
  // K+B vs K+B same color bishops
  if (pieces.length === 4) {
    const whiteBishops = pieces.filter(p => p === "B");
    const blackBishops = pieces.filter(p => p === "b");
    if (whiteBishops.length === 1 && blackBishops.length === 1) {
      // Could check bishop color, but this is a rare edge case
    }
  }
  return false;
}

export function generateLegalMoves(state: GameState, color: Color): Move[] {
  const pseudoMoves = generatePseudoLegalMoves(state, color);
  const legalMoves: Move[] = [];
  
  for (const move of pseudoMoves) {
    const testState: GameState = {
      board: cloneBoard(state.board),
      turn: color,
      castlingRights: { ...state.castlingRights },
      enPassantTarget: state.enPassantTarget,
      halfMoveClock: state.halfMoveClock,
      fullMoveNumber: state.fullMoveNumber,
      moveHistory: [],
      gameOver: false,
      winner: null,
      reason: "",
    };
    
    // Make the move on test board
    const piece = move.piece;
    testState.board[move.to.row][move.to.col] = piece;
    testState.board[move.from.row][move.from.col] = null;
    
  if (move.enPassant) {
    const capturedRow = getPieceColor(piece!) === "w" ? move.to.row + 1 : move.to.row - 1;
    testState.board[capturedRow][move.to.col] = null;
  }
  
  if (move.promotion) {
    testState.board[move.to.row][move.to.col] = color === "w" ? move.promotion : move.promotion.toLowerCase() as Piece;
  }
    
    if (move.castle) {
      if (move.castle === "K") {
        testState.board[move.from.row][5] = testState.board[move.from.row][7];
        testState.board[move.from.row][7] = null;
      } else {
        testState.board[move.from.row][3] = testState.board[move.from.row][0];
        testState.board[move.from.row][0] = null;
      }
    }
    
    if (!isInCheck(testState.board, color)) {
      legalMoves.push(move);
    }
  }
  
  return legalMoves;
}

export function generateSAN(state: GameState, move: Move): string {
  const pieceType = move.piece!.toUpperCase();
  let san = "";
  
  if (move.castle === "K") return "O-O";
  if (move.castle === "Q") return "O-O-O";
  
  if (pieceType !== "P") {
    san += pieceType;
    
    // Disambiguation
    const color = getPieceColor(move.piece!)!;
    const legalMoves = generateLegalMoves(state, color);
    const ambiguous = legalMoves.filter(m =>
      m.piece === move.piece &&
      m.to.row === move.to.row &&
      m.to.col === move.to.col &&
      (m.from.row !== move.from.row || m.from.col !== move.from.col)
    );
    
    if (ambiguous.length > 0) {
      const sameFile = ambiguous.some(m => m.from.col === move.from.col);
      const sameRank = ambiguous.some(m => m.from.row === move.from.row);
      
      if (!sameFile) {
        san += String.fromCharCode(97 + move.from.col);
      } else if (!sameRank) {
        san += (8 - move.from.row);
      } else {
        san += String.fromCharCode(97 + move.from.col) + (8 - move.from.row);
      }
    }
  }
  
  if (move.captured) {
    if (pieceType === "P") {
      san += String.fromCharCode(97 + move.from.col);
    }
    san += "x";
  }
  
  san += squareToAlgebraic(move.to);
  
  if (move.promotion) {
    san += "=" + move.promotion;
  }
  
  return san;
}

export function getLegalMovesForPiece(state: GameState, sq: Square): Move[] {
  const piece = state.board[sq.row][sq.col];
  if (!piece) return [];
  const color = getPieceColor(piece);
  if (!color) return [];
  
  const allLegal = generateLegalMoves(state, color);
  return allLegal.filter(m => m.from.row === sq.row && m.from.col === sq.col);
}

export function getAllLegalMoves(state: GameState): Move[] {
  return generateLegalMoves(state, state.turn);
}

export function isCheckmate(state: GameState): boolean {
  return state.gameOver && state.winner !== "draw" && state.reason === "checkmate";
}

export function isStalemate(state: GameState): boolean {
  return state.gameOver && state.winner === "draw" && state.reason === "stalemate";
}

export function getMaterialAdvantage(state: GameState): number {
  let white = 0, black = 0;
  for (const row of state.board) {
    for (const piece of row) {
      if (!piece) continue;
      const val = PIECE_VALUES[piece] || 0;
      if (isWhitePiece(piece)) white += val;
      else black += val;
    }
  }
  return white - black;
}
