// The subscribe form posts here (via /api/newsletter-subscribe) rather than
// straight to the CMS: same origin, so no CORS, and the CMS's per-IP rate
// limit sees the reader's address, which this forwards, instead of the
// browser's request to a third-party host.

export interface SubscribeResult {
  status: number;
  body: { success: boolean; error?: string };
}

export interface ForwardSubscribeOptions {
  /** CMS_API_BASE_URL, e.g. https://cms.thetriangle.org/v1 */
  cmsBaseUrl: string;
  /** The parsed request body, untrusted. */
  body: unknown;
  clientAddress?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const UNAVAILABLE: SubscribeResult = {
  status: 502,
  body: { success: false, error: "We couldn't sign you up just now. Please try again in a minute." },
};

/** Keeps only the fields the CMS takes, in the shapes it takes them. */
export function subscribePayload(body: unknown) {
  const data = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const lists = Array.isArray(data.lists)
    ? data.lists.map(Number).filter((id) => Number.isInteger(id))
    : [];
  return {
    email: typeof data.email === 'string' ? data.email : '',
    lists,
    website: typeof data.website === 'string' ? data.website : '',
  };
}

export async function forwardSubscribe({
  cmsBaseUrl,
  body,
  clientAddress,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}: ForwardSubscribeOptions): Promise<SubscribeResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${cmsBaseUrl.replace(/\/$/, '')}/newsletter-subscribers/subscribe`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(clientAddress ? { 'X-Forwarded-For': clientAddress } : {}),
      },
      body: JSON.stringify(subscribePayload(body)),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return UNAVAILABLE;
  }

  if (response.status === 429) {
    return { status: 429, body: { success: false, error: 'Too many tries. Please wait a minute and try again.' } };
  }
  try {
    const parsed = (await response.json()) as { success?: unknown; error?: unknown };
    if (response.status >= 500 || typeof parsed?.success !== 'boolean') return UNAVAILABLE;
    return {
      status: response.status,
      body: {
        success: parsed.success,
        ...(typeof parsed.error === 'string' ? { error: parsed.error } : {}),
      },
    };
  } catch {
    return UNAVAILABLE;
  }
}
