import type { Trip } from "./types";

export async function fetchTrip(id: string): Promise<Trip | null> {
  const res = await fetch(`/api/trips/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export async function saveTrip(trip: Trip): Promise<boolean> {
  const res = await fetch(`/api/trips/${trip.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(trip),
  });
  return res.ok;
}
