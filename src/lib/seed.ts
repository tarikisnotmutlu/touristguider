import type { Day, RouteSegment, Step, TransportMode, Trip } from "./types";
import { ROUTABLE_MODES } from "./types";
import type { PlaceCategory } from "./categories";
import { estimateDurationMin, haversineMeters } from "./geo";
import { recomputeDayTimes } from "./time";
import { genId } from "./id";

interface SeedStop {
  name: string;
  lat: number;
  lng: number;
  durationMin: number;
  mode: TransportMode;
  category: PlaceCategory;
  checklist?: string[];
  notes?: string;
}

/** A fresh, empty trip — used when there's nothing saved yet for a given link. */
export function createBlankTrip(): Trip {
  const today = new Date();
  const day = (n: number) => ({
    id: genId(),
    label: `Day ${n}`,
    startTime: "09:00",
    startPoint: { name: "Meeting point", lat: 41.0082, lng: 28.9784 },
    steps: [],
    routes: [],
  });
  return {
    id: genId(),
    title: `Trip — ${today.toLocaleDateString()}`,
    days: [day(1), day(2), day(3)],
    hiddenGems: [],
    unplanned: [],
  };
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
    // Walk/drive legs get their real geometry from MapView's OSRM fetch on
    // first render, same as any freshly-created route — see makeRoute() in
    // useTripStore.
    geometryResolved: !ROUTABLE_MODES.includes(mode),
    resetNonce: 0,
  };
}

function buildDay(seed: SeedDay): Day {
  const steps: Step[] = seed.stops.map((s) => ({
    id: genId(),
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    category: s.category,
    durationMin: s.durationMin,
    notes: s.notes ?? "",
    checklist: (s.checklist ?? []).map((label) => ({ id: genId(), label, done: false })),
    completed: false,
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
      startTime: "09:00",
      startPoint: { name: "Bozdoğan Su Kemeri", lat: 41.0158, lng: 28.955 },
      stops: [
        { name: "Bozdoğan Su Kemeri", lat: 41.0158, lng: 28.955, durationMin: 20, mode: "walk", category: "attraction" },
        { name: "Vefa Bozacısı", lat: 41.0156, lng: 28.9601, durationMin: 25, mode: "walk", category: "cafe" },
        { name: "Süleymaniye", lat: 41.0165, lng: 28.9639, durationMin: 45, mode: "walk", category: "mosque" },
        { name: "Mimar Sinan Roof", lat: 41.0158, lng: 28.9636, durationMin: 40, mode: "walk", category: "viewpoint" },
        { name: "Kapalı Çarşı", lat: 41.0106, lng: 28.9681, durationMin: 60, mode: "walk", category: "shop" },
        { name: "Kiki - Dayday Pastanesi", lat: 41.0104, lng: 28.9629, durationMin: 25, mode: "walk", category: "cafe" },
        { name: "Nuruosmaniye", lat: 41.009, lng: 28.9713, durationMin: 25, mode: "walk", category: "mosque" },
        { name: "Çemberlitaş", lat: 41.0087, lng: 28.97, durationMin: 15, mode: "walk", category: "attraction" },
        { name: "Kral Yolu - At Meydanı", lat: 41.0058, lng: 28.9755, durationMin: 30, mode: "walk", category: "attraction" },
        { name: "Sultanahmet ve Ayasofya", lat: 41.0086, lng: 28.9802, durationMin: 75, mode: "walk", category: "mosque" },
        { name: "Topkapı", lat: 41.0115, lng: 28.9833, durationMin: 90, mode: "walk", category: "museum" },
        { name: "Gülhane - Filibe Köftecisi", lat: 41.013, lng: 28.981, durationMin: 45, mode: "walk", category: "restaurant" },
        { name: "PTT Müzesi - Deutsche Orient Bank", lat: 41.0125, lng: 28.977, durationMin: 30, mode: "walk", category: "museum" },
        { name: "İstanbul Erkek Lisesi", lat: 41.0107, lng: 28.9645, durationMin: 20, mode: "walk", category: "attraction" },
        { name: "Rüstem Paşa - Mısır Çarşısı", lat: 41.0166, lng: 28.9702, durationMin: 45, mode: "walk", category: "mosque" },
        { name: "Balat", lat: 41.029, lng: 28.9487, durationMin: 60, mode: "transit", category: "attraction" },
      ],
    },
    {
      label: "Day 2",
      startTime: "10:00",
      startPoint: { name: "Karaköy", lat: 41.0256, lng: 28.9744 },
      stops: [
        { name: "Karaköy", lat: 41.0256, lng: 28.9744, durationMin: 30, mode: "walk", category: "attraction" },
        { name: "Salt Galata", lat: 41.0257, lng: 28.9738, durationMin: 40, mode: "walk", category: "museum" },
        { name: "Kamondo", lat: 41.0254, lng: 28.9737, durationMin: 10, mode: "walk", category: "attraction" },
        { name: "Bankalar Caddesi", lat: 41.0258, lng: 28.9739, durationMin: 20, mode: "walk", category: "attraction" },
        { name: "Tünel", lat: 41.0286, lng: 28.9744, durationMin: 15, mode: "walk", category: "attraction" },
        { name: "Galata Kulesi", lat: 41.0256, lng: 28.9741, durationMin: 45, mode: "walk", category: "viewpoint" },
        {
          name: "İstiklal Caddesi - Casa Botter - Çiçek Pasajı",
          lat: 41.0328,
          lng: 28.9765,
          durationMin: 60,
          mode: "walk",
          category: "attraction",
        },
        { name: "Pera", lat: 41.0313, lng: 28.9744, durationMin: 40, mode: "walk", category: "attraction" },
        { name: "Taksim", lat: 41.037, lng: 28.985, durationMin: 30, mode: "walk", category: "attraction" },
        { name: "Taşkışla", lat: 41.0424, lng: 28.9884, durationMin: 20, mode: "walk", category: "attraction" },
        { name: "Cihangir", lat: 41.0319, lng: 28.9829, durationMin: 45, mode: "walk", category: "shop" },
        { name: "Rakı", lat: 41.031, lng: 28.98, durationMin: 90, mode: "walk", category: "bar" },
        { name: "Rooftop", lat: 41.03, lng: 28.978, durationMin: 60, mode: "walk", category: "bar" },
      ],
    },
    {
      label: "Day 3",
      startTime: "10:00",
      startPoint: { name: "Bomonti", lat: 41.0575, lng: 28.988 },
      stops: [
        { name: "Bomonti - Kahvaltı", lat: 41.0575, lng: 28.988, durationMin: 75, mode: "walk", category: "restaurant" },
        { name: "Kurtuluş - Teşvikiye - Nişantaşı", lat: 41.048, lng: 28.9938, durationMin: 90, mode: "walk", category: "shop" },
        { name: "Akaretler", lat: 41.043, lng: 29.002, durationMin: 45, mode: "walk", category: "shop" },
        { name: "Dolmabahçe Sarayı", lat: 41.0392, lng: 29.0002, durationMin: 90, mode: "walk", category: "museum" },
        {
          name: "Akşam Optional Cihangir İçmece",
          lat: 41.0319,
          lng: 28.9829,
          durationMin: 90,
          mode: "transit",
          category: "bar",
          notes: "Optional evening drinks in Cihangir.",
        },
      ],
    },
  ];

  return {
    id: genId(),
    title: "Istanbul, 3 Days",
    days: days.map(buildDay),
    hiddenGems: [],
    unplanned: [],
  };
}
