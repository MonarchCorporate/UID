// Maintenance mode ("Coming soon"). Active unless MAINTENANCE_MODE=off.
//
// While active, every page request gets the coming-soon page (HTTP 503).
// Exceptions: static assets, the hook endpoints (Discord bot, scheduler) and
// the one-time import. Team members can look at the real site by opening
//   https://uid.sc/?preview=<MAINTENANCE_KEY>
// once; that sets a cookie. Without MAINTENANCE_KEY the key is derived from
// AUTH_JWT_SECRET (see maintenanceKey()).
import { createHash, timingSafeEqual } from "node:crypto";

const COOKIE = "uid_preview";

const ALWAYS_OPEN = [
  /^\/assets\//,
  /^\/favicon/,
  /^\/robots\.txt$/,
  /^\/api\/public\/hooks\//,
  /^\/api\/public\/admin\/import$/,
];

export function maintenanceEnabled(): boolean {
  return (process.env.MAINTENANCE_MODE ?? "on").toLowerCase() !== "off";
}

export function maintenanceKey(): string | null {
  if (process.env.MAINTENANCE_KEY) return process.env.MAINTENANCE_KEY;
  const s = process.env.AUTH_JWT_SECRET;
  if (!s) return null;
  return createHash("sha256").update(`maintenance-preview:${s}`).digest("hex").slice(0, 32);
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** Returns a response to send instead of the app, or null to continue. */
export function maintenanceGate(request: Request): Response | null {
  if (!maintenanceEnabled()) return null;
  const url = new URL(request.url);
  if (ALWAYS_OPEN.some((re) => re.test(url.pathname))) return null;

  const key = maintenanceKey();
  if (key) {
    const preview = url.searchParams.get("preview");
    if (preview !== null) {
      if (preview === "off") {
        return new Response(null, {
          status: 302,
          headers: { location: "/", "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax` },
        });
      }
      if (safeEqual(preview, key)) {
        url.searchParams.delete("preview");
        return new Response(null, {
          status: 302,
          headers: {
            location: url.pathname + (url.search || ""),
            "set-cookie": `${COOKIE}=${key}; Path=/; Max-Age=${60 * 60 * 24 * 30}; Secure; HttpOnly; SameSite=Lax`,
            "cache-control": "no-store",
          },
        });
      }
    }
    const c = cookieValue(request, COOKIE);
    if (c && safeEqual(c, key)) return null;
  }

  const headers = { "cache-control": "no-store", "retry-after": "3600" };
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn")) {
    return Response.json({ error: "maintenance", message: "UID wird gerade umgebaut." }, { status: 503, headers });
  }
  return new Response(COMING_SOON_HTML, {
    status: 503,
    headers: { ...headers, "content-type": "text/html; charset=utf-8" },
  });
}

const COMING_SOON_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>United Imperial Dominion — Coming soon</title>
<meta name="description" content="United Imperial Dominion – Community unabhängiger Star-Citizen-Organisationen. Wir sind gleich zurück.">
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Work+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #04070f;
    --fg: #eef2f8;
    --muted: #8b97ad;
    --cyan: #22d3ee;
    --line: rgba(34, 211, 238, .18);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background: var(--bg);
    color: var(--fg);
    font-family: "Work Sans", ui-sans-serif, system-ui, sans-serif;
    font-weight: 300;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: "JetBrains Mono", ui-monospace, monospace; }
  .bg {
    position: fixed; inset: 0; z-index: -2;
    background:
      radial-gradient(ellipse 70% 55% at 60% 30%, rgba(34,211,238,.10), transparent 60%),
      linear-gradient(180deg, rgba(4,7,15,.35) 0%, rgba(4,7,15,.55) 45%, var(--bg) 92%),
      url("/assets/hero-ares-idris.jpg") center 20% / cover no-repeat;
    filter: saturate(.9);
  }
  .grid {
    position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background-image:
      linear-gradient(rgba(34,211,238,.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(34,211,238,.035) 1px, transparent 1px);
    background-size: 64px 64px;
    mask-image: radial-gradient(ellipse at center, #000 30%, transparent 80%);
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px clamp(16px, 5vw, 64px);
    border-bottom: 1px solid var(--line);
    background: rgba(4,7,15,.55);
    backdrop-filter: blur(12px);
  }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 12px; letter-spacing: .08em; font-weight: 700; text-transform: uppercase; }
  .brand img { width: 34px; height: 34px; object-fit: contain; }
  .status { font-size: 10px; letter-spacing: .3em; text-transform: uppercase; color: var(--cyan); border: 1px solid rgba(34,211,238,.45); padding: 9px 14px; }
  main {
    min-height: calc(100vh - 72px);
    display: flex; flex-direction: column; justify-content: center;
    padding: 64px clamp(16px, 9vw, 160px);
    max-width: 1280px;
  }
  .kicker { font-size: 11px; letter-spacing: .4em; text-transform: uppercase; color: var(--cyan); display: flex; align-items: center; gap: 10px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 12px var(--cyan); animation: pulse 1.8s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .3; } }
  h1 {
    margin-top: 28px;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-weight: 500;
    font-size: clamp(40px, 8.5vw, 112px);
    line-height: .98;
    letter-spacing: .02em;
    text-transform: uppercase;
  }
  h1 span { display: block; color: var(--cyan); text-shadow: 0 0 40px rgba(34,211,238,.25); }
  p.lead { margin-top: 28px; max-width: 580px; font-size: clamp(16px, 1.6vw, 19px); line-height: 1.65; color: #c5cede; }
  .cta { margin-top: 40px; display: flex; flex-wrap: wrap; gap: 12px; }
  .btn {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px; font-weight: 700; letter-spacing: .28em; text-transform: uppercase;
    text-decoration: none; padding: 16px 26px; border: 1px solid var(--cyan);
    transition: background .2s, color .2s, box-shadow .2s;
  }
  .btn.primary { background: var(--cyan); color: #04121a; }
  .btn.primary:hover { box-shadow: 0 0 32px -6px var(--cyan); }
  .btn.ghost { color: var(--cyan); }
  .btn.ghost:hover { background: rgba(34,211,238,.1); }
  .tagline { margin-top: 56px; font-size: 10px; letter-spacing: .4em; text-transform: uppercase; color: rgba(34,211,238,.55); }
  .bar { margin-top: 18px; width: min(420px, 100%); height: 2px; background: rgba(34,211,238,.15); overflow: hidden; }
  .bar i { display: block; height: 100%; width: 35%; background: var(--cyan); animation: scan 2.6s ease-in-out infinite; }
  @keyframes scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
  footer {
    border-top: 1px solid var(--line);
    padding: 18px clamp(16px, 5vw, 64px);
    font-size: 10px; letter-spacing: .3em; text-transform: uppercase; color: var(--muted);
    display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    background: rgba(4,7,15,.7);
  }
  @media (prefers-reduced-motion: reduce) { .dot, .bar i { animation: none; } }
</style>
</head>
<body>
  <div class="bg"></div>
  <div class="grid"></div>
  <header>
    <div class="brand mono"><img src="/assets/uid-logo.png" alt="">United Imperial Dominion</div>
    <div class="status mono">Wartung</div>
  </header>
  <main>
    <div class="kicker mono"><span class="dot"></span>Systemumstellung · läuft</div>
    <h1>Coming<span>soon</span></h1>
    <p class="lead">Das United Imperial Dominion zieht in ein neues Zuhause. Website und Backoffice sind in Kürze wieder für euch erreichbar – bis dahin findet ihr uns auf Discord.</p>
    <div class="cta">
      <a class="btn primary" href="https://discord.gg/QMvCtbjyqe" rel="noopener">Zum Discord</a>
    </div>
    <div class="tagline mono">Independent organizations. United purpose. Imperial strength.</div>
    <div class="bar"><i></i></div>
  </main>
  <footer class="mono">
    <span>© United Imperial Dominion</span>
    <span>uid.sc</span>
  </footer>
</body>
</html>`;
