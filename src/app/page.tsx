"use client";

import LobbyForm from "@/components/LobbyForm";

/** The Landing Page — purely the password-gated Lobby/Onboarding form.
 *  Nothing else ever renders here: a successful join navigates to the
 *  dynamic /[sessionId] route, which owns the actual map/game board and its
 *  own independent route guard (see app/[sessionId]/page.tsx). */
export default function Home() {
  return <LobbyForm />;
}
