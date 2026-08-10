"use client";

import { useState, useEffect } from "react";

export default function OnlinePlayers() {
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    // Generate a pseudo-random number of online players that changes slowly
    const getCount = () => {
      const now = new Date();
      // Base count depends on the hour of the day (peak at 20:00 UTC)
      const hour = now.getUTCHours();
      const peak = 20;
      const dist = Math.abs(hour - peak);
      const baseCount = 5000 - (dist * 150);
      
      // Add some random noise (-50 to +50)
      const noise = Math.floor(Math.random() * 100) - 50;
      return baseCount + noise;
    };

    setOnlineCount(getCount());
    const interval = setInterval(() => {
      setOnlineCount(getCount());
    }, 15000); // update every 15 seconds

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
