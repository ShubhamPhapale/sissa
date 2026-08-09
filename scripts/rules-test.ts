/** Unit tests for terminal/draw conditions and SAN generation. */
import {
  parseFEN,
  makeMove,
  generateSAN,
  generateLegalMoves,
  algebraicToSquare,
  type GameState,
} from "../src/lib/chess-engine.ts";

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  if (got === want) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

/** Plays a coordinate move and returns the resulting state. */
function play(state: GameState, from: string, to: string, promo?: "Q" | "R" | "B" | "N") {
  const f = algebraicToSquare(from);
  const t = algebraicToSquare(to);
  const m = generateLegalMoves(state, state.turn).find(
    (x) =>
      x.from.row === f.row &&
      x.from.col === f.col &&
      x.to.row === t.row &&
      x.to.col === t.col &&
      (promo ? x.promotion === promo : !x.promotion)
  );
  if (!m) throw new Error(`illegal ${from}${to}`);
  const san = generateSAN(state, m);
  return { state: makeMove(state, m), san, move: m };
}

console.log("=== Terminal conditions ===");

// Stalemate: black to move, king has no legal move but is not in check.
{
  const s = parseFEN("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
  check("stalemate: no legal moves", generateLegalMoves(s, "b").length, 0);
  const r = play(parseFEN("7k/8/5QK1/8/8/8/8/8 w - - 0 1"), "f6", "f7");
  check("stalemate detected", r.state.reason, "stalemate");
  check("stalemate is a draw", r.state.winner, "draw");
}

// Back-rank mate.
{
  const r = play(parseFEN("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1"), "a1", "a8");
  check("checkmate detected", r.state.reason, "checkmate");
  check("white wins", r.state.winner, "w");
  check("move flagged checkmate", r.move.checkmate, true);
  check("SAN of mating move", r.san, "Ra8");
}

// Insufficient material after the last piece is captured.
{
  const r = play(parseFEN("8/8/4k3/8/8/3nK3/8/8 w - - 0 1"), "e3", "d3");
  check("K vs K is a draw", r.state.reason, "insufficient material");
}
{
  const r = play(parseFEN("8/8/4k3/8/8/3nK3/8/7B w - - 0 1"), "e3", "d3");
  check("K+B vs K is a draw", r.state.reason, "insufficient material");
}

// 50-move rule: halfmove clock hits 100.
{
  const s = parseFEN("7k/8/8/8/8/8/R7/6K1 w - - 99 80");
  const r = play(s, "a2", "a3");
  check("halfmove clock increments", r.state.halfMoveClock, 100);
  check("50-move rule draw", r.state.reason, "50-move rule");
}

// A pawn move resets the clock, so no 50-move draw.
{
  const r = play(parseFEN("7k/P7/8/8/8/8/8/6K1 w - - 99 80"), "a7", "a8", "Q");
  check("pawn move resets clock", r.state.halfMoveClock, 0);
}

console.log("=== SAN correctness ===");
{
  // Two knights can reach d2 -> file disambiguation required.
  const s = parseFEN("4k3/8/8/8/8/8/8/N2K1N2 w - - 0 1");
  const withFile = play(s, "a1", "b3").san;
  check("knight SAN", withFile, "Nb3");
  const s2 = parseFEN("4k3/8/8/8/8/8/8/N2K1N2 w - - 0 1");
  check("ambiguous knights disambiguate", play(s2, "f1", "e3").san, "Ne3");
}
{
  const s = parseFEN("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  check("kingside castle SAN", play(s, "e1", "g1").san, "O-O");
  check("queenside castle SAN", play(parseFEN("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "e1", "c1").san, "O-O-O");
}
{
  const s = parseFEN("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2");
  check("pawn capture SAN", play(s, "e4", "d5").san, "exd5");
}
{
  const s = parseFEN("8/P6k/8/8/8/8/8/6K1 w - - 0 1");
  check("promotion SAN", play(s, "a7", "a8", "N").san, "a8=N");
}

console.log("=== Castling rights ===");
{
  // Capturing the h1 rook must remove White's kingside rights.
  const s = parseFEN("4k3/8/8/8/8/8/7r/R3K2R b KQ - 0 1");
  const r = play(s, "h2", "h1");
  check("rights lost when rook captured", r.state.castlingRights.K, false);
  check("queenside rights kept", r.state.castlingRights.Q, true);
}
{
  // Cannot castle out of check.
  const s = parseFEN("4r3/8/8/8/8/8/8/R3K2R w KQ - 0 1");
  const castles = generateLegalMoves(s, "w").filter((m) => m.castle);
  check("no castling while in check", castles.length, 0);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
