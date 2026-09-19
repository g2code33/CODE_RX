/**
 * Where a generated link points.
 *
 * A link that is handed to a human has to be a complete http address, not a
 * path: the operator copies one string into a message, and anyone reading the
 * API response sees the same usable link. The host comes from the request that
 * generated it, so a preview deployment issues preview links and production
 * issues production links; SITE_URL is the fallback when no host is available.
 *
 * The address is a site address, never a credential: the fragment carries the
 * token for a client link, and browsers never send a fragment to a server.
 */

type SiteEnv = { SITE_URL?: string } | undefined;

/** The configured public site, or the known Pages URL as the safe fallback. */
export const publicSiteUrl = (env: SiteEnv) => {
  const configured = String(env?.SITE_URL || '').trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(configured)
    ? configured
    : 'https://coderxsociety.pages.dev';
};

/**
 * The origin the request was made on, e.g. `https://code-rx.example`.
 *
 * `Origin` is preferred because it is what the operator's browser is actually
 * looking at. When it is absent (a server-to-server call), the forwarding
 * headers and finally the request URL are used. A host that is not a plain
 * hostname is refused rather than echoed into a link.
 */
export const requestOrigin = (request: Request | undefined): string => {
  const headers = request?.headers;
  const origin = String(headers?.get('origin') || '').trim();
  if (/^https?:\/\/[^\s/]+$/i.test(origin)) return origin.replace(/\/+$/, '');

  let parsed: URL | null = null;
  try {
    parsed = new URL(String(request?.url || ''));
  } catch {
    parsed = null;
  }

  const protocol = String(headers?.get('x-forwarded-proto') || parsed?.protocol || 'https:')
    .split(',')[0].trim().replace(/:$/, '').toLowerCase();
  const host = String(headers?.get('x-forwarded-host') || headers?.get('host') || parsed?.host || '')
    .split(',')[0].trim();
  if (!host || /[^A-Za-z0-9.:[\]-]/.test(host)) return '';
  return `${protocol === 'http' ? 'http' : 'https'}://${host}`;
};

/**
 * A path on this site as an absolute address, e.g. `/#x` on
 * `https://site.example` becomes `https://site.example/#x`. An address that is
 * already absolute is returned untouched, and a request with no usable host
 * still falls back to the configured site.
 */
export const absoluteLinkAddress = (path: string, origin: string, env: SiteEnv): string => {
  const value = String(path || '').trim();
  if (/^https?:\/\//i.test(value)) return value;
  const base = String(origin || '').trim().replace(/\/+$/, '') || publicSiteUrl(env);
  if (!value) return base;
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
};
