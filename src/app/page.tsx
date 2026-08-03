"use client";

import OnboardingGate from "@/components/OnboardingGate";

/** The single entry point — no more per-trip URLs. OnboardingGate blocks
 *  everything (map, Firestore reads, telemetry) behind a nickname + session
 *  id prompt, then mounts TripLoader itself once both are set. */
export default function Home() {
  return <OnboardingGate />;
}
