import { Suspense } from "react";
import GameClient from "./GameClient";

export const dynamic = "force-dynamic";

export default function GamePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <span className="text-6xl animate-pulse">♟</span>
            <p className="mt-4 text-[var(--text-secondary)]">Loading game…</p>
          </div>
        </div>
      }
    >
      <GameClient />
    </Suspense>
  );
}
