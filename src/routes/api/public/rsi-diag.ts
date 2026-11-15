import { createFileRoute } from "@tanstack/react-router";
import {
  extractOrgSids,
  extractRsiOrgs,
  extractRsiOrgsFromMarkdown,
  fetchRsiOrganizations,
  fetchRsiProfile,
} from "@/lib/rsi-verify.server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Temporärer Diagnose-Endpunkt: prüft alle RSI-Abrufwege aus der Serverumgebung. */
export const Route = createFileRoute("/api/public/rsi-diag")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const handle = (url.searchParams.get("handle") ?? "Der-Ferengi").replace(
          /[^A-Za-z0-9_-]/g,
          "",
        );
        const profileUrl = `https://robertsspaceindustries.com/en/citizens/${handle}`;
        const orgUrl = `${profileUrl}/organizations`;

        const routes: {
          name: string;
          url: (u: string) => string;
          headers?: Record<string, string>;
          markdown: boolean;
        }[] = [
          {
            name: "direct",
            url: (u) => u,
            headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.8" },
            markdown: false,
          },
          ...(process.env["RSI_PROXY_URL"] && process.env["HOOK_SECRET"]
            ? [
                {
                  name: "botproxy",
                  url: (u: string) =>
                    `${process.env["RSI_PROXY_URL"]!.replace(/\/$/, "")}/rsi?url=${encodeURIComponent(u)}`,
                  headers: { Authorization: `Bearer ${process.env["HOOK_SECRET"]}` },
                  markdown: false,
                },
              ]
            : []),

          {
            name: "jina",
            url: (u) => `https://r.jina.ai/${u}`,
            headers: { Accept: "text/plain", "X-Return-Format": "markdown" },
            markdown: true,
          },
          {
            name: "allorigins",
            url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
            headers: { "User-Agent": UA },
            markdown: false,
          },
          {
            name: "codetabs",
            url: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
            markdown: false,
          },
          {
            name: "corsproxy",
            url: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
            headers: { "User-Agent": UA },
            markdown: false,
          },
        ];

        const perRoute = [];
        for (const r of routes) {
          const t0 = Date.now();
          try {
            const res = await fetch(r.url(orgUrl), {
              headers: r.headers,
              redirect: "follow",
              signal: AbortSignal.timeout(25_000),
            });
            const text = res.ok ? await res.text() : "";
            const isHtml = /<div class="(entry bio|box-content org)/i.test(text);
            const orgs = !text
              ? []
              : isHtml
                ? extractRsiOrgs(text)
                : r.markdown
                  ? extractRsiOrgsFromMarkdown(text)
                  : extractRsiOrgs(text);
            perRoute.push({
              name: r.name,
              status: res.status,
              ms: Date.now() - t0,
              size: text.length,
              sids: extractOrgSids(text).slice(0, 10),
              orgs: orgs.map((o) => `${o.name} [${o.sid}]${o.main ? " *" : ""}`),
            });
          } catch (err) {
            perRoute.push({
              name: r.name,
              status: 0,
              ms: Date.now() - t0,
              error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
            });
          }
        }

        let profile: unknown;
        try {
          const p = await fetchRsiProfile(handle);
          profile = { bioLength: p.bio.length, bio: p.bio.slice(0, 400), sids: p.sids };
        } catch (err) {
          profile = { error: err instanceof Error ? err.message : String(err) };
        }

        let orgsResult: unknown;
        try {
          orgsResult = await fetchRsiOrganizations(handle);
        } catch (err) {
          orgsResult = { error: err instanceof Error ? err.message : String(err) };
        }

        return new Response(
          JSON.stringify({ handle, perRoute, profile, orgs: orgsResult }, null, 2),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
