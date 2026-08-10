import { db } from "@/db";
import { users, games } from "@/db/schema";
import { eq, or, desc, ilike } from "drizzle-orm";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Link from "next/link";
import { formatTime } from "@/lib/utils";
import ProfileSettings from "@/components/ProfileSettings";
import { User } from "@/components/AuthProvider";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const decodedUsername = decodeURIComponent(username);

  // Fetch user (case-insensitive)
  const userResults = await db.select().from(users).where(ilike(users.username, decodedUsername)).limit(1);
  if (userResults.length === 0) {
    return notFound();
  }
  const user = userResults[0];

  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = token ? await verifyToken(token) : null;
  const isOwnProfile = session?.username === user.username;

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
          <div className="w-24 h-24 shrink-0 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] shadow-xl shadow-orange-500/10 flex items-center justify-center text-4xl font-bold text-[var(--text-primary)] uppercase">
            {user.username.substring(0, 2)}
          </div>
          
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">{user.username}</h1>
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
          
          <div className="shrink-0 card bg-[var(--bg-input)] border-transparent w-full md:w-auto p-5 flex flex-col items-center justify-center">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">Win Rate</div>
            <div className="text-4xl font-black text-[var(--text-primary)]">{winRate}%</div>
            <div className="text-xs text-[var(--text-secondary)] mt-1">{totalGames} games</div>
            <div className="flex items-center gap-3 text-sm font-bold mt-4 bg-[#1e1e1e] px-3 py-1.5 rounded-md shadow-inner">
              <span className="text-green-500 flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-green-500" />{user.wins}</span>
              <span className="text-gray-400 flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-gray-400" />{user.draws}</span>
              <span className="text-red-500 flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-red-500" />{user.losses}</span>
            </div>
          </div>
        </div>

        {/* Game History */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4 px-1 text-[var(--text-primary)] flex items-center gap-2">
            <span>⚔️</span> Recent Games
          </h2>
          
          {recentGames.length === 0 ? (
            <div className="card p-12 text-center text-[var(--text-secondary)]">
              No games played yet.
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)] uppercase tracking-wider bg-[var(--bg-input)]">
                      <th className="p-4 font-medium pl-6">Result</th>
                      <th className="p-4 font-medium">Opponent</th>
                      <th className="p-4 font-medium">Time Control</th>
                      <th className="p-4 font-medium">Accuracy</th>
                      <th className="p-4 font-medium text-right pr-6">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {recentGames.map((game) => {
                      const isWhite = game.whitePlayerId === user.id;
                      const opponent = isWhite ? game.blackPlayerName : game.whitePlayerName;
                      
                      let resultText = "Draw";
                      let resultColor = "bg-gray-600 text-gray-100";
                      
                      if (game.winner === "w") {
                        resultText = isWhite ? "Won" : "Lost";
                        resultColor = isWhite ? "bg-green-600/90 text-[var(--text-primary)]" : "bg-red-600/90 text-[var(--text-primary)]";
                      } else if (game.winner === "b") {
                        resultText = !isWhite ? "Won" : "Lost";
                        resultColor = !isWhite ? "bg-green-600/90 text-[var(--text-primary)]" : "bg-red-600/90 text-[var(--text-primary)]";
                      } else if (game.status === "aborted") {
                        resultText = "Aborted";
                        resultColor = "bg-yellow-600/80 text-[var(--text-primary)]";
                      }

                      // Accuracy logic (assuming analysis has .whiteAccuracy or .blackAccuracy)
                      let accuracy = null;
                      if (game.analysis) {
                        try {
                          const parsed = typeof game.analysis === "string" ? JSON.parse(game.analysis) : game.analysis;
                          accuracy = isWhite ? parsed.whiteAccuracy : parsed.blackAccuracy;
                        } catch {}
                      }

                      return (
                        <tr key={game.id} className="hover:bg-white/[0.03] transition-colors group">
                          <td className="p-4 pl-6 font-medium">
                            <span className={`inline-flex px-2 py-1 rounded text-xs font-bold tracking-wide ${resultColor}`}>
                              {resultText}
                            </span>
                          </td>
                          <td className="p-4">
                            <Link href={`/game/${game.id}`} className="flex items-center gap-3">
                              <span className={`w-3 h-3 shrink-0 rounded-sm ${isWhite ? 'bg-white shadow-sm' : 'bg-gray-800 border border-gray-600'}`} />
                              <span className="font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                                {opponent || "Anonymous"} 
                              </span>
                            </Link>
                          </td>
                          <td className="p-4 text-[var(--text-secondary)] font-mono text-sm">
                            {formatTime(game.timeControl)}{game.increment ? `+${game.increment}` : ""}
                          </td>
                          <td className="p-4">
                            {accuracy !== null && accuracy !== undefined ? (
                              <span className="text-sm font-bold text-[var(--accent)]">{Number(accuracy).toFixed(1)}%</span>
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">-</span>
                            )}
                          </td>
                          <td className="p-4 text-right text-[var(--text-muted)] text-sm pr-6">
                            {new Date(game.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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
        
        {isOwnProfile && <ProfileSettings username={user.username} />}

      </main>
    </div>
  );
}

function StatBox({ title, value }: { title: string; value: number }) {
  return (
    <div className="card bg-[var(--bg-input)] border-transparent p-3 flex flex-col items-center justify-center h-full">
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">{title}</div>
      <div className="text-lg font-bold text-[var(--text-primary)]">
        {value === 1500 ? "?" : value}
      </div>
    </div>
  );
}
