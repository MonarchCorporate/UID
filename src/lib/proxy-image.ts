/**
 * Routes external image URLs through our /api/public/img proxy so the
 * browser never talks directly to Fleetyards/RSI. Pass-through for local
 * or unknown URLs.
 */
export function proxyImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')) return url;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return url;
    return `/api/public/img?u=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}
