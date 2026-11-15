export function UidDivider({ label }: { label?: string }) {
  return (
    <div className="relative mx-auto flex max-w-6xl items-center gap-4 px-6 py-2" aria-hidden>
      <div className="uid-divider flex-1" />
      {label && (
        <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-brand/60">{label}</span>
      )}
      <div className="uid-divider flex-1" />
    </div>
  );
}