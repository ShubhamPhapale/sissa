"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { TIME_CONTROLS, formatTime } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";

interface GameSummary {
  id: string;
  whitePlayerName: string | null;
  blackPlayerName: string | null;
  status: string;
  winner: string | null;
  timeControl: number;
  increment: number;
}

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  const [selectedTime, setSelectedTime] = useState(600);
  const [increment, setIncrement] = useState(0);
  const [recentGames, setRecentGames] = useState<GameSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Matchmaking state
  const [inQueue, setInQueue] = useState(false);
  const [queueTime, setQueueTime] = useState(0);

  const fetchRecentGames = useCallback(async () => {
    try {
      const res = await fetch("/api/games?limit=10", { cache: "no-store" });
      const data = await res.json();
      setRecentGames(data.games ?? []);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    fetchRecentGames();
    const id = setInterval(fetchRecentGames, 5000);
    return () => clearInterval(id);
  }, [fetchRecentGames]);

  // Matchmaking poll
  useEffect(() => {
    let interval: any;
    if (inQueue) {
      interval = setInterval(async () => {
        setQueueTime((prev) => prev + 1);
        try {
          const res = await fetch("/api/matchmaking");
          const data = await res.json();
          if (data.matched && data.gameId) {
            setInQueue(false);
            router.push(`/game/${data.gameId}`);
          }
        } catch {
          // ignore
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [inQueue, router]);

  const handlePlayFriend = async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whitePlayerName: user.username,
          timeControl: selectedTime,
          increment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create game");
        return;
      }
      router.push(`/game/${data.game.id}?player=1`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setCreating(false);
    }
  };

  const handleQuickMatch = async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    setCreating(true);
    setError(null);
    setQueueTime(0);
    try {
      const res = await fetch("/api/matchmaking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeControl: selectedTime,
          increment,
        }),
      });
      const data = await res.json();
      if (res.ok && data.matched && data.gameId) {
        router.push(`/game/${data.gameId}`);
      } else if (res.ok && !data.matched) {
        setInQueue(true);
      } else {
        setError(data.error ?? "Matchmaking failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleCancelQueue = async () => {
    setInQueue(false);
    try {
      await fetch("/api/matchmaking", { method: "DELETE" });
    } catch {
      // ignore
    }
  };

  const handlePlayComputer = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whitePlayerName: user ? user.username : "Anonymous",
          blackPlayerName: "Stockfish (Level 5)",
          timeControl: selectedTime,
          increment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create game");
        return;
      }
      router.push(`/game/${data.game.id}?player=1`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 px-4 py-5 md:px-6 md:py-8">
        <section className="mx-auto mb-6 max-w-6xl overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(145deg,rgba(10,17,31,0.96),rgba(10,18,36,0.85))] p-6 shadow-2xl md:p-10 lg:p-12">
          <div className="grid gap-8 md:grid-cols-[minmax(0,1.08fr),minmax(360px,0.92fr)] md:items-center">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-secondary)]">
                Live chess lobby
              </div>
              <div className="space-y-3">
                <h1 className="max-w-xl text-4xl font-black tracking-tight text-white md:text-6xl">
                  Play chess online against real players.
                </h1>
              </div>
              <div className="flex flex-wrap gap-3">
                {!authLoading && !user ? (
                  <>
                    <Link href="/signup" className="btn btn-primary inline-flex items-center gap-2 px-5 py-3">
                      Sign up to play
                    </Link>
                    <Link href="/login" className="btn btn-secondary inline-flex items-center gap-2 px-5 py-3">
                      Log in
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="#new-game" className="btn btn-primary inline-flex items-center gap-2 px-5 py-3">
                      Quick match
                    </Link>
                    <Link href="/games" className="btn btn-secondary inline-flex items-center gap-2 px-5 py-3">
                      Browse live games
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { title: "Quick match", body: "Play instantly against someone online with similar time control." },
                { title: "ELO Ratings", body: "Compete and climb the global leaderboard to become a grandmaster." },
                { title: "Server clocks", body: "Clocks stay authoritative on the server and sync back to every client." },
                { title: "Game Review", body: "Get full Stockfish analysis after the match ends to improve your play." },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-lg">
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                    {item.title}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.05fr),minmax(420px,0.95fr)] lg:items-start">
          {/* Create game */}
          <div id="new-game" className="card h-full p-6 md:p-7 relative overflow-hidden">
            {!user && !authLoading && (
              <div className="absolute inset-0 z-10 backdrop-blur-[2px] bg-black/40 flex flex-col items-center justify-center p-6 text-center">
                <h3 className="text-xl font-bold mb-2">Authentication Required</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-[250px]">
                  Log in or sign up to play ranked games, earn ELO, and climb the leaderboard.
                </p>
                <div className="flex gap-3">
                  <Link href="/login" className="btn btn-primary px-6">Log In</Link>
                  <Link href="/signup" className="btn btn-secondary px-6">Sign Up</Link>
                </div>
              </div>
            )}
            
            {inQueue ? (
              <div className="h-full flex flex-col items-center justify-center py-10">
                <div className="w-16 h-16 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-6"></div>
                <h2 className="text-xl font-bold mb-2">Finding opponent...</h2>
                <p className="text-[var(--text-secondary)] mb-8 font-mono">
                  Time in queue: {formatTime(queueTime)}
                </p>
                <button 
                  onClick={handleCancelQueue}
                  className="btn btn-secondary text-sm text-red-400 hover:text-red-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <h2 className="mb-2 text-xl font-bold">
                  Play Online
                </h2>
                <p className="mb-5 text-sm text-[var(--text-secondary)]">
                  Choose a time control and find a match or invite a friend.
                </p>

                <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                  Time control
                </label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 mb-4">
                  {TIME_CONTROLS.map((tc) => (
                    <button
                      key={tc.seconds}
                      onClick={() => setSelectedTime(tc.seconds)}
                      className={`min-h-[84px] rounded-2xl px-3 py-4 text-sm font-medium transition-all ${
                        selectedTime === tc.seconds
                          ? "bg-[var(--accent)] text-white shadow-lg shadow-orange-500/20"
                          : "bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                      }`}
                    >
                      <div className="text-base font-semibold">{tc.label}</div>
                      <div className="mt-1 text-xs opacity-75">{formatTime(tc.seconds)}</div>
                    </button>
                  ))}
                </div>

                <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                  Increment per move
                </label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
                  {[0, 2, 5, 10].map((inc) => (
                    <button
                      key={inc}
                      onClick={() => setIncrement(inc)}
                      className={`min-h-[56px] rounded-lg px-3 py-3 text-sm font-medium transition-all ${
                        increment === inc
                          ? "bg-[var(--accent)] text-white"
                          : "bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                      }`}
                    >
                      +{inc}s
                    </button>
                  ))}
                </div>

                {error && (
                  <div className="mb-4 p-2 rounded-md bg-red-900/30 border border-red-700/40 text-sm text-red-300">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={handleQuickMatch}
                    disabled={creating}
                    className="btn btn-primary py-3.5 text-sm md:text-base disabled:opacity-60"
                  >
                    {creating ? "Wait…" : "Quick Match"}
                  </button>
                  <button
                    onClick={handlePlayFriend}
                    disabled={creating}
                    className="btn btn-secondary py-3.5 text-sm md:text-base disabled:opacity-60"
                  >
                    Play Friend
                  </button>
                  <button
                    onClick={handlePlayComputer}
                    disabled={creating}
                    className="btn btn-secondary py-3.5 text-sm md:text-base disabled:opacity-60 bg-[var(--bg-input)]"
                  >
                    Play Computer
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Recent games */}
          <div id="recent-games" className="card h-full p-6 md:p-7">
            <h2 className="mb-4 text-xl font-bold">
              Recent games
            </h2>

            {recentGames.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-muted)]">
                <p>No games yet — start the first one.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-2">
                {recentGames.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => router.push(`/game/${g.id}`)}
                    className="w-full text-left flex items-center justify-between p-3 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] transition-colors"
                  >
                    <div className="text-sm min-w-0 pr-2">
                      <div className="truncate font-semibold text-[var(--text-primary)]">
                        {g.whitePlayerName || "Anonymous"}{" "}
                        <span className="text-[var(--text-muted)] font-normal text-xs mx-1">vs</span>{" "}
                        {g.blackPlayerName || "Anonymous"}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-1 font-mono">
                        {formatTime(g.timeControl)}
                        {g.increment ? `+${g.increment}` : ""} · {g.id}
                      </div>
                    </div>
                    <span
                      className={`badge shrink-0 ${
                        g.status === "playing" ? "badge-green" : "badge-blue"
                      }`}
                    >
                      {g.status === "playing"
                        ? "Live"
                        : g.winner === "draw"
                        ? "½–½"
                        : g.winner === "w"
                        ? "1–0"
                        : "0–1"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
