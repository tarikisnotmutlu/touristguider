"use client";

import { motion } from "framer-motion";

const WHATSAPP_TARGET = "https://wa.me/491637653246";

/** Elegant, single-tap emergency contact — no confirmation menu by design.
 *  Always opens WhatsApp, on every OS. */
export default function PanicButton() {
  function handlePress() {
    window.location.href = WHATSAPP_TARGET;
  }

  return (
    <motion.button
      onClick={handlePress}
      type="button"
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
      className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-xl font-bold text-white shadow-lg shadow-red-500/50 hover:bg-red-700 lg:bottom-6"
      aria-label="Emergency contact"
      title="Emergency — message on WhatsApp"
    >
      SOS
    </motion.button>
  );
}
