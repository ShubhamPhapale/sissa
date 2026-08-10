import { applyMoveFromRecord } from "../src/lib/game-analysis.js";
import { getMaterialBalance, stateToFEN, getAllLegalMoves, applyMove } from "../src/lib/chess-engine.js";
import { parsePGN, squareToAlgebraic, createInitialState } from '../src/lib/chess-engine.js';

const pgn = `1. e4 e5 2. Bc4 Nf6 3. Nf3 Nxe4 4. Nxe5 d5 5. Qf3`;

function main() {
  const { moves } = parsePGN(pgn);
  const moveList = moves.map(m => ({
    san: m.san,
    from: squareToAlgebraic(m.from),
    to: squareToAlgebraic(m.to),
    promotion: m.promotion || null
  }));
  
  let state = createInitialState();
  for (let i = 0; i < 8; i++) {
    state = applyMoveFromRecord(state, moveList[i]);
  }
  
  // Before Qf3
  const isWhite = true;
  const matBefore = getMaterialBalance(state.board);
  const ourMatBefore = matBefore.w - matBefore.b;
  
  const stateForOpponentBefore = { ...state, turn: "b" as const };
  const oppLegalsBefore = getAllLegalMoves(stateForOpponentBefore);
  let materialLossBefore = 0;
  for (const oppMove of oppLegalsBefore) {
    if (stateForOpponentBefore.board[oppMove.to.row][oppMove.to.col] !== null || oppMove.enPassant) {
      const testState = applyMove(stateForOpponentBefore, oppMove);
      const testMat = getMaterialBalance(testState.board);
      const ourTestMat = testMat.w - testMat.b;
      const loss = ourMatBefore - ourTestMat;
      if (loss > materialLossBefore) {
        materialLossBefore = loss;
      }
    }
  }
  console.log("materialLossBefore:", materialLossBefore);
  
  const stateBeforeOurMove = state;
  const nextState = applyMoveFromRecord(state, moveList[8]);
  state = nextState;
  
  const oppLegalsAfter = getAllLegalMoves(state);
  let materialLossAfter = 0;
  let capturedPieceWeJustMoved = false;

  const legalsBeforeOurMove = getAllLegalMoves(stateBeforeOurMove);
  const moveWeJustPlayed = legalsBeforeOurMove.find(m => m.san === moveList[8].san);
  
  for (const oppMove of oppLegalsAfter) {
    if (state.board[oppMove.to.row][oppMove.to.col] !== null || oppMove.enPassant) {
      const testState = applyMove(state, oppMove);
      const testMat = getMaterialBalance(testState.board);
      const ourTestMat = testMat.w - testMat.b;
      const loss = ourMatBefore - ourTestMat;
      
      if (loss > materialLossAfter) {
        materialLossAfter = loss;
      }

      if (loss >= 2 && moveWeJustPlayed && oppMove.to.row === moveWeJustPlayed.to.row && oppMove.to.col === moveWeJustPlayed.to.col) {
        capturedPieceWeJustMoved = true;
      }
    }
  }
  
  console.log("materialLossAfter:", materialLossAfter);
  console.log("capturedPieceWeJustMoved:", capturedPieceWeJustMoved);
  console.log("isSacrifice:", materialLossAfter >= 2 && (capturedPieceWeJustMoved || materialLossAfter > materialLossBefore));
}
main();
