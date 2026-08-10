"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SettingsPage() {
  const { user, loading, logout, setUser } = useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
        <h2 className="text-2xl font-bold mb-4">You are not logged in</h2>
        <p className="text-[var(--text-secondary)] mb-8">Please log in to manage your settings.</p>
        <Link href="/login" className="btn btn-primary w-full py-3">Log In</Link>
      </div>
    );
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!currentPassword) {
      setError("Current password is required to make changes");
      return;
    }

    if (!newUsername && !newPassword) {
      setError("Please provide a new username or password to update");
      return;
    }

    setIsUpdating(true);
    try {
      const payload: any = { currentPassword };
      if (newUsername) payload.username = newUsername;
      if (newPassword) payload.password = newPassword;

      const res = await fetch("/api/auth/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile");
      }

      setSuccess("Profile updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setNewUsername("");
      if (data.user) {
        setUser(data.user);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <div className="flex-1 py-12 px-4 bg-gradient-to-b from-[var(--bg-main)] to-black/40">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold mb-8">Settings</h1>

        <div className="card p-6 md:p-8 mb-8">
          <h2 className="text-xl font-bold mb-6">Update Profile</h2>
          
          <form onSubmit={handleUpdate} className="flex flex-col gap-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-3 rounded text-sm">
                {success}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input w-full"
                placeholder="Required to make changes"
              />
            </div>

            <hr className="border-[var(--border)] my-2" />

            <div>
              <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                New Username (Optional)
              </label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="input w-full"
                placeholder={user.username}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                New Password (Optional)
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input w-full"
                placeholder="New password"
              />
            </div>

            <button
              type="submit"
              disabled={isUpdating || !currentPassword || (!newUsername && !newPassword)}
              className="btn btn-primary w-full py-3 mt-2 disabled:opacity-50"
            >
              {isUpdating ? "Updating..." : "Save Changes"}
            </button>
          </form>
        </div>

        <div className="card p-6 md:p-8 border-red-900/30">
          <h2 className="text-xl font-bold mb-4 text-red-500">Danger Zone</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Log out of your account on this device.
          </p>
          <button
            onClick={handleLogout}
            className="w-full py-3 rounded-lg font-bold border border-red-500/50 text-red-500 hover:bg-red-500/10 transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
