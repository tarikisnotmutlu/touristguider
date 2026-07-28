import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type { Trip } from "./types";

const PARAM = "data";

export function encodeTripForUrl(trip: Trip): string {
  return compressToEncodedURIComponent(JSON.stringify(trip));
}

export function decodeTripFromUrl(encoded: string): Trip | null {
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    return JSON.parse(json) as Trip;
  } catch {
    return null;
  }
}

export function buildShareUrl(trip: Trip): string {
  const params = new URLSearchParams(window.location.search);
  params.set(PARAM, encodeTripForUrl(trip));
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

export function readTripFromLocation(): Trip | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get(PARAM);
  if (!encoded) return null;
  return decodeTripFromUrl(encoded);
}
