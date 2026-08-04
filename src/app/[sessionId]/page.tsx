"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPlayerName, getSessionId } from "@/lib/session";
import TripLoader from "@/components/TripLoader";
import LoadingSpinner from "@/components/LoadingSpinner";

/**
 * The live game board — but strictly gated behind having actually come
 * through the lobby's password-gated join flow at "/". Typing a session id
 * straight into the URL bar (or bookmarking a link) without a matching
 * localStorage identity must never render TripLoader/AppShell, even for a
 * single frame — `authorized` starts false and only ever flips true from
 * inside the mount effect below, after the check passes.
 */
export default function SessionPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  const urlSessionId = params.sessionId;

  useEffect(() => {
    const storedSessionId = getSessionId();
    const storedPlayerName = getPlayerName();
    if (!storedPlayerName || !storedSessionId || storedSessionId !== urlSessionId) {
      router.replace("/?error=unauthorized");
      return;
    }
    const timer = setTimeout(() => setAuthorized(true), 0);
    return () => clearTimeout(timer);
  }, [urlSessionId, router]);

  if (!authorized) {
    return <LoadingSpinner label="Checking session…" />;
  }

  return <TripLoader sessionId={urlSessionId} />;
}
