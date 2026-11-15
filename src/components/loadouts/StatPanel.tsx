import { useMemo } from "react";
import type { ComponentPick } from "@/lib/loadout/domain/types";
import { summarizeLoadout, sustainedSummary, type FlightMode } from "@/lib/loadout/domain";
import { fmt } from "@/lib/loadout-calc";
import { Crosshair, Shield, Battery, Snowflake, Radio, Rocket, Timer } from "lucide-react";

function Row({ label, value, hint, tone }: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn" | "high" | "critical";
}) {
  const toneClass =
    tone === "critical" ? "text-rose-400"
    : tone === "high" ? "text-orange-300"
    : tone === "warn" ? "text-amber-300"
    : tone === "ok" ? "text-emerald-300"
    : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-xs">
      <span className="text-muted-foreground" title={hint}>{label}</span>
      <span className={`font-mono tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}

function GroupHeader({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="mb-1 flex items-center gap-2 border-b border-white/5 pb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
      <Icon className="h-3 w-3" />
      {title}
    </div>
  );
}

export function LoadoutStatPanel({ picks, mode, shipRaw }: { picks: ComponentPick[]; mode?: FlightMode; shipRaw?: unknown }) {
  const s = useMemo(() => summarizeLoadout(picks, { mode, shipRaw }), [picks, mode, shipRaw]);
  const sim = useMemo(() => sustainedSummary(picks, { durationSeconds: 60, stepSeconds: 0.1 }), [picks]);

  const powerTone = s.power.ampel;
  const coolTone = s.cooling.ampel === "critical" ? "critical" : s.cooling.ampel === "warn" ? "warn" : "ok";

  return (
    <div className="space-y-4 rounded-md border border-white/10 bg-background/40 p-3">
      <section>
        <GroupHeader icon={Crosshair} title="Damage" />
        <Row label="Σ Alpha" value={fmt(s.weapons.totalAlpha)} hint="Summe des Erstschlag-Schadens aller feuerbereiten Waffen" />
        <Row label="Burst DPS" value={fmt(s.weapons.totalBurstDps)} hint="alpha × Schuss/Sekunde, summiert über alle Waffen" />
        <Row label="Waffen" value={String(s.weapons.weaponCount)} />
        <Row label="Physisch" value={fmt(s.weapons.burstDpsByType.physical)} />
        <Row label="Energie" value={fmt(s.weapons.burstDpsByType.energy)} />
        <Row label="Distortion" value={fmt(s.weapons.burstDpsByType.distortion)} />
        <Row label="Thermal" value={fmt(s.weapons.burstDpsByType.thermal)} />
      </section>

      <section>
        <GroupHeader icon={Timer} title="Sustained (60 s Simulation)" />
        <Row label="Sustained DPS" value={fmt(sim.sustainedDps)} hint="Ø DPS über 60 s inkl. Reload, Überhitzung, Powerlimit" />
        <Row label="Peak DPS" value={fmt(sim.peakDps)} hint="Höchster 100-ms-Ausschlag im Zeitfenster" />
        <Row label="Time-to-empty" value={sim.timeToFirstEmpty > 0 ? `${sim.timeToFirstEmpty.toFixed(1)} s` : "—"} hint="Zeit bis zum ersten Magazinwechsel" />
        <Row
          label="Power-Limit"
          value={sim.powerLimited ? `${(sim.powerEfficiency * 100).toFixed(0)} %` : "—"}
          tone={sim.powerLimited ? "warn" : undefined}
          hint="Anteil verfügbarer Energie relativ zum Bedarf beim Feuern"
        />
      </section>

      <section>
        <GroupHeader icon={Rocket} title="Raketen" />
        <Row label="Anzahl" value={fmt(s.missiles.missileCount)} />
        <Row label="Σ Schaden" value={fmt(s.missiles.missileDamage)} />
      </section>

      <section>
        <GroupHeader icon={Shield} title="Schilde" />
        <Row label="Kapazität" value={fmt(s.shields.totalCapacity)} />
        <Row label="Regen (hp/s)" value={fmt(s.shields.totalRegen)} />
        <Row label="Zeit voll" value={s.shields.timeToFullRecharge > 0 ? `${s.shields.timeToFullRecharge.toFixed(1)} s` : "—"} />
      </section>

      <section>
        <GroupHeader icon={Battery} title="Energie" />
        <Row label="Verfügbar" value={fmt(s.power.available)} />
        <Row label="Bedarf" value={fmt(s.power.required)} />
        <Row
          label="Auslastung"
          value={Number.isFinite(s.power.usagePercent) ? `${s.power.usagePercent.toFixed(0)} %` : "∞"}
          tone={powerTone}
          hint="Grün < 75 % · Gelb 75–95 % · Rot > 95 % · Kritisch: Bedarf > verfügbar"
        />
        <Row label="Reserve" value={fmt(s.power.reserve)} tone={s.power.reserve < 0 ? "critical" : undefined} />
      </section>

      <section>
        <GroupHeader icon={Snowflake} title="Kühlung" />
        <Row label="Verfügbar" value={fmt(s.cooling.available)} />
        <Row label="Produziert" value={fmt(s.cooling.generated)} />
        <Row
          label="Auslastung"
          value={Number.isFinite(s.cooling.usagePercent) ? `${s.cooling.usagePercent.toFixed(0)} %` : "∞"}
          tone={coolTone}
        />
      </section>

      <section>
        <GroupHeader icon={Radio} title="Signaturen (Modell)" />
        <Row label="EM" value={fmt(s.signatures.em)} hint="Modellwert bis verifizierte Formel vorliegt" />
        <Row label="IR" value={fmt(s.signatures.ir)} hint="Modellwert bis verifizierte Formel vorliegt" />
        <Row label="Cross Section" value={fmt(s.signatures.cs)} hint="Schiffsbasis; ändert sich nicht durch Loadout" />
      </section>

      {s.quantum && (
        <section>
          <GroupHeader icon={Rocket} title="Quantum" />
          <Row label="Geschwindigkeit" value={fmt(s.quantum.quantumSpeed / 1000, "km/s")} />
          <Row label="Reichweite" value={fmt(s.quantum.maxRange / 1000, "km")} />
        </section>
      )}
    </div>
  );
}