"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { TIME_CONTROLS, formatTime } from "@/lib/utils";

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
  const [myName, setMyName] = useState("");
  const [selectedTime, setSelectedTime] = useState(600);
  const [increment, setIncrement] = useState(0);
  const [recentGames, setRecentGames] = useState<GameSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleCreateGame = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whitePlayerName: myName || "White",
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
                  A polished live chess experience.
                </h1>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="#new-game" className="btn btn-primary inline-flex items-center gap-2 px-5 py-3">
                  Quick match
                </Link>
                <Link href="/games" className="btn btn-secondary inline-flex items-center gap-2 px-5 py-3">
                  Browse live games
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { title: "Quick match", body: "One tap creates a live board with a clean invitation link for your friend." },
                { title: "QR share", body: "The game page shows a scannable QR code so sharing works on mobile too." },
                { title: "Server clocks", body: "Clocks stay authoritative on the server and sync back to every client." },
                { title: "Reviewable", body: "Moves, PGN, and game history are still there after the match ends." },
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
          <div id="new-game" className="card h-full p-6 md:p-7">
            <h2 className="mb-2 text-xl font-bold">
              New game
            </h2>
            <p className="mb-5 text-sm text-[var(--text-secondary)]">
              Enter your name, choose a clock, and create a quick match you can share.
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                  Your name
                </label>
                <input
                  value={myName}
                  onChange={(e) => setMyName(e.target.value)}
                  placeholder="Enter your name"
                  className="input w-full"
                  maxLength={30}
                />
              </div>
            </div>

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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
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
              <div className="mb-3 p-2 rounded-md bg-red-900/30 border border-red-700/40 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={handleCreateGame}
              disabled={creating}
              className="btn btn-primary w-full py-3.5 text-base disabled:opacity-60"
            >
              {creating ? "Creating…" : "Quick match"}
            </button>

            <p className="mt-3 text-xs text-[var(--text-muted)] text-center">
              The invite link and QR code appear inside the game once it is created.
            </p>
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
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {recentGames.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => router.push(`/game/${g.id}`)}
                    className="w-full text-left flex items-center justify-between p-3 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--border)] transition-colors"
                  >
                    <div className="text-sm min-w-0">
                      <div className="truncate">
                        {g.whitePlayerName || "White"}{" "}
                        <span className="text-[var(--text-muted)]">vs</span>{" "}
                        {g.blackPlayerName || "Black"}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">
                        {formatTime(g.timeControl)}
                        {g.increment ? ` +${g.increment}` : ""} · {g.id}
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
