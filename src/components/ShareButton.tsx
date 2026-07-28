"use client";

import { useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import { buildShareUrl } from "@/lib/share";

export default function ShareButton() {
  const trip = useTripStore((s) => s.trip);
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = buildShareUrl(trip);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <button
      onClick={handleShare}
      type="button"
      className="flex shrink-0 items-center gap-1 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-indigo-700"
    >
      {copied ? "Link copied ✅" : "🔗 Share"}
    </button>
  );
}
