"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { formatTime } from "@/lib/utils";

interface Game {
  id: string;
  whitePlayerName: string | null;
  blackPlayerName: string | null;
  status: string;
  winner: string | null;
  endReason: string | null;
  timeControl: number;
  increment: number;
  createdAt: string;
  whiteTimeRemaining: number;
  blackTimeRemaining: number;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "playing", label: "Live" },
  { key: "finished", label: "Finished" },
] as const;

export default function GamesPage() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchGames = useCallback(async () => {
    try {
      const qs = filter === "all" ? "limit=50" : `status=${filter}&limit=50`;
      const res = await fetch(`/api/games?${qs}`, { cache: "no-store" });
      const data = await res.json();
      setGames(data.games ?? []);
    } catch {
      /* non-critical */
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchGames();
    const id = setInterval(fetchGames, 5000);
    return () => clearInterval(id);
  }, [fetchGames]);

  const resultBadge = (g: Game) => {
    if (g.status === "playing") return { cls: "badge-green", text: "🟢 Live" };
    if (g.winner === "draw") return { cls: "badge-yellow", text: "½–½ Draw" };
    if (g.winner === "w") return { cls: "badge-blue", text: "1–0 White" };
    if (g.winner === "b") return { cls: "badge-blue", text: "0–1 Black" };
    return { cls: "badge-yellow", text: "Unfinished" };
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 p-4">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span>📺</span> Games
            </h1>
            <div className="flex gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    filter === f.key
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <span className="text-4xl animate-pulse">♟</span>
              <p className="mt-3 text-[var(--text-secondary)]">Loading games…</p>
            </div>
          ) : games.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl">🎮</span>
              <p className="mt-3 text-[var(--text-secondary)]">No games in this filter</p>
              <Link href="/" className="btn btn-primary mt-4 inline-block">
                Start a new game
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {games.map((g) => {
                const badge = resultBadge(g);
                return (
                  <button
                    key={g.id}
                    onClick={() => router.push(`/game/${g.id}`)}
                    className="card p-4 w-full text-left hover:bg-[var(--bg-input)] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-medium truncate">
                          ♔ {g.whitePlayerName || "White"}
                        </span>
                        <span className="text-[var(--text-muted)]">vs</span>
                        <span className="font-medium truncate">
                          ♚ {g.blackPlayerName || "Black"}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono text-[var(--text-muted)]">
                          {formatTime(g.whiteTimeRemaining)} · {formatTime(g.blackTimeRemaining)}
                        </span>
                        <span className={`badge ${badge.cls}`}>{badge.text}</span>
                      </div>
                    </div>
                    <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                      {formatTime(g.timeControl)}
                      {g.increment ? ` +${g.increment}` : ""}
                      {g.endReason ? ` · ${g.endReason}` : ""} ·{" "}
                      {new Date(g.createdAt).toLocaleString()}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
