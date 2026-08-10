const activeSessions = new Map<string, number>();

// Clean up sessions older than 30 seconds
const SESSION_TIMEOUT_MS = 30000;

export function trackUser(id: string) {
  activeSessions.set(id, Date.now());
}

export function getOnlineCount(): number {
  const now = Date.now();
  let count = 0;
  for (const [id, lastSeen] of activeSessions.entries()) {
    if (now - lastSeen > SESSION_TIMEOUT_MS) {
      activeSessions.delete(id);
    } else {
      count++;
    }
  }
  return count;
}
