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
      <div className="mx-auto max-w-7xl px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 mr-2">
            <Image src="/pieces/Chess_klt45.svg" alt="Logo" width={28} height={28} className="drop-shadow-md" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] bg-clip-text text-transparent tracking-tight">
              Sissa
            </h1>
          </Link>
          
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/"
              className={`px-3 py-1.5 rounded-sm text-sm font-semibold transition-colors ${
                !isGamePage && pathname === "/"
                  ? "bg-white/10 text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
              }`}
            >
              Play
            </Link>
            <Link
              href="/games"
              className={`px-3 py-1.5 rounded-sm text-sm font-semibold transition-colors ${
                pathname === "/games"
                  ? "bg-white/10 text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
              }`}
            >
              Watch
            </Link>
            <Link
              href="/analysis"
              className={`px-3 py-1.5 rounded-sm text-sm font-semibold transition-colors ${
                pathname === "/analysis"
                  ? "bg-white/10 text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
              }`}
            >
              Analysis
            </Link>
            <Link
              href="/leaderboard"
              className={`px-3 py-1.5 rounded-sm text-sm font-semibold transition-colors ${
                pathname === "/leaderboard"
                  ? "bg-white/10 text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
              }`}
            >
              Leaderboard
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {loading ? (
            <div className="w-20 h-6 bg-[var(--border)] rounded animate-pulse" />
          ) : (
            <div className="flex items-center gap-3">
              {user ? (
                <div className="flex items-center gap-4">
                  <Link 
                    href={`/profile/${encodeURIComponent(user.username)}`}
                    className="flex items-center gap-2 text-[var(--text-primary)] hover:text-[var(--text-primary)] transition-colors group"
                  >
                    <span className="text-sm font-bold group-hover:underline">{user.username}</span>
                  </Link>
                  <button 
                    onClick={() => logout()}
                    className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-red-400 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <>
                  <Link href="/login" className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Log In</Link>
                  <Link href="/signup" className="text-sm font-medium px-4 py-1.5 bg-[var(--bg-input)] hover:bg-white/10 text-[var(--text-primary)] rounded-sm border border-[var(--border)] transition-colors">Sign Up</Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
