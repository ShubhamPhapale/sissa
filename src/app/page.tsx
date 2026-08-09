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
  const [botLevel, setBotLevel] = useState(5);
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
          whitePlayerName: user ? user.username : "Anonymous",
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
          blackPlayerName: `Stockfish (Level ${botLevel})`,
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
        <section className="mx-auto mb-12 max-w-4xl pt-8 md:pt-16 lg:pt-24 pb-8 md:pb-12 text-center">
          <div className="flex flex-col items-center justify-center space-y-8">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-orange-600 shadow-xl shadow-orange-500/20 md:h-24 md:w-24">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10 text-white md:h-12 md:w-12">
                <path d="M19 22H5c-1.1 0-2-.9-2-2v-2h18v2c0 1.1-.9 2-2 2zM17 2H7c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-6 9H9v2h2v2h2v-2h2v-2h-2V9h-2v2zM7 10h1v4H7v-4zm9 0h1v4h-1v-4z" />
              </svg>
            </div>
            
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-black tracking-tight text-white md:text-6xl mx-auto">
                Play chess online against real players.
              </h1>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              {!authLoading && !user ? (
                <>
                  <Link href="/signup" className="btn btn-primary inline-flex items-center gap-2 px-6 py-3.5 text-base">
                    Sign up to play
                  </Link>
                  <Link href="/login" className="btn btn-secondary inline-flex items-center gap-2 px-6 py-3.5 text-base">
                    Log in
                  </Link>
                </>
              ) : (
                <>
                  <Link href="#new-game" className="btn btn-primary inline-flex items-center gap-2 px-6 py-3.5 text-base">
                    Quick match
                  </Link>
                  <Link href="/games" className="btn btn-secondary inline-flex items-center gap-2 px-6 py-3.5 text-base">
                    Browse live games
                  </Link>
                  <Link href="/leaderboard" className="btn btn-secondary inline-flex items-center gap-2 px-6 py-3.5 text-base bg-white/5 border-white/10 hover:bg-white/10">
                    Leaderboard
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.05fr),minmax(420px,0.95fr)] lg:items-start">
          {/* Create game */}
          <div id="new-game" className="card h-full p-6 md:p-7 relative overflow-hidden">
            {!user && !authLoading && (
              <div className="mb-6 p-4 rounded-lg bg-blue-900/20 border border-blue-500/30">
                <h3 className="text-sm font-bold text-blue-300 mb-1">Play Ranked Games</h3>
                <p className="text-xs text-blue-200/70 mb-3">
                  Log in to play ranked matchmaking against others. Anonymous play is unrated.
                </p>
                <div className="flex gap-2">
                  <Link href="/login" className="btn btn-primary text-xs py-1.5 px-4">Log In</Link>
                  <Link href="/signup" className="btn btn-secondary text-xs py-1.5 px-4">Sign Up</Link>
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
                <label className="block text-sm font-medium mb-3 text-[var(--text-secondary)]">
                  Time Control
                </label>
                <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
                  {[
                    { label: "1 + 0", name: "Bullet", time: 60, inc: 0 },
                    { label: "2 + 1", name: "Bullet", time: 120, inc: 1 },
                    { label: "3 + 0", name: "Blitz", time: 180, inc: 0 },
                    { label: "3 + 2", name: "Blitz", time: 180, inc: 2 },
                    { label: "5 + 0", name: "Blitz", time: 300, inc: 0 },
                    { label: "5 + 3", name: "Blitz", time: 300, inc: 3 },
                    { label: "10 + 0", name: "Rapid", time: 600, inc: 0 },
                    { label: "15 + 10", name: "Rapid", time: 900, inc: 10 },
                    { label: "30 + 0", name: "Classical", time: 1800, inc: 0 },
                  ].map((preset) => (
                    <button
                      key={`${preset.time}+${preset.inc}`}
                      onClick={() => {
                        setSelectedTime(preset.time);
                        setIncrement(preset.inc);
                      }}
                      className={`flex flex-col items-center justify-center min-h-[72px] rounded-xl p-2 transition-all border ${
                        selectedTime === preset.time && increment === preset.inc
                          ? "bg-[var(--accent)] border-transparent text-white shadow-lg shadow-orange-500/20 scale-105 z-10"
                          : "bg-[var(--bg-input)] border-transparent text-[var(--text-secondary)] hover:bg-[var(--border)]"
                      }`}
                    >
                      <div className="text-sm sm:text-base font-bold tracking-tight">{preset.label}</div>
                      <div className="text-[10px] sm:text-xs opacity-80 uppercase tracking-widest mt-0.5">{preset.name}</div>
                    </button>
                  ))}
                </div>

                {error && (
                  <div className="mb-4 p-2 rounded-md bg-red-900/30 border border-red-700/40 text-sm text-red-300">
                    {error}
                  </div>
                )}

                <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                  Computer Level: {botLevel} {botLevel === 1 ? "(Beginner)" : botLevel === 12 ? "(Super GM)" : ""}
                </label>
                <div className="mb-6">
                  <input
                    type="range"
                    min="1"
                    max="12"
                    value={botLevel}
                    onChange={(e) => setBotLevel(parseInt(e.target.value))}
                    className="w-full accent-[var(--accent)]"
                  />
                  <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1 px-1">
                    <span>1</span>
                    <span>6</span>
                    <span>12</span>
                  </div>
                </div>

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
