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
import { useAuth } from "@/components/AuthProvider";
import type { GameAnalysisResult } from "@/lib/game-analysis-types";
import { CLASSIFICATION_COLORS, CLASSIFICATION_ICONS } from "@/lib/game-analysis-types";
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
  createdAt?: string;
}

interface ApiGame {
  id: string;
  whitePlayerId: number | null;
  blackPlayerId: number | null;
  whitePlayerName: string | null;
  blackPlayerName: string | null;
  status: "waiting" | "playing" | "finished";
  winner: "w" | "b" | "draw" | null;
  endReason: string | null;
  drawOfferedBy: "w" | "b" | null;
  fen: string;
  pgn: string;
  timeControl: number;
  increment: number;
  whiteTimeRemaining: number;
  blackTimeRemaining: number;
  turn: "w" | "b";
  serverTime: number;
  createdAt?: string;
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
    let found = legal.find(
      (c) =>
        c.from.row === from.row &&
        c.from.col === from.col &&
        c.to.row === to.row &&
        c.to.col === to.col &&
        (m.promotion ? c.promotion?.toLowerCase() === m.promotion.toLowerCase() : !c.promotion)
    );
    if (!found) {
      console.warn("Move not found in legal moves! Forcing fallback:", m);
      found = {
        from,
        to,
        piece: m.piece as any,
        captured: m.captured as any,
        promotion: (m.promotion as any) || undefined,
        check: m.check,
        checkmate: m.checkmate,
        enPassant: m.enPassant,
        castle: (m.castle as any) || undefined,
      };
    }
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
  const { user, setUser } = useAuth();

  const [game, setGame] = useState<ApiGame | null>(null);

  const myColor: "w" | "b" | null = useMemo(() => {
    if (user && game) {
      if (game.whitePlayerId === user.id) return "w";
      if (game.blackPlayerId === user.id) return "b";
    }
    if (playerParam === "1" || playerParam === "w") return "w";
    if (playerParam === "2" || playerParam === "b") return "b";
    return null;
  }, [user, game, playerParam]);
  
  const isSpectator = myColor === null;

  const [players, setPlayers] = useState<ApiPlayers>({ white: null, black: null });
  const [moves, setMoves] = useState<ApiMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  
  const [replayMode, setReplayMode] = useState<"fast" | "slow" | "realtime" | null>(null);
  const [viewPly, setViewPly] = useState<number | null>(null);

  useEffect(() => {
    if (!replayMode) return;
    let timeoutId: ReturnType<typeof setTimeout>;

    const playNext = () => {
      setViewPly((p) => {
        const cur = p === null ? moves.length - 1 : p;
        if (cur + 1 >= moves.length - 1) {
          setReplayMode(null); // End of game reached
          return null;
        }

        let delay = 1000;
        if (replayMode === "fast") delay = 500;
        if (replayMode === "slow") delay = 1500;
        if (replayMode === "realtime") {
          // The delay scheduled here is how long we wait AFTER showing cur+1, BEFORE showing cur+2.
          // Therefore, the delay should be the think time for cur+2.
          if (cur + 2 < moves.length) {
            const currentMoveTime = new Date(moves[cur + 1].createdAt!).getTime();
            const nextMoveTime = new Date(moves[cur + 2].createdAt!).getTime();
            delay = Math.max(200, nextMoveTime - currentMoveTime);
          } else {
            delay = 1000;
          }
        }

        timeoutId = setTimeout(playNext, delay);
        return cur + 1;
      });
    };

    // Initial kick-off delay
    timeoutId = setTimeout(playNext, replayMode === "fast" ? 500 : 1000);

    return () => clearTimeout(timeoutId);
  }, [replayMode, moves, game?.createdAt]);

  useEffect(() => {
    if (replayMode !== null && viewPly === null) {
      setReplayMode(null);
    }
  }, [viewPly, replayMode]);

  const [boardFlipped, setBoardFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  // Optimistic position shown immediately after the local player moves.
  const [optimistic, setOptimistic] = useState<{
    basePly: number;
    variationMoves: Move[];
    plies: number;
  } | null>(null);

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
  const [engineEnabled, setEngineEnabled] = useState(false);
  const [analysisDepth, setAnalysisDepth] = useState(20);
  const [fullGameAnalysis, setFullGameAnalysis] = useState<GameAnalysisResult | null>(null);
  const inFlight = useRef(false);
  const mutationInFlight = useRef(false);

  const evalHeight = useMemo(() => {
    // 1. Live Engine Analysis takes precedence
    if (engineEnabled && analysis) {
      if (analysis.scoreText.startsWith("-#")) return "0%";
      if (analysis.scoreText.startsWith("#")) return "100%";
      const score = Number(analysis.scoreText);
      if (!Number.isFinite(score)) return "50%";
      return `${Math.max(0, Math.min(100, 50 + score * 5))}%`;
    }

    // 2. Game Review (green arrow logic)
    if (fullGameAnalysis) {
      const activePly = viewPly !== null ? viewPly : moves.length - 1;
      let cp = 0;
      let isMate = false;

      if (activePly === -1 && fullGameAnalysis.moves.length > 0) {
        cp = fullGameAnalysis.moves[0].evalBefore;
      } else if (activePly >= 0 && activePly < fullGameAnalysis.moves.length) {
        cp = fullGameAnalysis.moves[activePly].evalAfter;
        isMate = fullGameAnalysis.moves[activePly].isMate;
      }

      if (isMate) {
        return cp > 0 ? "100%" : "0%";
      }
      
      const score = cp / 100;
      return `${Math.max(0, Math.min(100, 50 + score * 5))}%`;
    }

    return "50%";
  }, [analysis, engineEnabled, fullGameAnalysis, viewPly, moves.length]);

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

  // Ask bot to move if it's their turn
  useEffect(() => {
    if (!game || game.status !== "playing") return;
    const isBotTurn = 
      (game.turn === "w" && game.whitePlayerName?.startsWith("Stockfish")) ||
      (game.turn === "b" && game.blackPlayerName?.startsWith("Stockfish"));
    
    if (isBotTurn) {
      const controller = new AbortController();
      fetch(`/api/games/${game.id}/bot-move`, { method: "POST", signal: controller.signal })
        .catch(() => {});
      return () => controller.abort();
    }
  }, [game?.id, game?.status, game?.turn, game?.fen, game?.whitePlayerName, game?.blackPlayerName]);

  const liveState = useMemo<GameState>(
    () => (game ? parseFEN(game.fen) : createInitialState()),
    [game?.fen, game]
  );

  const displayState = useMemo<GameState>(() => {
    if (optimistic) {
      const baseState = replayTo(moves, optimistic.basePly);
      let state = baseState;
      const variationPly = optimistic.plies - optimistic.basePly;
      for (let i = 0; i < variationPly && i < optimistic.variationMoves.length; i++) {
         state = makeMove(state, optimistic.variationMoves[i]);
      }
      return state;
    }
    if (viewPly !== null) return replayTo(moves, viewPly + 1);
    return liveState;
  }, [viewPly, moves, optimistic, liveState]);

  const displayFen = useMemo(() => stateToFEN(displayState), [displayState]);

  const isLiveView = viewPly === null;
  const gameActive = game?.status === "playing";
  const gameOver = game?.status === "finished";

  useEffect(() => {
    if (gameOver && user) {
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((d) => {
          if (d.user) setUser(d.user);
        });
    }
  }, [gameOver, user?.id, setUser]);

  const isMyTurn = Boolean(gameActive && myColor && game?.turn === myColor && !optimistic);

  const bestMoveArrows = useMemo(() => {
    const activePly = viewPly !== null ? viewPly : moves.length - 1;
    const arrows: Array<{ from: string; to: string; color: string }> = [];
    
    // 1. Live Engine Analysis (blue arrow)
    if (engineEnabled) {
      const liveMove = analysis?.bestMove || (analysis?.pv && analysis.pv[0]);
      if (liveMove && liveMove.length >= 4 && liveMove !== "(none)") {
        arrows.push({
          from: liveMove.substring(0, 2),
          to: liveMove.substring(2, 4),
          color: "rgba(0, 128, 255, 0.7)", // blue
        });
      }
    }

    // 2. Game Review (green arrow)
    if (fullGameAnalysis && activePly >= 0 && activePly < fullGameAnalysis.moves.length) {
      const bMove = fullGameAnalysis.moves[activePly].bestMove;
      if (bMove && bMove.length >= 4) {
        arrows.push({
          from: bMove.substring(0, 2),
          to: bMove.substring(2, 4),
          color: "rgba(102, 187, 106, 0.8)", // green
        });
      }
    }

    // Deduplicate: if blue and green point to the same move, only show green (or blue).
    // Let's filter out green if it's identical to blue, or vice versa.
    // Since blue is current turn evaluation, and green is previous turn evaluation, they rarely overlap exactly.
    const uniqueArrows = [];
    const seen = new Set();
    for (const arr of arrows) {
      const key = `${arr.from}-${arr.to}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueArrows.push(arr);
      }
    }

    return uniqueArrows.length > 0 ? uniqueArrows : null;
  }, [fullGameAnalysis, analysis, viewPly, moves.length, engineEnabled, gameOver]);

  useEffect(() => {
    if (!game) return;
    if (game.status === "playing" || !engineEnabled) {
      setAnalysis(null);
      setAnalysisError(null);
      return;
    }

    let cancelled = false;
    setAnalysis(null);
    setAnalysisLoading(true);
    setAnalysisError(null);

    let eventSource: EventSource | null = null;
    let isDone = false;
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
              isDone = true;
              setAnalysisLoading(false);
              eventSource?.close();
            }
          }
        } catch {
          // ignore parse errors
        }
      };
      eventSource.onerror = () => {
        if (cancelled || isDone) return;
        setAnalysisError("Analysis unavailable");
        setAnalysisLoading(false);
        eventSource?.close();
      };
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      eventSource?.close();
    };
  }, [displayFen, gameId, viewPly, analysisDepth, engineEnabled, game?.status]);

  const displayMoves = useMemo(() => {
    if (optimistic) {
      const baseMoves = moves.slice(0, optimistic.basePly).map(m => ({
        san: m.san,
        check: m.check,
        checkmate: m.checkmate,
        createdAt: m.createdAt,
      }));
      // Generate state to get the SANs for the variation
      let state = replayTo(moves, optimistic.basePly);
      const varMoves = optimistic.variationMoves.slice(0, optimistic.plies - optimistic.basePly).map((m) => {
        state = makeMove(state, m);
        const recorded = state.moveHistory[state.moveHistory.length - 1];
        return {
          san: recorded?.san ?? "",
          check: recorded?.check ?? false,
          checkmate: recorded?.checkmate ?? false,
          createdAt: undefined as string | undefined,
        };
      });
      return [...baseMoves, ...varMoves];
    }
    return moves.map(m => ({
      san: m.san,
      check: m.check,
      checkmate: m.checkmate,
      createdAt: m.createdAt,
    }));
  }, [optimistic, moves]);

  const currentClassification = useMemo(() => {
    if (!fullGameAnalysis) return null;
    const activePly = viewPly !== null ? viewPly : moves.length - 1;
    if (activePly >= 0 && activePly < fullGameAnalysis.moves.length) {
      return fullGameAnalysis.moves[activePly].classification;
    }
    return null;
  }, [engineEnabled, analysis, fullGameAnalysis, viewPly, moves.length]);

  const replayClocks = useMemo(() => {
    if (!game) return { white: 0, black: 0 };
    let whiteTime = game.timeControl || 600;
    let blackTime = game.timeControl || 600;

    const limit = viewPly !== null ? viewPly : moves.length - 1;
    
    for (let i = 0; i <= limit; i++) {
      const m = moves[i];
      if (!m.createdAt) continue;
      const prevTime = i === 0 && game.createdAt
        ? new Date(game.createdAt).getTime()
        : (i > 0 && moves[i-1].createdAt ? new Date(moves[i-1].createdAt!).getTime() : new Date(m.createdAt).getTime());
      
      const moveTime = Math.max(0, (new Date(m.createdAt).getTime() - prevTime) / 1000);
      
      if (i % 2 === 0) {
        whiteTime -= moveTime;
        whiteTime = Math.max(0, whiteTime) + (game.increment || 0);
      } else {
        blackTime -= moveTime;
        blackTime = Math.max(0, blackTime) + (game.increment || 0);
      }
    }
    
    return { white: Math.max(0, Math.floor(whiteTime)), black: Math.max(0, Math.floor(blackTime)) };
  }, [game, moves, viewPly]);

  const [replayTickElapsed, setReplayTickElapsed] = useState(0);

  useEffect(() => {
    if (replayMode !== "realtime") {
      setReplayTickElapsed(0);
      return;
    }
    
    const start = Date.now();
    setReplayTickElapsed(0);
    
    const tick = () => {
      setReplayTickElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [replayMode, viewPly]);

  const clockFor = (c: "w" | "b") => {
    if (isLive && viewPly === null) return c === "w" ? clocks.white : clocks.black;
    if (replayMode === "realtime" && displayState.turn === c) {
      return c === "w" ? Math.max(0, replayClocks.white - replayTickElapsed) : Math.max(0, replayClocks.black - replayTickElapsed);
    }
    return c === "w" ? replayClocks.white : replayClocks.black;
  };

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
        let base = viewPly !== null ? viewPly + 1 : moves.length;
        let vMoves: Move[] = [];
        if (optimistic && optimistic.plies === optimistic.basePly + optimistic.variationMoves.length) {
            base = optimistic.basePly;
            vMoves = [...optimistic.variationMoves, move];
        } else if (optimistic) {
            base = optimistic.basePly;
            const branchLen = optimistic.plies - optimistic.basePly;
            vMoves = [...optimistic.variationMoves.slice(0, branchLen), move];
        } else {
            vMoves = [move];
        }
        
        setOptimistic({
          basePly: base,
          variationMoves: vMoves,
          plies: base + vMoves.length,
        });
        return;
      }

      if (!myColor || !gameActive || game.turn !== myColor) return;

      // Show the move instantly, then reconcile with the server's answer.
      setOptimistic({
        basePly: moves.length,
        variationMoves: [move],
        plies: moves.length + 1
      });
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
          return Math.max(-1, cur - 1);
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
  const capturedFor = (c: "w" | "b") => (c === "w" ? captured.byWhite : captured.byBlack);
  const advFor = (c: "w" | "b") => (c === "w" ? captured.whiteAdv : captured.blackAdv);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 w-full bg-transparent">
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

          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-start lg:justify-center w-full max-w-[1250px] mx-auto px-2 sm:px-4">
            {/* Board */}
            <div className={`w-full flex flex-col items-center order-1 lg:order-1 transition-all duration-300 ${optimistic ? "saturate-50 opacity-90" : ""}`} style={{ maxWidth: 'min(800px, calc(100vh - 140px))' }}>
              <div className="w-full flex flex-col gap-1">
                {/* Top Timer */}
                <div className="w-full flex">
                  {gameOver && <div className="w-4 shrink-0 mr-2" />}
                  <div className="flex-1 min-w-0">
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
                  </div>
                </div>

                {/* Eval Bar + Board */}
                <div className="flex flex-row items-stretch gap-2 w-full">
                  {gameOver && (
                    <div className="w-4 rounded bg-[#333] overflow-hidden flex flex-col-reverse shadow-inner shrink-0 relative">
                      <div 
                        className="w-full bg-[#f0f0f0] transition-all duration-500 ease-out absolute bottom-0"
                        style={{ height: evalHeight }}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <ChessBoard
                      gameState={displayState}
                      playerColor={myColor ?? "w"}
                      onMove={handleMove}
                      lastMove={lastMove}
                      boardFlipped={boardFlipped}
                      interactive={Boolean((isLiveView && !isSpectator) || gameOver)}
                      allowBothColors={gameOver}
                      lastMoveClassification={currentClassification}
                      bestMoveArrows={bestMoveArrows}
                    />
                  </div>
                </div>

                {/* Bottom Timer */}
                <div className="w-full flex">
                  {gameOver && <div className="w-4 shrink-0 mr-2" />}
                  <div className="flex-1 min-w-0">
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
                  </div>
                </div>

                {gameOver && game.winner && (
                  <GameOverDialog
                    winner={game.winner as "w" | "b" | "draw"}
                    reason={game.endReason ?? "unknown"}
                    whiteName={nameFor("w")}
                    blackName={nameFor("b")}
                    myColor={myColor}
                    onRematch={isSpectator ? undefined : rematch}
                    onReview={moves.length > 0 ? () => setViewPly(Math.max(0, moves.length - 1)) : undefined}
                  />
                )}

              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => { setViewPly(-1); setOptimistic(null); }}
                  disabled={moves.length === 0}
                  className="btn btn-secondary text-xs disabled:opacity-40 px-3 font-mono font-bold"
                >
                  &lt;&lt;
                </button>
                <button
                  onClick={() => {
                    if (optimistic) {
                      const newPlies = optimistic.plies - 1;
                      if (newPlies <= optimistic.basePly) {
                        setOptimistic(null);
                        setViewPly(Math.max(-1, optimistic.basePly - 1));
                      } else {
                        setOptimistic({ ...optimistic, plies: newPlies });
                      }
                    } else {
                      setViewPly((p) => {
                        const cur = p === null ? moves.length - 1 : p;
                        return Math.max(-1, cur - 1);
                      });
                    }
                  }}
                  disabled={displayMoves.length === 0}
                  className="btn btn-secondary text-xs disabled:opacity-40 px-4 font-mono font-bold"
                >
                  &lt;
                </button>
                <button
                  onClick={() => {
                    if (optimistic) {
                      const maxPlies = optimistic.basePly + optimistic.variationMoves.length;
                      const newPlies = Math.min(optimistic.plies + 1, maxPlies);
                      setOptimistic({ ...optimistic, plies: newPlies });
                    } else {
                      setViewPly((p) => (p === null || p + 1 >= moves.length - 1 ? null : p + 1));
                    }
                  }}
                  disabled={Boolean((isLiveView && !optimistic) || (optimistic && optimistic.plies === optimistic.basePly + optimistic.variationMoves.length))}
                  className="btn btn-secondary text-xs disabled:opacity-40 px-4 font-mono font-bold"
                >
                  &gt;
                </button>
                <button
                  onClick={() => { setViewPly(null); setOptimistic(null); }}
                  disabled={isLiveView && !optimistic}
                  className="btn btn-secondary text-xs disabled:opacity-40 px-3 font-mono font-bold"
                >
                  &gt;&gt;
                </button>
              </div>

              {gameOver && moves.length > 0 && (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {replayMode !== null ? (
                    <button
                      onClick={() => setReplayMode(null)}
                      className="btn text-xs px-4 bg-[var(--accent)] text-white border-transparent"
                    >
                      ⏸ Pause Replay ({replayMode})
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => { if (viewPly === null) setViewPly(-1); setReplayMode("fast"); }}
                        className="btn btn-secondary text-xs px-3"
                      >
                        ▶ Fast
                      </button>
                      <button
                        onClick={() => { if (viewPly === null) setViewPly(-1); setReplayMode("slow"); }}
                        className="btn btn-secondary text-xs px-3"
                      >
                        ▶ Slow
                      </button>
                      <button
                        onClick={() => { if (viewPly === null) setViewPly(-1); setReplayMode("realtime"); }}
                        className="btn btn-secondary text-xs px-3"
                      >
                        ▶ Realtime
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="w-full lg:w-[320px] xl:w-[380px] shrink-0 flex flex-col gap-4 order-2 lg:order-2 lg:sticky lg:top-4 lg:self-start lg:h-[calc(100vh-140px)] move-history">
              {/* Game Review Coach Bubble */}
              {fullGameAnalysis && (() => {
                const activeIndex = optimistic?.plies != null ? optimistic.plies - 1 : (viewPly ?? moves.length - 1);
                if (activeIndex >= 0 && activeIndex < fullGameAnalysis.moves.length) {
                  const mData = fullGameAnalysis.moves[activeIndex];
                  const cls = mData.classification;
                  const color = CLASSIFICATION_COLORS[cls as keyof typeof CLASSIFICATION_COLORS] || "#888";
                  const icon = CLASSIFICATION_ICONS[cls as keyof typeof CLASSIFICATION_ICONS] || "";
                  
                  return (
                    <div className="card p-4 border border-[var(--border)] shadow-sm bg-[var(--bg-card)]">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-white text-xl bg-[var(--bg-main)] border-2 font-bold" style={{ borderColor: color, color }}>
                          {icon}
                        </div>
                        <div>
                          <div className="text-sm font-bold uppercase tracking-wider mb-1" style={{ color }}>
                            {cls}
                          </div>
                          <div className="text-sm text-[var(--text-secondary)] leading-snug">
                            {cls === "brilliant" && "Brilliant! You found a fantastic sacrifice or tactic."}
                            {cls === "great" && "Great move! This finds a critical idea in the position."}
                            {cls === "best" && "Best move! The engine agrees with your choice."}
                            {cls === "excellent" && "Excellent. This is a very strong move."}
                            {cls === "good" && "Good move. It keeps the position solid."}
                            {cls === "book" && "Book move. Standard opening theory."}
                            {cls === "inaccuracy" && "Inaccuracy. There was a better continuation available."}
                            {cls === "mistake" && "Mistake. This gives up a significant advantage."}
                            {cls === "blunder" && "Blunder! This drastically changes the evaluation of the game."}
                          </div>
                          {(() => {
                            const formatEval = (cp: number, isMate: boolean) => {
                              if (isMate) return cp > 0 ? "+M" : "-M";
                              const val = (cp / 100).toFixed(2);
                              return cp > 0 ? `+${val}` : val;
                            };
                            return (
                              <>
                                {mData.bestMove && cls !== "best" && cls !== "book" && (
                                  <div className="mt-3 flex flex-col gap-1">
                                    <div className="text-xs font-mono bg-[var(--bg-input)] px-2 py-1.5 rounded text-[var(--text-primary)]">
                                      <span className="text-[var(--text-muted)]">Played move eval: </span>
                                      <span className={mData.evalAfter > 0 ? "text-green-500" : mData.evalAfter < 0 ? "text-red-500" : ""}>
                                        {formatEval(mData.evalAfter, mData.isMate)}
                                      </span>
                                    </div>
                                    <div className="text-xs font-mono bg-[var(--bg-input)] px-2 py-1.5 rounded text-[var(--text-primary)]">
                                      <span className="text-[var(--text-muted)]">Best move: </span>
                                      <strong>{mData.bestMove}</strong>
                                      <span className="text-[var(--text-muted)] ml-2">eval: </span>
                                      <span className={mData.evalBefore > 0 ? "text-green-500" : mData.evalBefore < 0 ? "text-red-500" : ""}>
                                        {formatEval(mData.evalBefore, mData.isMate)}
                                      </span>
                                    </div>
                                  </div>
                                )}
                                {(cls === "best" || cls === "book" || !mData.bestMove) && (
                                  <div className="mt-3 text-xs font-mono bg-[var(--bg-input)] px-2 py-1.5 rounded inline-block text-[var(--text-primary)]">
                                    <span className="text-[var(--text-muted)]">Eval: </span>
                                    <span className={mData.evalAfter > 0 ? "text-green-500" : mData.evalAfter < 0 ? "text-red-500" : ""}>
                                      {formatEval(mData.evalAfter, mData.isMate)}
                                    </span>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {gameOver && (
                <div className="card p-3 shrink-0">
                  <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                      Stockfish
                    </h4>
                    <button
                      onClick={() => setEngineEnabled(!engineEnabled)}
                      className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${engineEnabled ? 'bg-[var(--accent)]' : 'bg-[#333]'}`}
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${engineEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {engineEnabled && (
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
                  )}
                </div>

                {!engineEnabled ? (
                  <p className="text-xs text-[var(--text-secondary)] py-1">Enable engine to see live evaluation and best moves.</p>
                ) : analysisError ? (
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
              )}

              <MoveHistory
                moves={displayMoves.map((m) => ({ san: m.san, check: m.check, checkmate: m.checkmate }))}
                activeMoveIndex={optimistic?.plies != null ? optimistic.plies - 1 : (viewPly ?? moves.length - 1)}
                onMoveClick={(i) => {
                  if (optimistic) {
                    if (i < optimistic.basePly) {
                      setViewPly(i === moves.length - 1 ? null : i);
                      setOptimistic(null);
                    } else {
                      setOptimistic({ ...optimistic, plies: i + 1 });
                    }
                  } else {
                    setViewPly(i === moves.length - 1 ? null : i);
                  }
                }}
                className="flex-1 min-h-0"
              />


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

              {/* Game Controls */}
              <div className="mt-auto">
                <GameControls
                  onResign={() => doAction("resign")}
                  onOfferDraw={() => doAction("offer-draw")}
                  onAcceptDraw={() => doAction("accept-draw")}
                  onDeclineDraw={() => doAction("decline-draw")}
                  onFlipBoard={() => setBoardFlipped((f) => !f)}
                  onAbort={() => doAction("abort")}
                  canAbort={game?.fen === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}
                  isPlayerTurn={isMyTurn}
                  isSpectator={isSpectator}
                  gameActive={Boolean(gameActive)}
                  drawOfferedBy={game.drawOfferedBy}
                  myColor={myColor}
                  busy={busy}
                />
              </div>
            </div>
          </div>

          {gameOver && moves.length > 0 && (
            <div className="mt-12 w-full max-w-4xl mx-auto pb-12">
              <GameAnalysis
                gameId={gameId}
                moves={(() => {
                  let whiteTime = game?.timeControl || 600;
                  let blackTime = game?.timeControl || 600;
                  
                  return displayMoves.map((m, i) => {
                    let moveTime = 0;
                    if (m.createdAt) {
                      const prevTime = i === 0 && game?.createdAt 
                        ? new Date(game.createdAt).getTime() 
                        : (i > 0 && displayMoves[i-1].createdAt ? new Date(displayMoves[i-1].createdAt!).getTime() : new Date(m.createdAt).getTime());
                      moveTime = Math.max(0, (new Date(m.createdAt).getTime() - prevTime) / 1000);
                    }
                    
                    if (i % 2 === 0) {
                      whiteTime -= moveTime;
                      whiteTime = Math.max(0, whiteTime) + (game?.increment || 0);
                    } else {
                      blackTime -= moveTime;
                      blackTime = Math.max(0, blackTime) + (game?.increment || 0);
                    }
                    
                    const timeLeft = i % 2 === 0 ? whiteTime : blackTime;
                    
                    return { san: m.san, check: m.check, checkmate: m.checkmate, moveTime, timeLeft };
                  });
                })()}
                onMoveClick={(ply) => {
                  if (optimistic) {
                    if (ply < optimistic.basePly) {
                      setViewPly(ply === moves.length - 1 ? null : ply);
                      setOptimistic(null);
                    } else {
                      setOptimistic({ ...optimistic, plies: ply + 1 });
                    }
                  } else {
                    setViewPly(ply === moves.length - 1 ? null : ply);
                  }
                }}
                activePly={optimistic?.plies != null ? optimistic.plies - 1 : (viewPly ?? moves.length - 1)}
                onAnalysisComplete={setFullGameAnalysis}
                initialAnalysis={(game as any).analysis}
              />
            </div>
          )}
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
