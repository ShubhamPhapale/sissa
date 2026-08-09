import { parseFEN, stateToFEN, makeMove, algebraicToSquare } from "./src/lib/chess-engine.ts";

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
let state = parseFEN(INITIAL_FEN);
state = makeMove(state, { from: algebraicToSquare("e2"), to: algebraicToSquare("e4"), piece: "P" });
console.log(stateToFEN(state));
