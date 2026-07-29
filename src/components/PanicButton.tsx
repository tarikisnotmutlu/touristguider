"use client";

import { motion } from "framer-motion";

const WHATSAPP_TARGET = "https://wa.me/491637653246";

/** Elegant, single-tap emergency contact — no confirmation menu by design.
 *  Always opens WhatsApp, on every OS. Sits top-right, sized to match the
 *  HUD's stat rings so it reads as part of the same control cluster. */
export default function PanicButton() {
  function handlePress() {
    window.location.href = WHATSAPP_TARGET;
  }

  return (
    <motion.button
      onClick={handlePress}
      type="button"
      whileTap={{ scale: 0.88 }}
      transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
      className="fixed right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-md shadow-red-500/40"
      aria-label="Emergency contact"
      title="Emergency — message on WhatsApp"
    >
      SOS
    </motion.button>
  );
}
