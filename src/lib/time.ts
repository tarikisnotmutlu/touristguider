import type { Day, Step } from "./types";

export function parseHHMM(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToHHMM(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = Math.round(wrapped % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Recomputes arrival/departure for every step in a day, in order. Travel time for
 * segment i comes from routes[i].durationMin (falling back to 0 while unknown so the
 * timeline still renders before OSRM/estimate data arrives).
 */
export function recomputeDayTimes(day: Day): Step[] {
  let clock = parseHHMM(day.startTime);
  const steps: Step[] = [];
  for (let i = 0; i < day.steps.length; i++) {
    const travel = day.routes[i]?.durationMin ?? 0;
    clock += travel;
    const arrival = minutesToHHMM(clock);
    clock += day.steps[i].durationMin;
    const departure = minutesToHHMM(clock);
    steps.push({ ...day.steps[i], arrival, departure });
  }
  return steps;
}

/** Sums the distance of walking legs whose destination stop has been checked
 *  off — used to simulate "steps taken so far" for the fatigue meter. */
export function completedWalkingMeters(day: Day): number {
  return day.routes.reduce((sum, route, i) => {
    const destination = day.steps[i];
    if (route.mode !== "walk" || !destination?.completed) return sum;
    return sum + (route.distanceM ?? 0);
  }, 0);
}
