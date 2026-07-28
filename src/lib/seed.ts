import type { Day, RouteSegment, Step, TransportMode, Trip } from "./types";
import { estimateDurationMin, haversineMeters } from "./geo";
import { recomputeDayTimes } from "./time";
import { genId } from "./id";

interface SeedStop {
  name: string;
  lat: number;
  lng: number;
  durationMin: number;
  mode: TransportMode;
  checklist?: string[];
  notes?: string;
}

interface SeedDay {
  label: string;
  startTime: string;
  startPoint: { name: string; lat: number; lng: number };
  stops: SeedStop[];
}

function makeSeedRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }, mode: TransportMode): RouteSegment {
  const distanceM = haversineMeters(from, to);
  return {
    mode,
    distanceM,
    durationMin: estimateDurationMin(distanceM, mode),
    isManual: false,
    manualWaypoints: [],
    geometry: [from, to],
    resetNonce: 0,
  };
}

function buildDay(seed: SeedDay): Day {
  const steps: Step[] = seed.stops.map((s) => ({
    id: genId(),
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    durationMin: s.durationMin,
    notes: s.notes ?? "",
    checklist: (s.checklist ?? []).map((label) => ({ id: genId(), label, done: false })),
  }));

  const routes: RouteSegment[] = steps.map((step, i) => {
    const from = i === 0 ? seed.startPoint : seed.stops[i - 1];
    return makeSeedRoute(from, step, seed.stops[i].mode);
  });

  const day: Day = {
    id: genId(),
    label: seed.label,
    startTime: seed.startTime,
    startPoint: seed.startPoint,
    steps,
    routes,
  };
  day.steps = recomputeDayTimes(day);
  return day;
}

export function createDemoTrip(): Trip {
  const days: SeedDay[] = [
    {
      label: "Day 1",
      startTime: "09:30",
      startPoint: { name: "Sultanahmet Tram Stop", lat: 41.0056, lng: 28.9769 },
      stops: [
        {
          name: "Hagia Sophia",
          lat: 41.0086,
          lng: 28.9802,
          durationMin: 75,
          mode: "walk",
          checklist: ["Marvel at the dome", "Spot the Viking runes", "Grab a coffee outside"],
        },
        {
          name: "Blue Mosque",
          lat: 41.0054,
          lng: 28.9768,
          durationMin: 45,
          mode: "walk",
          checklist: ["Cover shoulders/knees", "Look up at the six minarets"],
        },
        {
          name: "Topkapi Palace",
          lat: 41.0115,
          lng: 28.9833,
          durationMin: 90,
          mode: "walk",
          checklist: ["See the Imperial Treasury", "Harem tour (extra ticket)"],
        },
        {
          name: "Grand Bazaar",
          lat: 41.0106,
          lng: 28.9681,
          durationMin: 60,
          mode: "walk",
          checklist: ["Haggle for a lamp", "Try Turkish delight samples"],
          notes: "Bring cash, card fees are steep here.",
        },
      ],
    },
    {
      label: "Day 2",
      startTime: "10:00",
      startPoint: { name: "Taksim Square", lat: 41.037, lng: 28.985 },
      stops: [
        {
          name: "Istiklal Street",
          lat: 41.0334,
          lng: 28.9779,
          durationMin: 60,
          mode: "walk",
          checklist: ["Ride the nostalgic tram"],
        },
        {
          name: "Galata Tower",
          lat: 41.0256,
          lng: 28.9741,
          durationMin: 50,
          mode: "walk",
          checklist: ["Sunset view from the top"],
        },
        {
          name: "Karaköy Pier",
          lat: 41.0246,
          lng: 28.9754,
          durationMin: 10,
          mode: "walk",
        },
        {
          name: "Kadıköy (Asian side)",
          lat: 40.991,
          lng: 29.0281,
          durationMin: 120,
          mode: "ferry",
          checklist: ["Wander the Tuesday/Friday market", "Try a fish sandwich"],
          notes: "Ferries run roughly every 20-30 min from Karaköy.",
        },
      ],
    },
    {
      label: "Day 3",
      startTime: "09:00",
      startPoint: { name: "Eminönü Pier", lat: 41.0175, lng: 28.97 },
      stops: [
        {
          name: "Üsküdar",
          lat: 41.0225,
          lng: 29.011,
          durationMin: 40,
          mode: "ferry",
          checklist: ["Photo of the Maiden's Tower"],
        },
        {
          name: "Çamlıca Hill",
          lat: 41.0356,
          lng: 29.07,
          durationMin: 70,
          mode: "drive",
          checklist: ["Panoramic Bosphorus view", "Turkish tea at the tea garden"],
        },
        {
          name: "Beylerbeyi Palace",
          lat: 41.0447,
          lng: 29.0431,
          durationMin: 60,
          mode: "drive",
        },
        {
          name: "Ortaköy",
          lat: 41.0473,
          lng: 29.0272,
          durationMin: 60,
          mode: "bus",
          checklist: ["Kumpir (loaded baked potato)", "Photo with the Bosphorus Bridge"],
        },
      ],
    },
    {
      label: "Day 4",
      startTime: "10:30",
      startPoint: { name: "Karaköy", lat: 41.0256, lng: 28.9744 },
      stops: [
        {
          name: "Cihangir",
          lat: 41.0319,
          lng: 28.9829,
          durationMin: 60,
          mode: "cycle",
          checklist: ["Browse the vintage shops"],
        },
        {
          name: "Beşiktaş Waterfront",
          lat: 41.0422,
          lng: 29.0072,
          durationMin: 50,
          mode: "cycle",
        },
        {
          name: "Dolmabahçe Palace",
          lat: 41.0392,
          lng: 29.0002,
          durationMin: 90,
          mode: "walk",
          checklist: ["Crystal staircase", "Clock collection"],
        },
        {
          name: "Airport transfer point",
          lat: 41.0,
          lng: 28.82,
          durationMin: 0,
          mode: "metro",
          notes: "Buffer time built in for check-in — don't linger too long at the palace!",
        },
      ],
    },
  ];

  return {
    id: genId(),
    title: "Istanbul, 4 Days",
    friendName: "Alex",
    days: days.map(buildDay),
  };
}
