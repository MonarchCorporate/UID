import { useMemo } from "react";
import type { ComponentPick } from "@/lib/loadout/domain/types";
import { simulateSustained } from "@/lib/loadout/domain";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface Props {
  picks: ComponentPick[];
  duration?: number;
  step?: number;
}

/**
 * Damage-over-time visualisation for the current build. Two series:
 *  - `dps`   → rolling average DPS
 *  - `burst` → per-100 ms damage bucket converted back to DPS
 * Reload gaps show up as valleys automatically.
 */
export function SustainedDpsChart({ picks, duration = 60, step = 0.1 }: Props) {
  const { data, sustained, peak } = useMemo(() => {
    const sim = simulateSustained(picks, { durationSeconds: duration, stepSeconds: step });
    // Downsample to ~180 points to keep the SVG snappy.
    const stride = Math.max(1, Math.floor(sim.samples.length / 180));
    const data = sim.samples
      .filter((_, i) => i % stride === 0)
      .map((s) => ({
        t: Number(s.t.toFixed(1)),
        dps: Math.round(s.dps),
        burst: Math.round(s.damage / step),
      }));
    return { data, sustained: sim.sustainedDps, peak: sim.peakDps };
  }, [picks, duration, step]);

  if (!data.length || peak <= 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-white/8 bg-background/40 text-xs text-muted-foreground">
        Keine feuernden Waffen im Loadout.
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            stroke="rgba(255,255,255,0.4)"
            tick={{ fontSize: 10, fontFamily: "ui-monospace" }}
            tickFormatter={(v) => `${v}s`}
          />
          <YAxis
            stroke="rgba(255,255,255,0.4)"
            tick={{ fontSize: 10, fontFamily: "ui-monospace" }}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(10,12,20,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              fontSize: 11,
              fontFamily: "ui-monospace",
            }}
            formatter={(v: number, name) => [`${v.toLocaleString("de-DE")} DPS`, name === "dps" ? "Ø DPS" : "Burst"]}
            labelFormatter={(l) => `t = ${l}s`}
          />
          <ReferenceLine y={Math.round(sustained)} stroke="rgba(56,189,248,0.5)" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="burst" stroke="rgba(244,114,182,0.6)" strokeWidth={1.2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="dps" stroke="rgb(56,189,248)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}