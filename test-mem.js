const { fork } = require('child_process');
const path = require('path');

const workerPath = path.resolve(process.cwd(), "stockfish-worker.mjs");
const worker = fork(workerPath, [], { execArgv: ["--max-old-space-size=64"] });

worker.on('message', (msg) => {
  if (msg === "STOCKFISH_READY") {
    worker.send("uci");
    worker.send("setoption name Hash value 16");
    worker.send("setoption name Threads value 1");
    worker.send("position startpos");
    worker.send("go depth 20 movetime 10000");
    console.log("Started searching...");
  } else {
    // console.log(msg);
  }
});

const interval = setInterval(() => {
  console.log("Main Memory:", process.memoryUsage().rss / 1024 / 1024, "MB");
}, 1000);

setTimeout(() => {
  worker.kill();
  clearInterval(interval);
}, 12000);
