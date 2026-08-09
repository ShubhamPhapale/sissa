"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import QRCode from "react-qr-code";
import Header from "@/components/Header";
import ChessBoard from "@/components/ChessBoard";
import GameTimer from "@/components/GameTimer";
import MoveHistory from "@/components/MoveHistory";
import GameControls from "@/components/GameControls";
import GameOverDialog from "@/components/GameOverDialog";
import GameAnalysis from "@/components/GameAnalysis";
import type { GameAnalysisResult } from "@/lib/game-analysis-types";
import {
  createInitialState,
  parseFEN,
  makeMove,
  generateLegalMoves,
  stateToFEN,
  algebraicToSquare,
  squareToAlgebraic,
  type GameState,
  type Move,
} from "@/lib/chess-engine";
import { PIECE_VALUES, formatTime } from "@/lib/utils";
import type { StockfishAnalysis } from "@/lib/stockfish-analysis";

interface ApiMove {
  id: number;
  moveNumber: number;
  san: string;
  from: string;
  to: string;
  piece: string;
  captured: string | null;
  promotion: string | null;
  check: boolean;
  checkmate: boolean;
  castle: string | null;
  enPassant: boolean;
}

interface ApiGame {
  id: string;
  whitePlayerName: string | null;
  blackPlayerName: string | null;
  status: string;
  winner: string | null;
  endReason: string | null;
  drawOfferedBy: string | null;
  fen: string;
  pgn: string;
  timeControl: number;
  increment: number;
  whiteTimeRemaining: number;
  blackTimeRemaining: number;
  turn: "w" | "b";
  serverTime: number;
}

interface ApiPlayers {
  white: { username: string; rating: number } | null;
  black: { username: string; rating: number } | null;
}

/** Replays the move list from the start to reconstruct any past position. */
function replayTo(moveList: ApiMove[], ply: number): GameState {
  let state = createInitialState();
  for (let i = 0; i < ply && i < moveList.length; i++) {
    const m = moveList[i];
    const from = algebraicToSquare(m.from);
    const to = algebraicToSquare(m.to);
    const legal = generateLegalMoves(state, state.turn);
    const found = legal.find(
      (c) =>
        c.from.row === from.row &&
        c.from.col === from.col &&
        c.to.row === to.row &&
        c.to.col === to.col &&
        (m.promotion ? c.promotion === m.promotion : !c.promotion)
    );
    if (!found) break;
    state = makeMove(state, found);
  }
  return state;
}

export default function GameClient() {
  const router = useRouter();
  const routeParams = useParams<{ gameId: string }>();
  const searchParams = useSearchParams();
  const gameId = routeParams?.gameId ?? "";

  const playerParam = searchParams.get("player");
  const myColor: "w" | "b" | null =
    playerParam === "1" || playerParam === "w" ? "w" : playerParam === "2" || playerParam === "b" ? "b" : null;
  const isSpectator = myColor === null;

  const [game, setGame] = useState<ApiGame | null>(null);
  const [players, setPlayers] = useState<ApiPlayers>({ white: null, black: null });
  const [moves, setMoves] = useState<ApiMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  // Optimistic position shown immediately after the local player moves.
  const [optimistic, setOptimistic] = useState<{ state: GameState; plies: number } | null>(null);

  const [clocks, setClocks] = useState({ white: 0, black: 0 });
  const [clockSnapshot, setClockSnapshot] = useState<{
    white: number;
    black: number;
    turn: "w" | "b";
    serverTime: number;
  } | null>(null);
  const [analysis, setAnalysis] = useState<StockfishAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisDepth, setAnalysisDepth] = useState(20);
  const [fullGameAnalysis, setFullGameAnalysis] = useState<GameAnalysisResult | null>(null);
  const inFlight = useRef(false);
  const mutationInFlight = useRef(false);

  const evalHeight = useMemo(() => {
    if (!analysis || !analysis.scoreText) return "50%";
    if (analysis.scoreText.startsWith("-#")) return "0%";
    if (analysis.scoreText.startsWith("#")) return "100%";
    const score = Number(analysis.scoreText);
    if (!Number.isFinite(score)) return "50%";
    // Scale where +10 is 100%, 0 is 50%, -10 is 0%.
    return `${Math.max(0, Math.min(100, 50 + score * 5))}%`;
  }, [analysis]);

  const applyPayload = useCallback(
    (payloadGame: ApiGame, payloadMoves?: ApiMove[], payloadPlayers?: ApiPlayers) => {
      setGame(payloadGame);
      if (payloadMoves) setMoves(payloadMoves);
      if (payloadPlayers) setPlayers(payloadPlayers);
      setClockSnapshot({
        white: payloadGame.whiteTimeRemaining,
        black: payloadGame.blackTimeRemaining,
        turn: payloadGame.turn,
        serverTime: payloadGame.serverTime ?? Date.now(),
      });
      setOptimistic((prev) => {
        if (!prev) return null;
        const serverPlies = payloadMoves?.length ?? 0;
        return serverPlies >= prev.plies ? null : prev;
      });
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!gameId || inFlight.current || mutationInFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/games/${gameId}`, { cache: "no-store" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      if (data.game) applyPayload(data.game, data.moves, data.players);
    } catch {
      /* transient network error — the next poll will recover */
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [gameId, applyPayload]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const isLive = game?.status === "playing";

  // Listen for real-time updates via Server-Sent Events (SSE).
  useEffect(() => {
    if (!isLive) return;
    const evtSource = new EventSource(`/api/games/${gameId}/stream`);
    
    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.game) applyPayload(data.game, data.moves, data.players);
      } catch (e) {
        console.error("Error parsing SSE data:", e);
      }
    };

    return () => evtSource.close();
  }, [isLive, gameId, applyPayload]);

  // Derive the current clock from the last server snapshot so the timer does not drift.
  useEffect(() => {
    if (!isLive || !clockSnapshot) return;
    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - clockSnapshot.serverTime) / 1000));
      setClocks({
        white:
          clockSnapshot.turn === "w"
            ? Math.max(0, clockSnapshot.white - elapsed)
            : clockSnapshot.white,
        black:
          clockSnapshot.turn === "b"
            ? Math.max(0, clockSnapshot.black - elapsed)
            : clockSnapshot.black,
      });
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [isLive, clockSnapshot]);

  // When a flag falls locally, ask the server to confirm and record it.
  useEffect(() => {
    if (!game || game.status !== "playing") return;
    const flagged = game.turn === "w" ? clocks.white <= 0 : clocks.black <= 0;
    if (!flagged) return;
    fetch(`/api/games/${gameId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim-timeout", color: myColor ?? "w" }),
    })
      .then((r) => r.json())
      .then((d) => d?.game && applyPayload(d.game))
      .catch(() => {});
  }, [clocks.white, clocks.black, game, gameId, myColor, applyPayload]);

  const liveState = useMemo<GameState>(
    () => (game ? parseFEN(game.fen) : createInitialState()),
    [game?.fen, game]
  );

  const displayState = useMemo<GameState>(() => {
    if (optimistic) {
      return optimistic.state;
    }
    if (viewPly !== null) return replayTo(moves, viewPly + 1);
    return liveState;
  }, [viewPly, moves, optimistic, liveState]);

  const displayFen = useMemo(() => stateToFEN(displayState), [displayState]);

  useEffect(() => {
    if (!game) return;
    if (game.status === "playing") {
      setAnalysis(null);
      setAnalysisError(null);
      return;
    }

    let cancelled = false;
    setAnalysisLoading(true);
    setAnalysisError(null);

    let eventSource: EventSource | null = null;
    const timeout = window.setTimeout(() => {
      eventSource = new EventSource(`/api/analysis/stream?fen=${encodeURIComponent(displayFen)}&depth=${analysisDepth}`);
      eventSource.onmessage = (e) => {
        if (cancelled) {
          eventSource?.close();
          return;
        }
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'progress' || data.type === 'done') {
            setAnalysis((prev) => ({ ...prev, ...data } as StockfishAnalysis));
            if (data.type === 'done') {
              setAnalysisLoading(false);
              eventSource?.close();
            }
          }
        } catch {
          // ignore parse errors
        }
      };
      eventSource.onerror = () => {
        if (cancelled) return;
        setAnalysisError("Analysis unavailable");
        setAnalysisLoading(false);
        eventSource?.close();
      };
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      eventSource?.close();
    };
  }, [displayFen, gameId, viewPly, analysisDepth]);

  const isLiveView = viewPly === null;
  const gameActive = game?.status === "playing";
  const gameOver = game?.status === "finished";
  const isMyTurn = Boolean(gameActive && myColor && game?.turn === myColor && !optimistic);

  const displayMoves = useMemo(() => {
    if (optimistic) {
      return optimistic.state.moveHistory.map((m) => ({
        san: m.san ?? "",
        check: m.check,
        checkmate: m.checkmate,
      }));
    }
    return moves;
  }, [optimistic, moves]);

  const currentClassification = useMemo(() => {
    if (!fullGameAnalysis) return null;
    const ply = viewPly !== null ? viewPly : moves.length - 1;
    if (ply >= 0 && ply < fullGameAnalysis.moves.length) {
      return fullGameAnalysis.moves[ply].classification;
    }
    return null;
  }, [fullGameAnalysis, viewPly, moves.length]);

  const lastMove: Move | null = useMemo(() => {
    const idx = viewPly !== null ? viewPly : moves.length - 1;
    const m = moves[idx];
    if (!m) return null;
    return {
      from: algebraicToSquare(m.from),
      to: algebraicToSquare(m.to),
      piece: m.piece as Move["piece"],
    };
  }, [moves, viewPly]);

  const captured = useMemo(() => {
    const byWhite: string[] = [];
    const byBlack: string[] = [];
    const upto = viewPly !== null ? viewPly + 1 : moves.length;
    for (let i = 0; i < upto && i < moves.length; i++) {
      const c = moves[i].captured;
      if (!c) continue;
      if (c === c.toUpperCase()) byBlack.push(c);
      else byWhite.push(c);
    }
    const score = (arr: string[]) => arr.reduce((s, p) => s + (PIECE_VALUES[p] ?? 0), 0);
    const diff = score(byWhite) - score(byBlack);
    return { byWhite, byBlack, whiteAdv: Math.max(0, diff), blackAdv: Math.max(0, -diff) };
  }, [moves, viewPly]);

  const handleMove = useCallback(
    async (move: Move) => {
      if (!game || busy) return;

      // Allow exploratory moves locally when the game is finished
      if (game.status === "finished") {
        const optimisticState = makeMove(displayState, move);
        setOptimistic({ state: optimisticState, plies: (optimistic?.plies ?? (viewPly !== null ? viewPly + 1 : moves.length)) + 1 });
        return;
      }

      if (!myColor || !gameActive || game.turn !== myColor) return;

      // Show the move instantly, then reconcile with the server's answer.
      const optimisticState = makeMove(liveState, move);
      setOptimistic({ state: optimisticState, plies: moves.length + 1 });
      setViewPly(null);
      setClockSnapshot((prev) => {
        if (!prev) return prev;
        const elapsed = Math.max(0, Math.floor((Date.now() - prev.serverTime) / 1000));
        const moverColor = prev.turn;
        const updatedMover = Math.max(0, (moverColor === "w" ? prev.white : prev.black) - elapsed);
        const nextTurn: "w" | "b" = moverColor === "w" ? "b" : "w";
        return {
          white: moverColor === "w" ? updatedMover + game.increment : prev.white,
          black: moverColor === "b" ? updatedMover + game.increment : prev.black,
          turn: nextTurn,
          serverTime: Date.now(),
        };
      });
      mutationInFlight.current = true;
      setBusy(true);
      setError(null);

      try {
        const res = await fetch(`/api/games/${gameId}/moves`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: squareToAlgebraic(move.from),
            to: squareToAlgebraic(move.to),
            promotion: move.promotion,
            playerColor: myColor,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Move rejected");
          setOptimistic(null);
          if (data.game) applyPayload(data.game);
          await refresh();
          return;
        }
        applyPayload(data.game, data.moves);
      } catch {
        setError("Network error — retrying");
        setOptimistic(null);
        await refresh();
      } finally {
        mutationInFlight.current = false;
        setBusy(false);
      }
    },
    [game, myColor, gameActive, busy, liveState, moves.length, gameId, applyPayload, refresh]
  );

  const doAction = useCallback(
    async (action: string) => {
      if (!gameId || !myColor) return;
      mutationInFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/games/${gameId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, color: myColor }),
        });
        const data = await res.json();
        if (!res.ok) setError(data.error ?? "Action failed");
        if (data.game) applyPayload(data.game);
      } catch {
        setError("Network error");
      } finally {
        mutationInFlight.current = false;
        setBusy(false);
      }
    },
    [gameId, myColor, applyPayload]
  );

  const rematch = useCallback(async () => {
    if (!game) return;
    setBusy(true);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Colours swap for the rematch, as they do on Lichess.
          whitePlayerName: game.blackPlayerName,
          blackPlayerName: game.whitePlayerName,
          timeControl: game.timeControl,
          increment: game.increment,
        }),
      });
      const data = await res.json();
      if (data.game) router.push(`/game/${data.game.id}?player=${myColor === "w" ? "2" : "1"}`);
    } finally {
      setBusy(false);
    }
  }, [game, router, myColor]);

  const copyInvite = () => {
    const opponent = myColor === "w" ? "2" : "1";
    const url = `${origin || window.location.origin}/game/${gameId}?player=${opponent}`;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setViewPly((p) => {
          const cur = p === null ? moves.length - 1 : p;
          return Math.max(-1, cur - 1) < 0 ? null : cur - 1;
        });
        setOptimistic(null);
      } else if (e.key === "ArrowRight") {
        setViewPly((p) => {
          if (p === null) return null;
          return p + 1 >= moves.length - 1 ? null : p + 1;
        });
        setOptimistic(null);
      } else if (e.key === "f") {
        setBoardFlipped((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moves.length]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-[var(--text-secondary)]">Loading game…</p>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !game) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="mt-4 text-xl font-bold">Game not found</h2>
            <p className="mt-2 text-[var(--text-secondary)]">
              No game exists with id <span className="font-mono">{gameId}</span>.
            </p>
            <button onClick={() => router.push("/")} className="btn btn-primary mt-6">
              Back to lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  const topColor: "w" | "b" = (myColor === "b") !== boardFlipped ? "w" : "b";
  const bottomColor: "w" | "b" = topColor === "w" ? "b" : "w";

  const nameFor = (c: "w" | "b") =>
    (c === "w" ? game.whitePlayerName : game.blackPlayerName) || (c === "w" ? "White" : "Black");
  const ratingFor = (c: "w" | "b") => (c === "w" ? players.white?.rating : players.black?.rating);
  const clockFor = (c: "w" | "b") => (c === "w" ? clocks.white : clocks.black);
  const capturedFor = (c: "w" | "b") => (c === "w" ? captured.byWhite : captured.byBlack);
  const advFor = (c: "w" | "b") => (c === "w" ? captured.whiteAdv : captured.blackAdv);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 p-4">
        <div className="mx-auto max-w-6xl">
          {/* Status bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
              <div className="flex items-center gap-3">
              <span className={`badge ${gameActive ? "badge-green" : "badge-blue"}`}>
                {gameActive ? "Live" : "Finished"}
              </span>
              {gameActive && (
                <span className="text-xs text-[var(--text-muted)]">
                  {formatTime(game.timeControl)}
                  {game.increment > 0 ? ` +${game.increment}` : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {gameActive && !isSpectator && (
                <button onClick={copyInvite} className="btn btn-secondary text-xs">
                  {copied ? "Copied" : "Invite opponent"}
                </button>
              )}
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                {isSpectator ? "Spectator" : myColor === "w" ? "White" : "Black"}
              </span>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-900/30 border border-red-700/40 text-sm text-red-300 slide-in text-center">
              {error}
            </div>
          )}

          {gameActive && !isSpectator && origin && moves.length === 0 && !(game.whitePlayerName && game.blackPlayerName) && (
            <div className="card mb-4 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                    Invite your friend
                  </h3>
                  <p className="max-w-xl text-sm text-[var(--text-secondary)]">
                    Share this link or scan the QR code on a phone to join as the other side.
                  </p>
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-[var(--text-primary)] break-all">
                    {`${origin}/game/${gameId}?player=${myColor === "w" ? "2" : "1"}`}
                  </div>
                </div>
                <div className="rounded-2xl bg-white p-3">
                  <QRCode
                    value={`${origin}/game/${gameId}?player=${myColor === "w" ? "2" : "1"}`}
                    size={128}
                    fgColor="#0f172a"
                    bgColor="#ffffff"
                  />
                </div>
              </div>
            </div>
          )}

          {!isLiveView && (
            <div className="mb-4 p-3 rounded-xl bg-yellow-900/20 border border-yellow-700/40 text-sm flex items-center justify-between">
              <span className="font-medium text-yellow-500">
                {optimistic ? "Exploring variations" : `Reviewing move ${viewPly! + 1} of ${moves.length}`}
              </span>
              <button onClick={() => { setViewPly(null); setOptimistic(null); }} className="btn btn-secondary text-xs">
                Return to live
              </button>
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 lg:items-start lg:justify-center">
            {/* Left column */}
            <div className="w-full max-w-[280px] flex flex-col gap-6 shrink-0 order-2 lg:order-1">
              <GameControls
                onResign={() => doAction("resign")}
                onOfferDraw={() => doAction("offer-draw")}
                onAcceptDraw={() => doAction("accept-draw")}
                onDeclineDraw={() => doAction("decline-draw")}
                onFlipBoard={() => setBoardFlipped((f) => !f)}
                isPlayerTurn={isMyTurn}
                isSpectator={isSpectator}
                gameActive={Boolean(gameActive)}
                drawOfferedBy={game.drawOfferedBy}
                myColor={myColor}
                busy={busy}
              />
            </div>

            {/* Board */}
            <div className="flex-1 w-full max-w-[680px] flex flex-col items-center order-1 lg:order-2">
              <div className="w-full relative flex flex-col gap-2">
                <GameTimer
                  seconds={clockFor(topColor)}
                  totalSeconds={game.timeControl}
                  isActive={gameActive && game.turn === topColor}
                  playerColor={topColor}
                  playerName={nameFor(topColor)}
                  rating={ratingFor(topColor)}
                  isYou={myColor === topColor}
                  captured={capturedFor(topColor)}
                  materialDiff={advFor(topColor)}
                />
                <div className="flex flex-row items-stretch gap-2 w-full">
                  <div className="w-4 rounded bg-[#333] overflow-hidden flex flex-col-reverse shadow-inner shrink-0 relative">
                    <div 
                      className="w-full bg-[#f0f0f0] transition-all duration-500 ease-out absolute bottom-0"
                      style={{ height: evalHeight }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <ChessBoard
                      gameState={displayState}
                      playerColor={myColor ?? "w"}
                      onMove={handleMove}
                      lastMove={lastMove}
                      boardFlipped={boardFlipped}
                      interactive={Boolean((isMyTurn && isLiveView && !isSpectator) || gameOver)}
                      allowBothColors={gameOver}
                      lastMoveClassification={currentClassification}
                    />
                  </div>
                </div>
                <GameTimer
                  seconds={clockFor(bottomColor)}
                  totalSeconds={game.timeControl}
                  isActive={gameActive && game.turn === bottomColor}
                  playerColor={bottomColor}
                  playerName={nameFor(bottomColor)}
                  rating={ratingFor(bottomColor)}
                  isYou={myColor === bottomColor}
                  captured={capturedFor(bottomColor)}
                  materialDiff={advFor(bottomColor)}
                />

                {gameOver && game.winner && (
                  <GameOverDialog
                    winner={game.winner as "w" | "b" | "draw"}
                    reason={game.endReason ?? "unknown"}
                    whiteName={nameFor("w")}
                    blackName={nameFor("b")}
                    myColor={myColor}
                    onRematch={isSpectator ? undefined : rematch}
                    onReview={() => setViewPly(Math.max(0, moves.length - 1))}
                  />
                )}

              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => { setViewPly(0); setOptimistic(null); }}
                  disabled={moves.length === 0}
                  className="btn btn-secondary text-xs disabled:opacity-40 px-3"
                >
                  First
                </button>
                <button
                  onClick={() => {
                    if (optimistic) {
                      const newPlies = optimistic.plies - 1;
                      if (newPlies <= moves.length) {
                        setOptimistic(null);
                        setViewPly(Math.max(0, newPlies - 1));
                      } else {
                        setOptimistic({ ...optimistic, plies: newPlies });
                      }
                    } else {
                      setViewPly((p) => {
                        const cur = p === null ? moves.length - 1 : p;
                        return Math.max(0, cur - 1);
                      });
                    }
                  }}
                  disabled={displayMoves.length === 0}
                  className="btn btn-secondary text-xs disabled:opacity-40 px-4"
                >
                  Prev
                </button>
                <button
                  onClick={() => {
                    if (optimistic) {
                      const newPlies = Math.min(optimistic.plies + 1, optimistic.state.moveHistory.length);
                      setOptimistic({ ...optimistic, plies: newPlies });
                    } else {
                      setViewPly((p) => (p === null || p + 1 >= moves.length - 1 ? null : p + 1));
                    }
                  }}
                  disabled={Boolean((isLiveView && !optimistic) || (optimistic && optimistic.plies === optimistic.state.moveHistory.length))}
                  className="btn btn-secondary text-xs disabled:opacity-40 px-4"
                >
                  Next
                </button>
                <button
                  onClick={() => { setViewPly(null); setOptimistic(null); }}
                  disabled={isLiveView && !optimistic}
                  className="btn btn-secondary text-xs disabled:opacity-40 px-3"
                >
                  Last
                </button>
              </div>
            </div>

            {/* Right column */}
            <div className="w-full max-w-[320px] flex flex-col gap-4 shrink-0 lg:sticky lg:top-4 order-3">
              <MoveHistory
                moves={displayMoves.map((m) => ({ san: m.san, check: m.check, checkmate: m.checkmate }))}
                activeMoveIndex={optimistic?.plies != null ? optimistic.plies - 1 : (viewPly ?? moves.length - 1)}
                onMoveClick={(i) => { 
                  if (i < moves.length) {
                    setViewPly(i === moves.length - 1 ? null : i); 
                    setOptimistic(null); 
                  } else {
                    setOptimistic(prev => prev ? { ...prev, plies: i + 1 } : null);
                  }
                }}
              />

              {gameOver && moves.length > 0 && (
                <GameAnalysis
                  gameId={gameId}
                  moves={displayMoves.map((m) => ({ san: m.san, check: m.check, checkmate: m.checkmate }))}
                  onMoveClick={(ply) => { setViewPly(ply === displayMoves.length - 1 ? null : ply); setOptimistic(null); }}
                  activePly={optimistic?.plies != null ? optimistic.plies - 1 : (viewPly ?? moves.length - 1)}
                  onAnalysisComplete={setFullGameAnalysis}
                  initialAnalysis={(game as any).analysis}
                />
              )}

              <div className="card p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                    Stockfish
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {analysisLoading ? "Analyzing" : analysis?.depth ? `Depth ${analysis.depth}` : "Idle"}
                    </span>
                    {analysisDepth < 99 && (
                      <button 
                        onClick={() => setAnalysisDepth(d => Math.min(99, d + 10))}
                        title="Increase depth by 10"
                        className="flex items-center justify-center w-4 h-4 rounded bg-white/10 text-white hover:bg-[var(--accent)] transition-colors text-[10px]"
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>

                {analysisError ? (
                  <p className="text-sm text-[var(--text-secondary)]">{analysisError}</p>
                ) : analysis ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-white/8 bg-black/20 p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">Eval</span>
                        <span className="font-semibold text-[var(--text-primary)]">{analysis.scoreText}</span>
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">
                        Best line
                      </p>
                      <p className="text-sm text-[var(--text-primary)]">
                        {analysis.bestMoveSan ?? analysis.bestMove ?? "Calculating..."}
                      </p>
                      {((analysis.pvSan?.length > 0 ? analysis.pvSan : analysis.pv) || []).length > 0 && (
                        <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                          {(analysis.pvSan?.length > 0 ? analysis.pvSan : analysis.pv).slice(1).join(" ")}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">
                    {analysisLoading ? "Analyzing current position…" : "Waiting for engine data…"}
                  </p>
                )}
              </div>

              <div className="card p-3">
                <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  Game info
                </h4>
                <div className="space-y-1.5 text-sm">
                  <Row label="Time" value={`${formatTime(game.timeControl)}${game.increment ? ` +${game.increment}` : ""}`} />
                  <Row label="Moves" value={String(Math.ceil(moves.length / 2))} />
                  <Row label="Turn" value={game.turn === "w" ? "White" : "Black"} />
                  <Row
                    label="Result"
                    value={
                      gameOver
                        ? game.winner === "draw"
                          ? "½–½"
                          : game.winner === "w"
                          ? "1–0"
                          : "0–1"
                        : "*"
                    }
                  />
                </div>
              </div>

              {game.pgn && (
                <div className="card p-3">
                  <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
                    PGN
                  </h4>
                  <p className="text-xs font-mono break-words max-h-24 overflow-y-auto text-[var(--text-secondary)]">
                    {game.pgn}
                  </p>
                  <button
                    onClick={() => navigator.clipboard?.writeText(game.pgn)}
                    className="btn btn-secondary text-xs w-full mt-2"
                  >
                    Copy PGN
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span>{value}</span>
    </div>
  );
}
