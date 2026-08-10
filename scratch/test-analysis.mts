import { analyzeGame } from '../src/lib/game-analysis.js';
import { parsePGN, squareToAlgebraic } from '../src/lib/chess-engine.js';

const pgn = `1. e4 e5 2. Bc4 Nf6 3. Nf3 Nxe4 4. Nxe5 d5 5. Qf3 f6 6. Qh5+ g6 7. Nxg6 hxg6 8. Qxg6+ Ke7 9. b3 dxc4 10. Qxe4+ Kf7 11. Qxc4+ Be6 12. Qe2 Qd7 13. Nc3 Nc6 14. Bb2 Nd4 15. Qd3 Bf5 16. Ne4 Re8 17. Qc4+ Kg6 18. d3 Bxe4 19. dxe4 Rxe4+ 20. Kf1 Qc6 21. Qxc6 Nxc6 22. Rd1 Bd6 23. g3 Be5 24. c3 Bd6 25. f3 Re7 26. b4 Ne5 27. Kf2 Reh7 28. h4 Nc4 29. Bc1 f5 30. Rd4 Ne5 31. a3 Nd7 32. c4 Re8 33. c5 Be5 34. Rd5 Nf6 35. Rd3 Nh5 36. f4 Ba1 37. Be3 Bg7 38. Rd7 Nxg3 39. Rxc7 Nxh1+ 40. Kf3 Rxe3+ 41. Kxe3 Bd4+ 42. Kxd4 Rxc7 43. b5 Kh5 44. Kd5 Nf2 45. Kd6 Rh7 46. c6 Ne4+ 47. Kd5 bxc6+ 48. bxc6 Kg4 49. a4 Rc7 50. a5 Rc8 51. a6 Nc3+ 0-1`;

async function main() {
  const { moves } = parsePGN(pgn);
  const moveList = moves.map(m => ({
    san: m.san,
    from: squareToAlgebraic(m.from),
    to: squareToAlgebraic(m.to),
    promotion: m.promotion || null
  }));
  
  const result = await analyzeGame(moveList, (i, t) => {
    if (i % 10 === 0) console.log(i, '/', t);
  });
  
  for (let i = 0; i < result.moves.length; i++) {
    const move = moveList[i].san;
    const cl = result.moves[i].classification;
    if (cl === 'brilliant' || cl === 'great') {
      console.log(`Move ${i % 2 === 0 ? (Math.floor(i/2) + 1) + '.' : ''}${move} was marked ${cl}!`);
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));
