import type { Day, LatLng } from "./types";

/** The point a given step's incoming route segment starts from. */
export function pointBefore(day: Day, stepIndex: number): LatLng {
  return stepIndex === 0 ? day.startPoint : day.steps[stepIndex - 1];
}
