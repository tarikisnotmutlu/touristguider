"use client";

import dynamic from "next/dynamic";
import DesktopPanel from "./DesktopPanel";
import MobileSheet from "./MobileSheet";
import StepCard from "./StepCard";
import PanicButton from "./PanicButton";

// maplibre-gl needs `window`, so the whole map tree is client-only and loaded
// without SSR.
const MapView = dynamic(() => import("./MapView"), { ssr: false });

export default function AppShell() {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-100">
      <div className="absolute inset-0">
        <MapView />
      </div>

      <div className="pointer-events-none absolute inset-0 flex">
        <div className="pointer-events-auto">
          <DesktopPanel />
        </div>
      </div>

      <MobileSheet />
      <StepCard />
      <PanicButton />
    </div>
  );
}
