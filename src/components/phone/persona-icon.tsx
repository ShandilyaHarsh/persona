/** The Persona app's icon: the ring, on black. */
export function PersonaIcon({ size }: { size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center bg-[radial-gradient(120%_90%_at_50%_0%,#26272a_0%,#0b0b0c_75%)] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.1)]"
      style={{ width: size, height: size, borderRadius: size * 0.225 }}
    >
      <span
        className="rounded-full border-white"
        style={{
          width: size * 0.46,
          height: size * 0.46,
          borderWidth: Math.max(2, size * 0.05),
          boxShadow: `0 0 ${size * 0.12}px rgba(255,255,255,0.45), inset 0 0 ${size * 0.08}px rgba(255,255,255,0.35)`,
        }}
      />
    </span>
  );
}
