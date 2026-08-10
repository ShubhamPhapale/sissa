"use client";

import React, { useState } from "react";
import Link from "next/link";

type PlayerStats = {
  id: number;
  username: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
};

export default function LeaderboardClient({
  bullet,
  blitz,
  rapid,
  classical,
}: {
  bullet: PlayerStats[];
  blitz: PlayerStats[];
  rapid: PlayerStats[];
  classical: PlayerStats[];
}) {
  const [activeTab, setActiveTab] = useState<"bullet" | "blitz" | "rapid" | "classical">("blitz");

  const lists = {
    bullet,
    blitz,
    rapid,
    classical,
  };

  const topPlayers = lists[activeTab];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Global Leaderboard</h1>
          <span className="text-sm text-[var(--text-muted)]">Top 100 Players</span>
        </div>
        
        <div className="flex bg-black/40 rounded-lg p-1.5 border border-white/10 shrink-0 self-start w-full sm:w-auto">
          {(["bullet", "blitz", "rapid", "classical"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 sm:flex-none px-5 py-2 text-sm font-medium rounded-md capitalize transition-colors ${
                activeTab === tab
                  ? "bg-[var(--accent)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-0 overflow-hidden border border-white/10">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-black/30 border-b border-white/10">
              <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] w-16 text-center">Rank</th>
              <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Player</th>
              <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] text-right">Rating</th>
              <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] text-right hidden sm:table-cell">W / D / L</th>
              <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] text-right hidden md:table-cell">Games</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {topPlayers.map((player, index) => {
              const totalGames = player.wins + player.draws + player.losses;
              
              return (
                <tr key={player.id} className="hover:bg-black/5 transition-colors">
                  <td className="p-4 text-center font-mono text-sm text-[var(--text-secondary)]">
                    {index + 1}
                  </td>
                  <td className="p-4">
                    <Link href={`/profile/${encodeURIComponent(player.username)}`} className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
                      {player.username}
                    </Link>
                  </td>
                  <td className="p-4 text-right">
                    <span className="font-bold text-[var(--accent)]">{player.rating}</span>
                  </td>
                  <td className="p-4 text-right text-sm text-[var(--text-secondary)] hidden sm:table-cell">
                    <span className="text-green-400">{player.wins}</span>
                    <span className="opacity-50 mx-1">/</span>
                    <span className="text-gray-400">{player.draws}</span>
                    <span className="opacity-50 mx-1">/</span>
                    <span className="text-red-400">{player.losses}</span>
                  </td>
                  <td className="p-4 text-right text-sm text-[var(--text-muted)] hidden md:table-cell">
                    {totalGames}
                  </td>
                </tr>
              );
            })}

            {topPlayers.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-[var(--text-muted)]">
                  No registered players yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
