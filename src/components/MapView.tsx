"use client";

import { useMemo } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, ZoomControl } from "react-leaflet";
import L from "leaflet";
import { useTripStore } from "@/store/useTripStore";
import { ROUTABLE_MODES } from "@/lib/types";
import { pointBefore } from "@/lib/dayHelpers";
import { startDivIcon, stepDivIcon } from "@/lib/icons";
import RouteLayer from "./RouteLayer";
import TransitSegment from "./TransitSegment";
import FitBounds from "./FitBounds";

// Leaflet's default marker images reference relative paths that break under
// Next.js bundling; point them at the copies we ship in /public instead.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet-images/marker-icon-2x.png",
  iconUrl: "/leaflet-images/marker-icon.png",
  shadowUrl: "/leaflet-images/marker-shadow.png",
});

export default function MapView() {
  const trip = useTripStore((s) => s.trip);
  const activeDayIndex = useTripStore((s) => s.activeDayIndex);
  const activeStepId = useTripStore((s) => s.activeStepId);
  const setActiveStepId = useTripStore((s) => s.setActiveStepId);
  const setRouteFound = useTripStore((s) => s.setRouteFound);
  const setManualEdit = useTripStore((s) => s.setManualEdit);

  const day = trip.days[activeDayIndex];

  const allPoints = useMemo(() => {
    if (!day) return [];
    return [day.startPoint, ...day.steps.map((s) => ({ lat: s.lat, lng: s.lng }))];
  }, [day]);

  if (!day) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-500">
        No day selected
      </div>
    );
  }

  return (
    <MapContainer
      center={[day.startPoint.lat, day.startPoint.lng]}
      zoom={14}
      zoomControl={false}
      className="h-full w-full"
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <ZoomControl position="topright" />

      <FitBounds points={allPoints} watch={day.id} />

      <Marker position={[day.startPoint.lat, day.startPoint.lng]} icon={startDivIcon()}>
        <Tooltip direction="top">{day.startPoint.name}</Tooltip>
      </Marker>

      {day.steps.map((step, i) => (
        <Marker
          key={step.id}
          position={[step.lat, step.lng]}
          icon={stepDivIcon(i + 1, step.id === activeStepId ? "#dc2626" : "#4f46e5")}
          eventHandlers={{ click: () => setActiveStepId(step.id) }}
        >
          <Tooltip direction="top">{step.name}</Tooltip>
        </Marker>
      ))}

      {day.steps.map((step, i) => {
        const route = day.routes[i];
        const from = pointBefore(day, i);
        const to = { lat: step.lat, lng: step.lng };
        const segKey = `${day.id}-${step.id}-${route.mode}-${route.resetNonce}`;

        if (ROUTABLE_MODES.includes(route.mode)) {
          return (
            <RouteLayer
              key={segKey}
              mode={route.mode}
              from={from}
              to={to}
              initialManualWaypoints={route.manualWaypoints}
              resetNonce={route.resetNonce}
              onRouteFound={(info) => setRouteFound(day.id, i, info)}
              onManualEdit={(wps) => setManualEdit(day.id, i, wps)}
            />
          );
        }

        return (
          <TransitSegment
            key={segKey}
            mode={route.mode}
            from={from}
            to={to}
            onRouteFound={(info) => setRouteFound(day.id, i, info)}
          />
        );
      })}
    </MapContainer>
  );
}
