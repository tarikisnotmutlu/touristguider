"use client";

import { useState } from "react";
import { useTripStore } from "@/store/useTripStore";

/** There's no more per-trip URL to share — a session id, typed into the
 *  join screen, is the whole invite now. */
export default function ShareButton() {
  const [copied, setCopied] = useState(false);
  const sessionId = useTripStore((s) => s.trip.id);

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Share this session id:", sessionId);
    }
  }

  return (
    <button
      onClick={handleShare}
      type="button"
      title={`Copy session id: ${sessionId}`}
      className="flex shrink-0 items-center gap-1 rounded-full bg-sage-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-sage-700"
    >
      {copied ? "Session id copied ✅" : "🔗 Share"}
    </button>
  );
}
