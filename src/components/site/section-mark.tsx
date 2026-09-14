/**
 * SectionMark — the editorial section marker: index, hairline rule,
 * label. Ink variant for paper registers, default for black.
 */
export function SectionMark({
  n,
  label,
  ink = false,
}: {
  n: string;
  label: string;
  ink?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-display text-sm font-bold tracking-widest text-primary">
        {n}
      </span>
      <span
        className="h-px w-10"
        style={{ background: ink ? "rgba(10,10,13,0.25)" : "rgba(255,255,255,0.2)" }}
        aria-hidden="true"
      />
      <span
        className={
          "text-xs font-medium uppercase tracking-[0.18em] " +
          (ink ? "text-black/60" : "text-white/50")
        }
      >
        {label}
      </span>
    </div>
  );
}
