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
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)] uppercase tracking-wider bg-[var(--bg-input)]">
                      <th className="p-3 font-medium pl-6 w-20 text-center">Time</th>
                      <th className="p-3 font-medium">Players</th>
                      <th className="p-3 font-medium w-20 text-center">Result</th>
                      <th className="p-3 font-medium w-24 text-center">Accuracy</th>
                      <th className="p-3 font-medium w-16 text-center">Moves</th>
                      <th className="p-3 font-medium text-right pr-6 w-28">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {games.map((g: any) => {
                      const whiteScore = g.winner === "w" ? "1" : g.winner === "b" ? "0" : g.winner === "draw" ? "½" : "";
                      const blackScore = g.winner === "b" ? "1" : g.winner === "w" ? "0" : g.winner === "draw" ? "½" : "";

                      let resultBlock = null;
                      if (g.winner) {
                        if (g.winner === "draw") {
                          resultBlock = <div className="w-4 h-4 bg-[#8c8a88] rounded-sm flex items-center justify-center text-[11px] font-bold text-white leading-none">=</div>;
                        } else if (g.winner === "w") {
                          resultBlock = <div className="w-4 h-4 bg-[#81b64c] rounded-sm flex items-center justify-center text-[11px] font-bold text-white leading-none">W</div>;
                        } else if (g.winner === "b") {
                          resultBlock = <div className="w-4 h-4 bg-[#81b64c] rounded-sm flex items-center justify-center text-[11px] font-bold text-white leading-none">B</div>;
                        }
                      } else {
                         resultBlock = <div className="w-4 h-4 bg-[var(--accent)] rounded-sm flex items-center justify-center text-[11px] font-bold text-white leading-none">▶</div>;
                      }

                      // Accuracy logic
                      let whiteAcc = null;
                      let blackAcc = null;
                      if (g.analysis) {
                        try {
                          const parsed = typeof g.analysis === "string" ? JSON.parse(g.analysis) : g.analysis;
                          whiteAcc = parsed.whiteAccuracy;
                          blackAcc = parsed.blackAccuracy;
                        } catch {}
                      }

                      // Move count
                      let displayMovesCount = 0;
                      if (g.fen) {
                        const fenParts = g.fen.split(" ");
                        const fullMoveNumber = parseInt(fenParts[5] || "1", 10);
                        const turn = fenParts[1];
                        const moveCount = turn === "w" ? (fullMoveNumber - 1) * 2 : (fullMoveNumber - 1) * 2 + 1;
                        displayMovesCount = Math.ceil(moveCount / 2);
                      }

                      // Time control icon
                      let icon = "⏱️";
                      let tcName = "Rapid";
                      if (g.timeControl < 180) {
                        icon = "🚀";
                        tcName = "Bullet";
                      } else if (g.timeControl < 600) {
                        icon = "⚡";
                        tcName = "Blitz";
                      }
                      
                      const tcText = g.timeControl < 60 ? `${g.timeControl}s` : `${g.timeControl / 60} min`;

                      return (
                        <tr key={g.id} className="hover:bg-white/[0.03] transition-colors group cursor-pointer" onClick={() => router.push(`/game/${g.id}`)}>
                          <td className="p-3 pl-6">
                            <div className="flex flex-col items-center justify-center text-[var(--text-secondary)]">
                              <span className="text-xl leading-none mb-1">{icon}</span>
                              <span className="text-xs whitespace-nowrap">{tcText}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-1 group-hover:opacity-80 transition-opacity">
                              <div className="flex items-center gap-2 text-[var(--text-primary)]">
                                <div className="w-3 h-3 bg-white border border-gray-400 rounded-sm shadow-sm shrink-0" />
                                <span className="truncate">{g.whitePlayerName || "Anonymous"} <span className="text-[var(--text-muted)] text-xs font-normal">({g.whitePlayerRating || "?"})</span></span>
                              </div>
                              <div className="flex items-center gap-2 text-[var(--text-primary)]">
                                <div className="w-3 h-3 bg-[#2b2b2b] border border-[#111] rounded-sm shadow-sm shrink-0" />
                                <span className="truncate">{g.blackPlayerName || "Anonymous"} <span className="text-[var(--text-muted)] text-xs font-normal">({g.blackPlayerRating || "?"})</span></span>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-3">
                              {g.status === "playing" ? (
                                <div className="flex flex-col items-center justify-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                                  <div className="flex items-center gap-1.5 bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded-sm">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                                    <span className="text-[10px] font-bold tracking-wider uppercase">Live</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
                                  <div className="flex flex-col items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                                    <span className="leading-none">{whiteScore}</span>
                                    <span className="leading-none">{blackScore}</span>
                                  </div>
                                  {resultBlock}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex flex-col items-center gap-1 text-[var(--text-secondary)] opacity-70 group-hover:opacity-100 transition-opacity">
                              {whiteAcc !== null && blackAcc !== null ? (
                                <>
                                  <span className="text-xs font-mono">{whiteAcc.toFixed(1)}</span>
                                  <span className="text-xs font-mono">{blackAcc.toFixed(1)}</span>
                                </>
                              ) : g.status === "finished" ? (
                                <span className="text-[10px] uppercase tracking-wider text-[var(--accent)] font-medium">Review</span>
                              ) : (
                                <span className="text-[10px] text-[var(--text-muted)]">-</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center text-[var(--text-secondary)] font-mono text-xs">
                            {displayMovesCount > 0 ? displayMovesCount : "-"}
                          </td>
                          <td className="p-3 pr-6 text-right text-[var(--text-secondary)] whitespace-nowrap text-xs">
                            {new Date(g.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
