/**
 * The app's icons, drawn for it rather than borrowed: one 24-unit grid, one
 * stroke weight, round joins, proportions after SF Symbols. Every icon takes
 * `currentColor`, so state comes from CSS color, never from a second asset.
 */

type IconProps = { size?: number; strokeWidth?: number; className?: string };

function Svg({ size = 20, strokeWidth = 1.5, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5l4.2 4.2L19 7" />
    </Svg>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 19V5.5M6.5 10.5L12 5l5.5 5.5" />
    </Svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4.5 7.5l7.5 5.5 7.5-5.5" />
    </Svg>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.2 6.2A2 2 0 0 1 7 5h10a2 2 0 0 1 1.8 1.2l1.6 4.4c.07.2.1.4.1.6V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-5.8c0-.2.03-.4.1-.6z" />
      <path d="M3.6 12.5h4.1c.4 0 .7.2.9.5l.7 1.4c.2.3.5.5.9.5h3.6c.4 0 .7-.2.9-.5l.7-1.4c.2-.3.5-.5.9-.5h4.1" />
    </Svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </Svg>
  );
}

export function BellRingingIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
      <path d="M3.5 9a8.5 8.5 0 0 1 2.3-4.3M20.5 9a8.5 8.5 0 0 0-2.3-4.3" />
    </Svg>
  );
}

/** A short list of things to do. */
export function TasksIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7l1.3 1.3L7.8 5.8M4 12.5l1.3 1.3 2.5-2.5M4 18l1.3 1.3 2.5-2.5" />
      <path d="M11 7h9M11 12.5h9M11 18h9" />
    </Svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Svg>
  );
}

export function PenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 19.5l1-4L16 5a2.1 2.1 0 0 1 3 3L8.5 18.5z" />
      <path d="M14 7l3 3" />
    </Svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 3.5L3.5 10.2l6.7 2.9 2.9 6.7z" />
      <path d="M10.2 13.1L20.5 3.5" />
    </Svg>
  );
}

/** The band, face on: a strap with the ring on it - "continue on your band". */
export function BandIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 2.75h6M9 21.25h6" />
      <rect x="7" y="5.25" width="10" height="13.5" rx="3.25" />
      <circle cx="12" cy="12" r="2.4" />
    </Svg>
  );
}

/** Persona's own mark: the ring on the band. */
export function RingIcon({ size = 20, className }: Pick<IconProps, "size" | "className">) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="6.75" stroke="currentColor" strokeWidth="2.25" />
    </svg>
  );
}

// ─── Status bar ──────────────────────────────────────────────
// The phone's own chrome, drawn like iOS draws it: filled glyphs at fixed
// point sizes, so they sit off the 24-unit grid on purpose.

export function SignalIcon() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden>
      <rect x="0" y="8" width="3" height="4" rx="1" />
      <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
      <rect x="10" y="3" width="3" height="9" rx="1" />
      <rect x="15" y="0" width="3" height="12" rx="1" />
    </svg>
  );
}

export function WifiIcon() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden>
      <path d="M8 2.4c2.3 0 4.4.9 6 2.4l1.1-1.1A10 10 0 0 0 8 .8 10 10 0 0 0 .9 3.7L2 4.8a8.4 8.4 0 0 1 6-2.4Zm0 3.2c1.4 0 2.7.5 3.7 1.4l1.1-1.1A7 7 0 0 0 8 4a7 7 0 0 0-4.8 1.9L4.3 7c1-.9 2.3-1.4 3.7-1.4Zm0 3.2c.6 0 1.1.2 1.5.6L8 11 6.5 9.4c.4-.4.9-.6 1.5-.6Z" />
    </svg>
  );
}

export function BatteryIcon() {
  return (
    <svg width="27" height="13" viewBox="0 0 27 13" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" stroke="currentColor" opacity="0.4" />
      <rect x="2" y="2" width="20" height="9" rx="2.5" fill="currentColor" />
      <path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity="0.4" />
    </svg>
  );
}
