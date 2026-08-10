"use client";

import { useState, useEffect } from "react";

export default function OnlinePlayers() {
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    const fetchOnline = async () => {
      try {
        const res = await fetch("/api/online-players");
        if (res.ok) {
          const data = await res.json();
          setOnlineCount(data.count || 0);
        }
      } catch {
        // Silent failure
      }
    };

    fetchOnline();
    const interval = setInterval(fetchOnline, 15000); // update every 15 seconds

    return () => clearInterval(interval);
  }, []);

  if (onlineCount === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-[var(--bg-card)] border border-[var(--border)] shadow-lg rounded-full px-3 py-1.5 flex items-center gap-2 z-50 pointer-events-none">
      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      <span className="text-xs font-bold text-[var(--text-primary)]">
        {onlineCount.toLocaleString()} Online
      </span>
    </div>
  );
}
