"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();
  const isGamePage = pathname?.startsWith("/game/");
  
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
        </nav>
      </div>
    </header>
  );
}
