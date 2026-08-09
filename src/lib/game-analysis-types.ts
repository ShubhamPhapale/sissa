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
  brilliant: "#1baca6",
  great: "#5c8bb0",
  best: "#81b64c",
  excellent: "#96bc4b",
  good: "#96bc4b",
  book: "#a88865",
  inaccuracy: "#f0c15c",
  mistake: "#e58f39",
  blunder: "#ca3431",
};

export const CLASSIFICATION_ICONS: Record<string, string> = {
  brilliant: "!!",
  great: "!",
  best: "★",
  excellent: "✓",
  good: "✓",
  book: "📖",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};
