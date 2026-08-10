import { analyzePosition } from '../src/lib/stockfish-analysis.js';

async function main() {
  const start = Date.now();
  console.log("Analyzing...");
  const res = await analyzePosition("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 14, 20, undefined, undefined, undefined, 0, 2);
  console.log("Done in", Date.now() - start, "ms");
  console.log(res?.scoreText);
}

main().catch(console.error);
