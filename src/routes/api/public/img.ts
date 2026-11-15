import { createFileRoute } from '@tanstack/react-router';

const ALLOWED_HOSTS = new Set([
  'fleetyards.net',
  'api.fleetyards.net',
  'cdn.fleetyards.net',
  'media.robertsspaceindustries.com',
  'robertsspaceindustries.com',
  'media.starcitizen.tools',
  'starcitizen.tools',
  'cstone.space',
  'api.star-citizen.wiki',
  'star-citizen.wiki',
]);

function isAllowed(host: string): boolean {
  if (ALLOWED_HOSTS.has(host)) return true;
  // allow common subdomains
  return (
    host.endsWith('.fleetyards.net') ||
    host.endsWith('.starcitizen.tools') ||
    host.endsWith('.star-citizen.wiki') ||
    host.endsWith('.cstone.space') ||
    host.endsWith('.robertsspaceindustries.com')
  );
}

export const Route = createFileRoute('/api/public/img')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = url.searchParams.get('u');
        if (!target) return new Response('Missing u', { status: 400 });

        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          return new Response('Invalid url', { status: 400 });
        }
        if (parsed.protocol !== 'https:' || !isAllowed(parsed.hostname)) {
          return new Response('Host not allowed', { status: 403 });
        }

        try {
          const upstream = await fetch(parsed.toString(), {
            headers: { accept: 'image/*,*/*;q=0.8' },
            // @ts-expect-error Cloudflare-specific cache hint
            cf: { cacheTtl: 60 * 60 * 24 * 30, cacheEverything: true },
          });
          if (!upstream.ok || !upstream.body) {
            return new Response('Upstream error', { status: 502 });
          }
          const headers = new Headers();
          const ct = upstream.headers.get('content-type');
          if (ct) headers.set('content-type', ct);
          const len = upstream.headers.get('content-length');
          if (len) headers.set('content-length', len);
          headers.set('cache-control', 'public, max-age=2592000, s-maxage=2592000, immutable');
          return new Response(upstream.body, { status: 200, headers });
        } catch {
          return new Response('Fetch failed', { status: 502 });
        }
      },
    },
  },
});
