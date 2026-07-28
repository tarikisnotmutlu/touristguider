"use client";

import { useState } from "react";

export default function ShareButton() {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = window.location.href;
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
      className="flex shrink-0 items-center gap-1 rounded-full bg-sage-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-sage-700"
    >
      {copied ? "Link copied ✅" : "🔗 Share"}
    </button>
  );
}
