declare module "stockfish" {
  type Engine = {
    listener?: (message: string) => void;
    sendCommand: (command: string) => void;
    terminate?: () => void;
  };

  export default function initStockfish(enginePath?: string): Promise<Engine>;
}
