// Newsletter unsubscribes. The list itself still lives in the legacy WordPress
// "Newsletter" plugin (9.x) on cms.thetriangle.org; this page only replaces the
// reader-facing step. Emails link to /unsubscribe?nk={key}&nek=<email key>,
// where {key} is the plugin's "<subscriber id>-<token>" tag.
//
// We call the plugin's RFC 8058 one-click action (na=ocu) from the server: it
// skips the antibot interstitial that na=u / na=uc show, answers "ok" (200)
// after unsubscribing, and wp_die()s "Subscriber not found" (404) for a bad
// key. It is idempotent: an already-unsubscribed reader gets "ok" again.

export const NEWSLETTER_BASE_URL = 'https://cms.thetriangle.org/';

export type UnsubscribeResult = 'ok' | 'not-found' | 'error';

// Subscriber keys are "<id>-<token>"; email keys are "<id>-<token>" too.
const KEY_PATTERN = /^\d+-[A-Za-z0-9]{1,64}$/;

export function parseKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return KEY_PATTERN.test(key) ? key : null;
}

export function buildOneClickUrl(baseUrl: string, nk: string, nek?: string | null): string {
  const url = new URL(baseUrl);
  url.searchParams.set('na', 'ocu');
  url.searchParams.set('nk', nk);
  if (nek) url.searchParams.set('nek', nek);
  return url.toString();
}

export async function unsubscribe(
  baseUrl: string,
  nk: string,
  nek?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<UnsubscribeResult> {
  try {
    const res = await fetchImpl(buildOneClickUrl(baseUrl, nk, nek), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return 'not-found';
    if (res.status !== 200) return 'error';
    // A 200 can also be a cache/WAF page; only the plugin's literal "ok" counts.
    return (await res.text()).trim() === 'ok' ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}
