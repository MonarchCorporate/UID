import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPublicOrgs } from "@/lib/public-org.functions";
import uidLogo from "@/assets/uid-logo.png.asset.json";

const SWEEP_S = 6;

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Verbund-Scanner: Radar mit rotierendem Abtaststrahl. Jede Mitglieds-
 * organisation ist ein Kontakt, der aufleuchtet, wenn der Strahl ihn trifft.
 */
export function UidRadar() {
  const fn = useServerFn(listPublicOrgs);
  const { data } = useQuery({
    queryKey: ["public-orgs-marquee"],
    queryFn: () => fn(),
    staleTime: 5 * 60 * 1000,
  });
  const orgs = data?.orgs ?? [];

  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString("de-DE", { timeZone: "UTC", hour12: false }));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Kontakte gleichmäßig verteilen, Position aus der Org-ID stabil ableiten
  const contacts = orgs.map((o, i) => {
    const h = hash(o.id);
    const base = (360 / Math.max(orgs.length, 1)) * i;
    const angle = (base + (h % 40) - 20 + 360 + 25) % 360;
    const radius = 0.42 + (((h >>> 8) % 1000) / 1000) * 0.4;
    const rad = ((angle - 90) * Math.PI) / 180;
    return {
      org: o,
      angle,
      x: 50 + Math.cos(rad) * radius * 50,
      y: 50 + Math.sin(rad) * radius * 50,
      left: Math.cos(rad) < -0.2,
    };
  });

  return (
    <div className="uid-radar-wrap">
      <div className="uid-radar" aria-label={`Verbund-Scanner: ${orgs.length} Organisationen im Netzwerk`}>
        <div className="uid-radar-grid" aria-hidden />
        <div className="uid-radar-sweep" style={{ animationDuration: `${SWEEP_S}s` }} aria-hidden />
        <svg viewBox="0 0 100 100" className="uid-radar-ticks" aria-hidden>
          {Array.from({ length: 72 }, (_, i) => (
            <line
              key={i}
              x1="50"
              y1="0.6"
              x2="50"
              y2={i % 6 === 0 ? 3.4 : 1.9}
              transform={`rotate(${i * 5} 50 50)`}
            />
          ))}
        </svg>
        <img src={uidLogo.url} alt="" className="uid-radar-core" aria-hidden />

        {contacts.map((c) => (
          <Link
            key={c.org.id}
            to="/o/$slug"
            params={{ slug: c.org.slug }}
            className="uid-radar-contact uid-focus"
            style={{
              left: `${c.x}%`,
              top: `${c.y}%`,
              ["--ping-delay" as string]: `${(c.angle / 360) * SWEEP_S}s`,
              ["--sweep" as string]: `${SWEEP_S}s`,
            }}
            aria-label={`${c.org.name} im Netzwerk`}
          >
            <span className="uid-radar-blip" />
            <span className={`uid-radar-tag ${c.left ? "is-left" : ""}`}>
              {c.org.tag || c.org.name}
            </span>
          </Link>
        ))}
      </div>

      <dl className="uid-radar-readout">
        <div>
          <dt>Kontakte</dt>
          <dd>{orgs.length ? String(orgs.length).padStart(2, "0") : "--"}</dd>
        </div>
        <div>
          <dt>System</dt>
          <dd>Stanton</dd>
        </div>
        <div>
          <dt>Standardzeit</dt>
          <dd>{time || "--:--:--"}</dd>
        </div>
      </dl>
    </div>
  );
}
