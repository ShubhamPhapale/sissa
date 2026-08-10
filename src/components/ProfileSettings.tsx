"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export default function ProfileSettings({ username }: { username: string }) {
  const router = useRouter();
  const { user, setUser } = useAuth();
  
  const [newUsername, setNewUsername] = useState(username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Only render if logged in user is the owner
  if (!user || user.username !== username) return null;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setError("Current password is required");
      return;
    }
    
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/auth/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          username: newUsername !== username ? newUsername : undefined, 
          password: password ? password : undefined,
          currentPassword
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Update failed");
      } else {
        setSuccess("Profile updated successfully");
        setPassword("");
        if (data.user) {
          setUser(data.user);
          if (data.user.username !== username) {
            // Redirect to new profile URL
            router.push(`/profile/${encodeURIComponent(data.user.username)}`);
          }
        }
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6 mt-8">
      <h2 className="text-xl font-bold mb-4">Account Settings</h2>
      <form onSubmit={handleUpdate} className="space-y-4 max-w-md">
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Username</label>
          <input
            type="text"
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            minLength={3}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Current Password (required to save changes)</label>
          <input
            type="password"
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">New Password (leave blank to keep current)</label>
          <input
            type="password"
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-green-400 text-sm">{success}</p>}

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          {loading ? "Updating..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
