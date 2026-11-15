import { FLIGHT_MODES, customMode, type FlightMode, type FlightModeKind, type PowerTriangle } from "@/lib/loadout/domain";

const PIP_LABELS = ["Weapons", "Shields", "Engines"] as const;
type PipKey = keyof PowerTriangle;
const PIP_KEYS: PipKey[] = ["weapons", "shields", "engines"];

export function FlightModePanel({
  mode,
  onChange,
}: {
  mode: FlightMode;
  onChange: (m: FlightMode) => void;
}) {
  const setKind = (kind: FlightModeKind) => {
    if (kind === "custom") onChange(customMode(mode.triangle));
    else onChange(FLIGHT_MODES[kind]);
  };
  const setPip = (k: PipKey, v: 0 | 1 | 2) => {
    onChange(customMode({ ...mode.triangle, [k]: v }));
  };

  const kinds: FlightModeKind[] = ["scm", "nav", "stealth", "custom"];

  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-4 gap-1">
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] ${
              mode.kind === k
                ? "border-brand bg-brand/15 text-brand"
                : "border-white/10 bg-card/40 text-muted-foreground hover:border-brand/40"
            }`}
          >
            {k === "scm" ? "SCM" : k === "nav" ? "NAV" : k === "stealth" ? "STEA" : "Cust"}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {PIP_KEYS.map((k, i) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-16 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              {PIP_LABELS[i]}
            </span>
            <div className="flex flex-1 gap-1">
              {[0, 1, 2].map((p) => (
                <button
                  key={p}
                  onClick={() => setPip(k, p as 0 | 1 | 2)}
                  className={`h-4 flex-1 rounded-sm border ${
                    mode.triangle[k] === p
                      ? "border-brand bg-brand/50"
                      : mode.triangle[k] > p
                      ? "border-brand/60 bg-brand/25"
                      : "border-white/10 bg-background/40"
                  }`}
                  aria-label={`${k} ${p}`}
                />
              ))}
            </div>
            <span className="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {mode.triangle[k] === 0 ? "0.6×" : mode.triangle[k] === 1 ? "1.0×" : "1.4×"}
            </span>
          </div>
        ))}
      </div>

      <div className="text-[10px] text-muted-foreground">
        {mode.label}
      </div>
    </div>
  );
}