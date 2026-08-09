import React from "react";
import Header from "@/components/Header";
import { db } from "@/db";
import { users } from "@/db/schema";
import { desc } from "drizzle-orm";
import LeaderboardClient from "./LeaderboardClient";

export const revalidate = 60; // Revalidate every 60 seconds

export default async function LeaderboardPage() {
  const [bullet, blitz, rapid, classical] = await Promise.all([
    db
      .select({ id: users.id, username: users.username, rating: users.bulletRating, wins: users.wins, losses: users.losses, draws: users.draws })
      .from(users).orderBy(desc(users.bulletRating)).limit(100),
    db
      .select({ id: users.id, username: users.username, rating: users.blitzRating, wins: users.wins, losses: users.losses, draws: users.draws })
      .from(users).orderBy(desc(users.blitzRating)).limit(100),
    db
      .select({ id: users.id, username: users.username, rating: users.rapidRating, wins: users.wins, losses: users.losses, draws: users.draws })
      .from(users).orderBy(desc(users.rapidRating)).limit(100),
    db
      .select({ id: users.id, username: users.username, rating: users.classicalRating, wins: users.wins, losses: users.losses, draws: users.draws })
      .from(users).orderBy(desc(users.classicalRating)).limit(100)
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-default)]">
      <Header />
      <main className="flex-1 px-4 py-8 md:px-8">
        <LeaderboardClient 
          bullet={bullet} 
          blitz={blitz} 
          rapid={rapid} 
          classical={classical} 
        />
      </main>
    </div>
  );
}
