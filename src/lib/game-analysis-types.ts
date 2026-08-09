export interface MoveClassification {
  ply: number;
  san: string;
  fen: string;
  evalBefore: number;   // centipawn eval from white's perspective
  evalAfter: number;    // centipawn eval from white's perspective
  bestMove: string | null;
  bestEval: number;
  cpLoss: number;
  classification:
    | "brilliant"
    | "great"
    | "best"
    | "excellent"
    | "good"
    | "book"
    | "inaccuracy"
    | "mistake"
    | "blunder";
  isMate: boolean;
}

export interface GameAnalysisResult {
  moves: MoveClassification[];
  whiteAccuracy: number;
  blackAccuracy: number;
  summary: {
    white: ClassificationCounts;
    black: ClassificationCounts;
  };
}

export interface ClassificationCounts {
  brilliant: number;
  great: number;
  best: number;
  excellent: number;
  good: number;
  book: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
}

export const CLASSIFICATION_COLORS: Record<string, string> = {
  brilliant: "#26c6da",
  great: "#66bb6a",
  best: "#43a047",
  excellent: "#81c784",
  good: "#a5d6a7",
  book: "#90a4ae",
  inaccuracy: "#ffd54f",
  mistake: "#ff9800",
  blunder: "#f44336",
};

export const CLASSIFICATION_ICONS: Record<string, string> = {
  brilliant: "!!",
  great: "!",
  best: "★",
  excellent: "👍",
  good: "✔",
  book: "📖",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};
