"use client";

import { usePersonaName } from "@/components/use-persona-name";
import { live, onboarding, openPersonaApp } from "@/services/conductor";
import { useStore } from "@/lib/store";

import { PersonaIcon } from "./persona-icon";
import { clockTime, useClock } from "./use-clock";

const WALLPAPER =
  "radial-gradient(120% 80% at 20% 10%, #eef1ea 0%, transparent 60%), radial-gradient(90% 70% at 90% 90%, #dfe5dc 0%, transparent 60%), linear-gradient(180deg, #f6f6f3 0%, #e7ebe4 100%)";

export function HomeScreen() {
  const now = useClock(15_000);
  const { unread } = useStore(live);
  const { thread } = useStore(onboarding);
  const name = usePersonaName();

  const lastText = [...thread]
    .reverse()
    .find((item) => item.kind === "message" && item.role === "assistant" && item.via === "app");
  const notice =
    thread.length === 0
      ? "Hey, I'm your new Persona. Tap to say hi."
      : unread > 0 && lastText?.kind === "message"
        ? lastText.text
        : null;

  return (
    <div className="relative flex size-full flex-col items-center" style={{ background: WALLPAPER }}>
      <div className="mt-23 flex flex-col items-center text-ink">
        <span className="text-[19px] font-medium text-ink/70">
          {now?.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) ?? " "}
        </span>
        <span className="tabular text-[88px] font-semibold leading-none">
          {now ? clockTime(now) : " "}
        </span>
      </div>

      {notice ? (
        <button
          type="button"
          onClick={openPersonaApp}
          className="mt-auto mb-6 flex w-[calc(100%-20px)] items-start gap-3 rounded-[22px] bg-white/60 p-3 text-left shadow-[0_0_0_0.5px_rgba(0,0,0,0.05)] backdrop-blur-xl transition-transform duration-150 ease-out-soft active:scale-[0.98]"
        >
          <PersonaIcon size={38} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between">
              <span className="text-subhead font-semibold">{name}</span>
              <span className="text-caption text-ink-muted">now</span>
            </span>
            <span className="line-clamp-2 text-subhead">{notice}</span>
          </span>
        </button>
      ) : (
        <div className="mt-auto" />
      )}

      <div className="mb-7 flex w-[calc(100%-24px)] justify-center gap-7 rounded-[34px] bg-white/35 p-4 shadow-[0_0_0_0.5px_rgba(0,0,0,0.04)] backdrop-blur-2xl">
        <AppIcon label="Persona" onOpen={openPersonaApp} badge={unread > 0 || thread.length === 0 ? Math.max(unread, 1) : 0}>
          <PersonaIcon size={62} />
        </AppIcon>
      </div>
    </div>
  );
}

function AppIcon({
  label,
  onOpen,
  badge,
  children,
}: {
  label: string;
  onOpen: () => void;
  badge: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={badge ? `${label}, ${badge} unread` : label}
      className="relative transition-transform duration-150 ease-out-soft active:scale-[0.96]"
    >
      {children}
      {badge > 0 ? (
        <span className="tabular absolute -right-1.5 -top-1.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-critical px-1.5 text-footnote font-medium text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
