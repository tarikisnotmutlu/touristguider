"use client";

/** Full-screen, glassmorphism-matching loading state — used everywhere the
 *  app is waiting on something async before it can show real content
 *  (checking a session id, verifying a nickname, fetching the initial
 *  itinerary), instead of a plain "Loading…" line of text. */
export default function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-stone-50 p-4">
      <div className="glass-panel flex flex-col items-center gap-4 rounded-3xl px-9 py-8 shadow-2xl">
        <div
          className="h-11 w-11 animate-spin rounded-full border-[3px] border-stone-200 border-t-sage-600"
          role="status"
          aria-label="Loading"
        />
        {label && <p className="text-sm font-medium tracking-tight text-stone-500">{label}</p>}
      </div>
    </div>
  );
}
