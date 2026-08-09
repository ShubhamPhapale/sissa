import React from "react";
import Header from "@/components/Header";
import { db } from "@/db";
import { users } from "@/db/schema";
import { desc, isNotNull, eq } from "drizzle-orm";
import Link from "next/link";

export const revalidate = 60; // Revalidate every 60 seconds

export default async function LeaderboardPage() {
  const topPlayers = await db
    .select({
      id: users.id,
      username: users.username,
      rating: users.rating,
      wins: users.wins,
      losses: users.losses,
      draws: users.draws
    })
    .from(users)
    .orderBy(desc(users.rating))
    .limit(100);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-default)]">
      <Header />
      <main className="flex-1 px-4 py-8 md:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-white">Global Leaderboard</h1>
            <span className="text-sm text-[var(--text-muted)]">Top 100 Players</span>
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
                    <tr key={player.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 text-center font-mono text-sm text-[var(--text-secondary)]">
                        {index + 1}
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-white">{player.username}</div>
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
      </main>
    </div>
  );
}
