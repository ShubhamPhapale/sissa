import { fork, ChildProcess } from "child_process";
import path from "path";

export interface StockfishAnalysis {
  bestMove: string;
  bestMoveSan?: string;
  score: number; // centipawns or mate distance
  scoreText: string;
  depth: number;
  pv: string[];
  pvSan: string[];
}

export type SanTranslator = (moves: string[]) => string[];

class StockfishSingleton {
  private static instance: StockfishSingleton;
  
  private worker: ChildProcess | null = null;
  private isProcessing = false;
  private queue: Array<{ fen: string; depth: number; skillLevel?: number; translateSan?: SanTranslator; onProgress?: (res: Partial<StockfishAnalysis>) => void; resolve: (res: StockfishAnalysis | null) => void; signal?: AbortSignal }> = [];
  
  private initPromise: Promise<void> | null = null;

  private currentResolve: ((res: StockfishAnalysis | null) => void) | null = null;
  private currentProgress: ((res: Partial<StockfishAnalysis>) => void) | null = null;
  private currentTimeout: NodeJS.Timeout | null = null;
  
  private currentAnalysis: Partial<StockfishAnalysis> = { pv: [], pvSan: [] };
  private translator: SanTranslator | null = null;
  private currentIsBlackToMove = false;

  private constructor() {}

  public static getInstance(): StockfishSingleton {
    if (!StockfishSingleton.instance) {
      StockfishSingleton.instance = new StockfishSingleton();
    }
    return StockfishSingleton.instance;
  }

  private async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolveInit) => {
      // Spawn worker process with strict memory limit to avoid 512MB RAM cap on Render free tier
      const workerPath = path.resolve(process.cwd(), "stockfish-worker.mjs");
      const forkFn = eval('require("child_process").fork');
      this.worker = forkFn(workerPath, [], {
        execArgv: ["--max-old-space-size=64"],
      });

      this.worker!.on("message", (msg: string) => {
        if (msg === "STOCKFISH_READY") {
          this.worker!.send("uci");
          this.worker!.send("setoption name Hash value 16"); // Explicitly limit RAM to 16MB
          this.worker!.send("setoption name Threads value 1"); // Ensure single threaded
          this.worker!.send("setoption name MultiPV value 1");
          this.worker!.send("setoption name UCI_ShowWDL value true");
          this.worker!.send("isready");
          resolveInit();
        } else {
          this.handleEngineMessage(msg);
        }
      });
      
      this.worker!.on("error", (err) => {
        console.error("Stockfish worker error:", err);
      });
      
      this.worker!.on("exit", (code) => {
        if (code !== 0) console.error("Stockfish worker exited with code", code);
        this.worker = null;
        this.initPromise = null;
        // clear current
        if (this.currentResolve) {
          this.currentResolve(null);
          this.currentResolve = null;
        }
      });
    });

    return this.initPromise;
  }

  private handleEngineMessage(line: string) {
    if (!this.currentResolve) return;

    if (line.startsWith("info depth")) {
      const depthMatch = line.match(/depth (\d+)/);
      if (depthMatch) this.currentAnalysis.depth = parseInt(depthMatch[1], 10);

      const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
      if (scoreMatch) {
        const type = scoreMatch[1];
        let val = parseInt(scoreMatch[2], 10);
        
        // Stockfish outputs score from the perspective of the side to move.
        // We always want the score from White's perspective (positive = White winning).
        if (this.currentIsBlackToMove) {
          val = -val;
        }

        if (type === "cp") {
          this.currentAnalysis.score = val;
          // Force sign character for positive if we want, but let's just use normal numbers
          this.currentAnalysis.scoreText = (val > 0 ? "+" : "") + (val / 100).toFixed(2);
        } else {
          this.currentAnalysis.score = val > 0 ? 10000 - val : -10000 - val;
          // Mate in X: #X for white winning, -#X for black winning
          this.currentAnalysis.scoreText = val > 0 ? `#${val}` : `-#${Math.abs(val)}`;
        }
      }

      const pvMatch = line.match(/ pv (.+)$/);
      if (pvMatch) {
        const pvs = pvMatch[1].split(" ");
        this.currentAnalysis.pv = pvs;
        if (this.translator) {
          try {
            this.currentAnalysis.pvSan = this.translator(pvs);
            this.currentAnalysis.bestMoveSan = this.currentAnalysis.pvSan[0];
          } catch {
            this.currentAnalysis.pvSan = [];
            this.currentAnalysis.bestMoveSan = undefined;
          }
        }
      }

      if (this.currentProgress) {
        this.currentProgress({ ...this.currentAnalysis });
      }
    } else if (line.startsWith("bestmove")) {
      const match = line.match(/bestmove ([a-h1-8qrbn]+)/);
      if (match) {
        this.currentAnalysis.bestMove = match[1];
        if (!this.currentAnalysis.bestMoveSan && this.translator) {
          try {
            this.currentAnalysis.bestMoveSan = this.translator([match[1]])[0];
          } catch {
            // ignore
          }
        }
      }

      const result = {
        bestMove: this.currentAnalysis.bestMove || "unknown",
        bestMoveSan: this.currentAnalysis.bestMoveSan,
        score: this.currentAnalysis.score || 0,
        scoreText: this.currentAnalysis.scoreText || "0.00",
        depth: this.currentAnalysis.depth || 0,
        pv: this.currentAnalysis.pv || [],
        pvSan: this.currentAnalysis.pvSan || [],
      };

      this.currentResolve(result as StockfishAnalysis);
      this.currentResolve = null;
      if (this.currentTimeout) clearTimeout(this.currentTimeout);
      this.currentTimeout = null;

      this.isProcessing = false;
      this.processQueue();
    }
  }

  public async analyzePosition(
    fen: string,
    depth: number = 20,
    skillLevel: number = 20,
    translateSan?: SanTranslator,
    onProgress?: (info: Partial<StockfishAnalysis>) => void,
    signal?: AbortSignal
  ): Promise<StockfishAnalysis | null> {
    // Only used directly inside the file anyway.

    return new Promise((resolve) => {
      if (signal?.aborted) {
        return resolve(null);
      }

      this.queue.push({ fen, depth, skillLevel, translateSan, onProgress, resolve, signal });
      
      if (signal) {
        signal.addEventListener("abort", () => {
          const idx = this.queue.findIndex(item => item.resolve === resolve);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            resolve(null);
          } else if (this.currentResolve === resolve) {
            this.worker?.send("stop");
            resolve(null);
            this.currentResolve = null;
            this.currentProgress = null;
            // DO NOT set isProcessing=false or processQueue() here!
            // Wait for the worker to send 'bestmove' in response to 'stop',
            // which will trigger the next item in the queue.
          }
        });
      }

      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  private async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const item = this.queue.shift()!;
    this.currentResolve = item.resolve;
    this.currentProgress = item.onProgress ?? null;
    this.translator = item.translateSan ?? null;
    this.currentAnalysis = { pv: [], pvSan: [] };
    this.currentIsBlackToMove = item.fen.includes(" b ");

    try {
      await this.initialize();
      
      if (!this.worker) {
        throw new Error("Engine process not available");
      }

      const skillLevel = (item as any).skillLevel ?? 20;
      this.worker.send(`setoption name Skill Level value ${skillLevel}`);
      this.worker.send(`position fen ${item.fen}`);
      // Add movetime to ensure the engine always terminates eventually, 
      // preventing the WASM event loop from blocking indefinitely.
      this.worker.send(`go depth ${item.depth} movetime 2000`);

      // Allow 2.5 seconds maximum for a deeper search
      this.currentTimeout = setTimeout(() => {
        if (this.currentResolve) {
          this.worker?.send("stop");
          // wait for bestmove to trigger resolve
        }
      }, 2500);
      
    } catch (err) {
      console.error("Error starting analysis", err);
      if (this.currentResolve) {
        this.currentResolve(null);
        this.currentResolve = null;
      }
      this.isProcessing = false;
      this.processQueue();
    }
  }
}

export async function analyzePosition(
  fen: string,
  depth: number = 20,
  skillLevel: number = 20,
  translateSan?: SanTranslator,
  onProgress?: (info: Partial<StockfishAnalysis>) => void,
  signal?: AbortSignal
): Promise<StockfishAnalysis | null> {
  const instance = StockfishSingleton.getInstance();
  return instance.analyzePosition(fen, depth, skillLevel, translateSan, onProgress, signal);
}
