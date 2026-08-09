import { db } from "@/db";
import { users, games } from "@/db/schema";
import { eq, or, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Link from "next/link";
import { formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const decodedUsername = decodeURIComponent(username);

  // Fetch user
  const userResults = await db.select().from(users).where(eq(users.username, decodedUsername)).limit(1);
  if (userResults.length === 0) {
    return notFound();
  }
  const user = userResults[0];

  // Fetch recent games
  const recentGames = await db
    .select()
    .from(games)
    .where(or(eq(games.whitePlayerId, user.id), eq(games.blackPlayerId, user.id)))
    .orderBy(desc(games.createdAt))
    .limit(30);

  const totalGames = user.wins + user.losses + user.draws;
  const winRate = totalGames > 0 ? Math.round((user.wins / totalGames) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-default)]">
      <Header />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 md:px-8">
        
        {/* Profile Header */}
        <div className="card p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start mb-8">
          <div className="w-24 h-24 shrink-0 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-orange-600 shadow-xl shadow-orange-500/20 flex items-center justify-center text-4xl font-bold text-white uppercase">
            {user.username.substring(0, 2)}
          </div>
          
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white mb-2">{user.username}</h1>
            <p className="text-[var(--text-secondary)] text-sm mb-6">
              Member since {new Date(user.createdAt).toLocaleDateString()}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatBox title="Bullet" value={user.bulletRating} />
              <StatBox title="Blitz" value={user.blitzRating} />
              <StatBox title="Rapid" value={user.rapidRating} />
              <StatBox title="Classical" value={user.classicalRating} />
            </div>
          </div>
          
          <div className="shrink-0 card bg-[var(--bg-input)] border-transparent w-full md:w-auto p-4 flex flex-col items-center">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">Win Rate</div>
            <div className="text-3xl font-black text-white">{winRate}%</div>
            <div className="text-xs text-[var(--text-secondary)] mt-2">
              <span className="text-green-400 font-semibold">{user.wins}</span>W - <span className="text-gray-400 font-semibold">{user.draws}</span>D - <span className="text-red-400 font-semibold">{user.losses}</span>L
            </div>
          </div>
        </div>

        {/* Match History */}
        <h2 className="text-xl font-bold text-white mb-4">Match History</h2>
        
        {recentGames.length === 0 ? (
          <div className="card p-12 text-center text-[var(--text-muted)]">
            No games played yet.
          </div>
        ) : (
          <div className="card p-0 overflow-hidden border border-white/10">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/30 border-b border-white/10">
                  <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Players</th>
                  <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] hidden sm:table-cell">Result</th>
                  <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] hidden md:table-cell">Accuracy</th>
                  <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] text-right">Time</th>
                  <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentGames.map((g) => {
                  const isWhite = g.whitePlayerId === user.id;
                  const won = g.winner === (isWhite ? 'w' : 'b');
                  const draw = g.winner === 'draw';
                  const lost = g.winner && !won && !draw;
                  
                  const whiteName = g.whitePlayerName || "Anonymous";
                  const blackName = g.blackPlayerName || "Anonymous";
                  
                  // Extract accuracy if analysis is present
                  let accuracy = null;
                  if (g.analysis) {
                    try {
                      const analysis = typeof g.analysis === 'string' ? JSON.parse(g.analysis) : g.analysis;
                      accuracy = isWhite ? analysis.whiteAccuracy : analysis.blackAccuracy;
                    } catch {
                      // ignore parse errors
                    }
                  }

                  return (
                    <tr key={g.id} className="hover:bg-white/5 transition-colors group">
                      <td className="p-4">
                        <Link href={`/game/${g.id}`} className="flex flex-col gap-1">
                          <div className={`font-semibold ${isWhite ? "text-white" : "text-[var(--text-secondary)]"}`}>
                            <span className="text-[10px] bg-white/10 px-1 rounded mr-1">W</span> {whiteName}
                          </div>
                          <div className={`font-semibold ${!isWhite ? "text-white" : "text-[var(--text-secondary)]"}`}>
                            <span className="text-[10px] bg-black/40 border border-white/10 px-1 rounded mr-1">B</span> {blackName}
                          </div>
                        </Link>
                      </td>
                      
                      <td className="p-4 hidden sm:table-cell">
                        <Link href={`/game/${g.id}`}>
                          {g.status === 'playing' ? (
                            <span className="badge badge-blue">Live</span>
                          ) : (
                            <span className={`badge ${won ? 'badge-green' : lost ? 'bg-red-500/20 text-red-300' : 'badge-secondary'}`}>
                              {won ? 'Won' : lost ? 'Lost' : 'Draw'}
                            </span>
                          )}
                        </Link>
                      </td>
                      
                      <td className="p-4 hidden md:table-cell">
                        {accuracy !== null && accuracy !== undefined ? (
                          <div className="flex items-center gap-2">
                            <span className="font-bold tabular-nums text-[var(--accent)]">{Number(accuracy).toFixed(1)}</span>
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)] text-sm">-</span>
                        )}
                      </td>
                      
                      <td className="p-4 text-right text-[var(--text-secondary)] tabular-nums font-mono text-sm">
                        {formatTime(g.timeControl)}{g.increment ? `+${g.increment}` : ""}
                      </td>
                      
                      <td className="p-4 text-right text-[var(--text-secondary)] text-sm whitespace-nowrap">
                        <Link href={`/game/${g.id}`} className="hover:text-white transition-colors">
                          {new Date(g.createdAt).toLocaleDateString()}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function StatBox({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-[var(--bg-input)] rounded-lg p-3 border border-transparent">
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">{title}</div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}
