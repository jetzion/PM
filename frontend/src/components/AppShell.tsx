"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Workspace } from "@/components/Workspace";
import { authApi, type User } from "@/lib/api";
import { errorMessage, inputClassName, labelClassName } from "@/lib/ui";

type Mode = "sign-in" | "register";

export const AppShell = () => {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<Mode>("sign-in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsReady(true));
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const submit = mode === "sign-in" ? authApi.login : authApi.register;
      setUser(await submit(username.trim(), password));
      setUsername("");
      setPassword("");
    } catch (err) {
      setError(errorMessage(err, "Unable to sign in."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSessionEnded = () => {
    sessionStorage.clear();
    setUser(null);
  };

  const handleLogout = async () => {
    await authApi.logout().catch(() => undefined);
    handleSessionEnded();
  };

  const switchMode = () => {
    setMode(mode === "sign-in" ? "register" : "sign-in");
    setError("");
  };

  if (!isReady) {
    return null;
  }

  if (user) {
    return <Workspace user={user} onLogout={handleLogout} onSessionEnded={handleSessionEnded} />;
  }

  const isSignIn = mode === "sign-in";

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white/85 p-8 shadow-[var(--shadow)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Kanban Studio
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
          {isSignIn ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
          {isSignIn
            ? "Sign in to open your project boards."
            : "Pick a username and a password of at least 8 characters."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="username" className={labelClassName}>
              Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={inputClassName}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className={labelClassName}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClassName}
              autoComplete={isSignIn ? "current-password" : "new-password"}
              required
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {isSignIn ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--gray-text)]">
          {isSignIn ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={switchMode}
            className="font-semibold text-[var(--primary-blue)] hover:underline"
          >
            {isSignIn ? "Create an account" : "Sign in instead"}
          </button>
        </p>
      </section>
    </main>
  );
};
