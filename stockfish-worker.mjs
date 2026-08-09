import { parentPort } from "worker_threads";
import stockfish from "stockfish";

const originalLog = console.log;
console.log = function(...args) {
  if (parentPort && typeof args[0] === 'string') {
    parentPort.postMessage(args.join(' '));
  } else {
    originalLog(...args);
  }
};

stockfish("single").then((engine) => {
  parentPort.on("message", (msg) => {
    engine.sendCommand(msg);
  });
  parentPort.postMessage("STOCKFISH_READY");
}).catch(err => {
  console.error("Stockfish initialization failed:", err);
  process.exit(1);
});
