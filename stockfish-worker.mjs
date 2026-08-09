import stockfish from "stockfish";

// Emscripten factory uses the first argument if it's an object?
// Actually we can intercept console.log
const originalLog = console.log;
console.log = function(...args) {
  if (process.send && typeof args[0] === 'string') {
    process.send(args.join(' '));
  } else {
    originalLog(...args);
  }
};

stockfish("single").then((engine) => {

  process.on("message", (msg) => {
    engine.sendCommand(msg);
  });

  // Ready signal
  if (process.send) process.send("STOCKFISH_READY");
}).catch(err => {
  console.error("Stockfish initialization failed:", err);
  process.exit(1);
});
