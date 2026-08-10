"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function Header() {
  const pathname = usePathname();
  const isGamePage = pathname?.startsWith("/game/");
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  
  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg-card)] relative z-50">
      <div className="mx-auto max-w-7xl px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 mr-2">
            <Image src="/pieces/Chess_klt45.svg" alt="Logo" width={28} height={28} className="drop-shadow-md" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] bg-clip-text text-transparent tracking-tight">
              Sissa
            </h1>
          </Link>
          
          <nav className="hidden md:flex items-center gap-1">
            <Link href="/" className={`px-3 py-1.5 rounded-sm text-sm font-semibold transition-colors ${!isGamePage && pathname === "/" ? "bg-white/10 text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"}`}>Play</Link>
            <Link href="/games" className={`px-3 py-1.5 rounded-sm text-sm font-semibold transition-colors ${pathname === "/games" ? "bg-white/10 text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"}`}>Watch</Link>
            <Link href="/analysis" className={`px-3 py-1.5 rounded-sm text-sm font-semibold transition-colors ${pathname === "/analysis" ? "bg-white/10 text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"}`}>Analysis</Link>
            <Link href="/leaderboard" className={`px-3 py-1.5 rounded-sm text-sm font-semibold transition-colors ${pathname === "/leaderboard" ? "bg-white/10 text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"}`}>Leaderboard</Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3">
            {loading ? (
              <div className="w-20 h-6 bg-[var(--border)] rounded animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-4">
                <Link href={`/profile/${encodeURIComponent(user.username)}`} className="flex items-center gap-2 text-[var(--text-primary)] hover:text-[var(--text-primary)] transition-colors group">
                  <span className="text-sm font-bold group-hover:underline">{user.username}</span>
                </Link>
                <button onClick={() => logout()} className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-red-400 transition-colors">Logout</button>
              </div>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Log In</Link>
                <Link href="/signup" className="text-sm font-medium px-4 py-1.5 bg-[var(--bg-input)] hover:bg-white/10 text-[var(--text-primary)] rounded-sm border border-[var(--border)] transition-colors">Sign Up</Link>
              </>
            )}
          </div>
          
          <button 
            className="md:hidden p-2 -mr-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {menuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </>
              ) : (
                <>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-[var(--border)] bg-[var(--bg-card)] absolute top-full left-0 w-full shadow-xl">
          <div className="px-4 py-2 flex flex-col">
            <Link href="/" onClick={() => setMenuOpen(false)} className="py-3 border-b border-[var(--border)] text-sm font-semibold text-[var(--text-primary)]">Play</Link>
            <Link href="/games" onClick={() => setMenuOpen(false)} className="py-3 border-b border-[var(--border)] text-sm font-semibold text-[var(--text-primary)]">Watch</Link>
            <Link href="/analysis" onClick={() => setMenuOpen(false)} className="py-3 border-b border-[var(--border)] text-sm font-semibold text-[var(--text-primary)]">Analysis</Link>
            <Link href="/leaderboard" onClick={() => setMenuOpen(false)} className="py-3 border-b border-[var(--border)] text-sm font-semibold text-[var(--text-primary)]">Leaderboard</Link>
            
            <div className="pt-4 pb-2">
              {loading ? (
                <div className="w-20 h-6 bg-[var(--border)] rounded animate-pulse" />
              ) : user ? (
                <div className="flex items-center justify-between">
                  <Link 
                    href={`/profile/${encodeURIComponent(user.username)}`} 
                    onClick={() => setMenuOpen(false)}
                    className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2"
                  >
                    <span className="w-6 h-6 bg-[var(--accent)] text-white rounded flex items-center justify-center text-xs">{user.username[0].toUpperCase()}</span>
                    {user.username}
                  </Link>
                  <button onClick={() => { logout(); setMenuOpen(false); }} className="text-xs font-semibold uppercase tracking-wider text-red-400">Logout</button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link href="/login" onClick={() => setMenuOpen(false)} className="btn btn-secondary py-2 text-center text-sm">Log In</Link>
                  <Link href="/signup" onClick={() => setMenuOpen(false)} className="btn btn-primary py-2 text-center text-sm">Sign Up</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
