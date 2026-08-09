import { createRequire } from "module";
const require = createRequire(import.meta.url);
const stockfish = require("stockfish");

const originalLog = console.log;
console.log = function(...args) {
  if (process.send && typeof args[0] === 'string') {
    process.send(args.join(' '));
  } else {
    originalLog(...args);
  }
};

stockfish("lite-single").then((engine) => {
  process.on("message", (msg) => {
    engine.sendCommand(msg);
  });
  if (process.send) process.send("STOCKFISH_READY");
}).catch(err => {
  console.error("Stockfish initialization failed:", err);
  process.exit(1);
});
