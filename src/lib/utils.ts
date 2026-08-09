export const PIECE_UNICODE: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

export const PIECE_VALUES: Record<string, number> = {
  P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0,
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

export const TIME_CONTROLS = [
  { label: "Bullet", seconds: 60 },
  { label: "Blitz 2", seconds: 120 },
  { label: "Blitz 3", seconds: 180 },
  { label: "Blitz 5", seconds: 300 },
  { label: "Rapid 10", seconds: 600 },
  { label: "Rapid 15", seconds: 900 },
  { label: "Classical 30", seconds: 1800 },
];

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatMoveNumber(num: number): string {
  return `${Math.ceil(num / 2)}.`;
}

export function getCapturedPieces(moves: Array<{ piece: string; captured?: string | null }>): { white: string[]; black: string[] } {
  const white: string[] = [];
  const black: string[] = [];
  
  for (const move of moves) {
    if (move.captured) {
      if (move.captured === move.captured.toUpperCase()) {
        black.push(move.captured);
      } else {
        white.push(move.captured);
      }
    }
  }
  
  const sortPieces = (pieces: string[]) => {
    const order = ["Q", "R", "B", "N", "P", "q", "r", "b", "n", "p"];
    return pieces.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  };
  
  return { white: sortPieces(white), black: sortPieces(black) };
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "playing":
    case "waiting":
      return "green";
    case "white_won":
    case "black_won":
      return "blue";
    case "draw":
    case "resigned":
      return "yellow";
    case "timeout":
      return "red";
    default:
      return "green";
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "playing":
      return "Playing";
    case "waiting":
      return "Waiting";
    case "white_won":
      return "White Won";
    case "black_won":
      return "Black Won";
    case "draw":
      return "Draw";
    case "resigned":
      return "Resigned";
    case "timeout":
      return "Timeout";
    default:
      return status;
  }
}

export function getMaterialAdvantage(pieces: { white: string[]; black: string[] }): number {
  let whiteTotal = 0;
  let blackTotal = 0;
  
  for (const p of pieces.white) {
    whiteTotal += PIECE_VALUES[p] || 0;
  }
  for (const p of pieces.black) {
    blackTotal += PIECE_VALUES[p] || 0;
  }
  
  return blackTotal - whiteTotal; // Positive means black has advantage
}
