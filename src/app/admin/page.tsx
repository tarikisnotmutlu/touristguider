"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getLastTripId } from "@/lib/localTrips";

/** A bare /admin has no trip to scope the dashboard to — bounce to whichever
 *  trip this browser last viewed (see the "t/[id]" flow this mirrors), or
 *  home if it has never opened one. */
export default function AdminIndexPage() {
  const router = useRouter();

  useEffect(() => {
    const id = getLastTripId();
    router.replace(id ? `/admin/${id}` : "/");
  }, [router]);

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-stone-50 text-stone-400">
      Loading…
    </div>
  );
}
