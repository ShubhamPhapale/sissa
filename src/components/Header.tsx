"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function Header() {
  const pathname = usePathname();
  const isGamePage = pathname?.startsWith("/game/");
  const { user, loading, logout } = useAuth();
  
  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg-card)]">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/pieces/Chess_klt45.svg" alt="Logo" width={28} height={28} className="drop-shadow-md" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-[var(--accent)] to-orange-500 bg-clip-text text-transparent">
              Sissa
            </h1>
          </Link>
        </div>
        
        <nav className="flex items-center gap-4">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              !isGamePage
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Play
          </Link>
          <Link
            href="/games"
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pathname === "/games"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Games
          </Link>
          <Link
            href="/analysis"
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pathname === "/analysis"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Analysis Board
          </Link>
          <Link
            href="/leaderboard"
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pathname === "/leaderboard"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Leaderboard
          </Link>

          {!loading && (
            <div className="ml-4 pl-4 border-l border-white/10 flex items-center gap-3">
              {user ? (
                <>
                  <div className="flex flex-col items-end leading-tight">
                    <span className="text-sm font-bold text-white">{user.username}</span>
                    <span className="text-xs text-[var(--text-muted)]">{user.rating} ELO</span>
                  </div>
                  <button 
                    onClick={() => logout()}
                    className="text-xs font-semibold uppercase tracking-wider text-red-400 hover:text-red-300 ml-2"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-sm text-[var(--text-secondary)] hover:text-white transition-colors">Log In</Link>
                  <Link href="/signup" className="text-sm px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded transition-colors">Sign Up</Link>
                </>
              )}
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
