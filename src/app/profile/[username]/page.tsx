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
              <StatBox title="Bullet" value={user.bulletRating} icon="🚀" />
              <StatBox title="Blitz" value={user.blitzRating} icon="⚡" />
              <StatBox title="Rapid" value={user.rapidRating} icon="⏱️" />
              <StatBox title="Classical" value={user.classicalRating} icon="🐢" />
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
                    {recentGames.map((game) => {
                      const isWhite = game.whitePlayerId === user.id;
                      
                      // Result blocks
                      let userWon = false;
                      let isDraw = false;
                      if (game.winner === "draw") {
                        isDraw = true;
                      } else if ((game.winner === "w" && isWhite) || (game.winner === "b" && !isWhite)) {
                        userWon = true;
                      }
                      
                      const whiteScore = game.winner === "w" ? "1" : game.winner === "b" ? "0" : "½";
                      const blackScore = game.winner === "b" ? "1" : game.winner === "w" ? "0" : "½";

                      let resultBlock = null;
                      if (isDraw) {
                        resultBlock = <div className="w-4 h-4 bg-[#8c8a88] rounded-sm flex items-center justify-center text-[11px] font-bold text-white leading-none">=</div>;
                      } else if (userWon) {
                        resultBlock = <div className="w-4 h-4 bg-[#81b64c] rounded-sm flex items-center justify-center text-[11px] font-bold text-white leading-none">+</div>;
                      } else {
                        resultBlock = <div className="w-4 h-4 bg-[#cc3333] rounded-sm flex items-center justify-center text-[11px] font-bold text-white leading-none">-</div>;
                      }

                      // Accuracy logic
                      let whiteAcc = null;
                      let blackAcc = null;
                      if (game.analysis) {
                        try {
                          const parsed = typeof game.analysis === "string" ? JSON.parse(game.analysis) : game.analysis;
                          whiteAcc = parsed.whiteAccuracy;
                          blackAcc = parsed.blackAccuracy;
                        } catch {}
                      }

                      // Move count
                      const fenParts = game.fen.split(" ");
                      const fullMoveNumber = parseInt(fenParts[5] || "1", 10);
                      const turn = fenParts[1];
                      const moveCount = turn === "w" ? (fullMoveNumber - 1) * 2 : (fullMoveNumber - 1) * 2 + 1;
                      const displayMovesCount = Math.ceil(moveCount / 2); // full moves

                      // Time control icon
                      let icon = "⏱️";
                      let tcName = "Rapid";
                      if (game.timeControl < 180) {
                        icon = "🚀";
                        tcName = "Bullet";
                      } else if (game.timeControl < 600) {
                        icon = "⚡";
                        tcName = "Blitz";
                      }
                      
                      const tcText = game.timeControl < 60 ? `${game.timeControl}s` : `${game.timeControl / 60} min`;

                      return (
                        <tr key={game.id} className="hover:bg-white/[0.03] transition-colors group">
                          <td className="p-3 pl-6">
                            <div className="flex flex-col items-center justify-center text-[var(--text-secondary)]">
                              <span className="text-xl leading-none mb-1">{icon}</span>
                              <span className="text-xs whitespace-nowrap">{tcText}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <Link href={`/game/${game.id}`} className="flex flex-col gap-1 group-hover:opacity-80 transition-opacity">
                              <div className={`flex items-center gap-2 ${isWhite ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                                <div className="w-3 h-3 bg-white border border-gray-400 rounded-sm shadow-sm" />
                                <span>{game.whitePlayerName || "Anonymous"}</span>
                              </div>
                              <div className={`flex items-center gap-2 ${!isWhite ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                                <div className="w-3 h-3 bg-[#2b2b2b] border border-[#111] rounded-sm shadow-sm" />
                                <span>{game.blackPlayerName || "Anonymous"}</span>
                              </div>
                            </Link>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-3">
                              <div className="flex flex-col gap-1 text-[var(--text-primary)] font-mono text-sm leading-tight">
                                <span className={isWhite && userWon ? "font-bold" : ""}>{whiteScore}</span>
                                <span className={!isWhite && userWon ? "font-bold" : ""}>{blackScore}</span>
                              </div>
                              {resultBlock}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            {whiteAcc !== null && blackAcc !== null && whiteAcc !== undefined && blackAcc !== undefined ? (
                              <div className="flex flex-col gap-1 text-[var(--text-primary)] text-xs font-mono leading-tight">
                                <span>{Number(whiteAcc).toFixed(1)}</span>
                                <span>{Number(blackAcc).toFixed(1)}</span>
                              </div>
                            ) : (
                              <Link href={`/game/${game.id}`} className="text-xs text-[#3b82f6] font-bold hover:underline">
                                Review
                              </Link>
                            )}
                          </td>
                          <td className="p-3 text-center text-[var(--text-secondary)] font-mono">
                            {displayMovesCount}
                          </td>
                          <td className="p-3 text-right text-[var(--text-muted)] text-xs pr-6">
                            {new Date(game.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
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

function StatBox({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="card bg-[#1b1917]/50 border-transparent p-4 flex flex-col h-full rounded-xl hover:bg-[#1b1917]/80 transition-colors">
      <div className="flex items-start gap-4 mb-2">
        <div className="text-4xl">{icon}</div>
        <div className="flex flex-col">
          <div className="text-sm font-semibold text-[#a3a3a3]">{title}</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold text-white tracking-tight">
              {value === 1500 ? "?" : value}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
