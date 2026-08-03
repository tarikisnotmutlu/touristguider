"use client";

import dynamic from "next/dynamic";
import DesktopPanel from "./DesktopPanel";
import MobileSheet from "./MobileSheet";
import StepCard from "./StepCard";
import PanicButton from "./PanicButton";
import HiddenGemModal from "./HiddenGemModal";
import JourneyEngine from "./JourneyEngine";
import Hud from "./Hud";
import CatToast from "./CatToast";
import GemHintToast from "./GemHintToast";
import GmToast from "./GmToast";
import AddNodeHintToast from "./AddNodeHintToast";
import ArrivalCelebration from "./ArrivalCelebration";

// maplibre-gl needs `window`, so the whole map tree is client-only and loaded
// without SSR.
const MapView = dynamic(() => import("./MapView"), { ssr: false });

export default function AppShell() {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-stone-50">
      <div className="fixed inset-0 z-0 h-screen w-screen overflow-hidden">
        <MapView />
      </div>

      <div className="pointer-events-none absolute inset-0 z-40 flex">
        <div className="pointer-events-auto">
          <DesktopPanel />
        </div>
      </div>

      <MobileSheet />
      <Hud />
      <CatToast />
      <GemHintToast />
      <GmToast />
      <AddNodeHintToast />
      <StepCard />
      <HiddenGemModal />
      <ArrivalCelebration />
      <PanicButton />
      <JourneyEngine />
    </div>
  );
}
