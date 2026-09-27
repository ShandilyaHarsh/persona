"use client";

import { onboarding } from "@/services/conductor";
import { useStore } from "@/lib/store";

/** What the person has named their Persona, or "Persona" until they have. */
export function usePersonaName(): string {
  return useStore(onboarding).profile.agentName ?? "Persona";
}
