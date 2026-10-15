"use client";

import { useState, type FormEvent } from "react";
import { authApi } from "@/lib/api";
import { errorMessage } from "@/lib/ui";

type AccountPanelProps = {
  onClose: () => void;
  onSessionEnded: () => void;
};

const fieldClassName =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const AccountPanel = ({ onClose, onSessionEnded }: AccountPanelProps) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const handleLogoutAll = async () => {
    await authApi.logoutAll();
    onSessionEnded();
  };

  const handleDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await authApi.deleteAccount(deletePassword);
      onSessionEnded();
    } catch (err) {
      setDeleteError(errorMessage(err, "Unable to delete the account."));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setStatus({ ok: true, text: "Password updated." });
    } catch (err) {
      setStatus({ ok: false, text: errorMessage(err, "Unable to change the password.") });
    }
  };

  return (
    <section aria-label="Account settings" className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--navy-dark)]">Change password</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
        >
          Done
        </button>
      </div>
      <form onSubmit={handleSubmit} className="mt-3 space-y-2">
        <input
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          aria-label="Current password"
          placeholder="Current password"
          autoComplete="current-password"
          className={fieldClassName}
          required
        />
        <input
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          aria-label="New password"
          placeholder="New password"
          autoComplete="new-password"
          className={fieldClassName}
          required
        />
        {status ? (
          <p
            role="status"
            className={
              status.ok ? "text-sm text-[var(--primary-blue)]" : "text-sm text-red-700"
            }
          >
            {status.text}
          </p>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-full bg-[var(--secondary-purple)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          Update password
        </button>
      </form>

      <div className="mt-4 space-y-2 border-t border-[var(--stroke)] pt-4">
        <button
          type="button"
          onClick={handleLogoutAll}
          className="w-full rounded-full border border-[var(--stroke)] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
        >
          Sign out everywhere
        </button>
        {isDeleting ? (
          <form onSubmit={handleDelete} className="space-y-2">
            <p className="text-xs font-semibold text-red-700">
              This permanently deletes your account and every board.
            </p>
            <input
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              aria-label="Confirm password to delete"
              placeholder="Password"
              autoComplete="current-password"
              className={fieldClassName}
              required
            />
            {deleteError ? (
              <p role="alert" className="text-sm text-red-700">
                {deleteError}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-full bg-red-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white"
              >
                Delete forever
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDeleting(false);
                  setDeletePassword("");
                  setDeleteError("");
                }}
                className="flex-1 rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsDeleting(true)}
            className="w-full rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wide text-red-700 transition hover:bg-red-50"
          >
            Delete account
          </button>
        )}
      </div>
    </section>
  );
};
