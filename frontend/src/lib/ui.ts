import { ApiError } from "@/lib/api";

export const labelClassName =
  "text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]";

export const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const errorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;
