"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { genId } from "@/lib/id";
import { getLastTripId } from "@/lib/localTrips";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const id = getLastTripId() ?? genId();
    router.replace(`/t/${id}`);
  }, [router]);

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-stone-50 text-stone-400">
      Loading itinerary…
    </div>
  );
}
