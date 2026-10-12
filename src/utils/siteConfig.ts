import { normalizeFooterColumns, spacer, type FooterColumn, type FooterEntry } from "./footer";
import { createSiteTitleStore } from "./siteTitleStore";
import { cms } from "./cmsClient";

const cmsBaseUrl = import.meta.env.CMS_API_BASE_URL ?? "https://localhost:8080/v1";
const normalizedCmsBaseUrl = String(cmsBaseUrl).replace(/\/$/, "");
const siteSettingsUrl = `${normalizedCmsBaseUrl}/settings/site`;

const siteTitleStore = createSiteTitleStore({
  url: siteSettingsUrl,
  fetch: (input, init) => fetch(input, init),
  onError: (err) => console.error("Site title: CMS fetch failed:", err instanceof Error ? err.message : err),
});

/** Cached for five minutes; never throws. See utils/siteTitleStore. */
export function getSiteTitle(): Promise<string> {
  return siteTitleStore.get();
}

export type { FooterColumn, FooterEntry, FooterEntryKind } from "./footer";

type FooterSettingsResponse = {
  columns?: unknown;
};

const link = (label: string, href: string): FooterEntry => ({ kind: "link", label, href, new_tab: false });
const external = (label: string, href: string): FooterEntry => ({ kind: "link", label, href, new_tab: true });
const heading = (label: string, href: string): FooterEntry => ({ kind: "heading", label, href, new_tab: false });

/**
 * The footer this site shipped before the menu moved into the CMS. Kept as the
 * fallback so an unreachable or misconfigured CMS degrades to the previous
 * footer instead of an empty one — the CMS seeds the same set as its default.
 */
export const defaultFooterColumns: FooterColumn[] = [
  {
    entries: [
      heading("About", "/about"),
      link("Contact Us", "/contact"),
      external("Join The Triangle", "https://docs.google.com/forms/d/e/1FAIpQLScra_6sUenvmpIuQ5FjmMyWO0a2sz9z36HkrqfnYQvJGH9BGQ/viewform"),
      link("Staff", "/staff"),
      link("Find-A-Triangle", "/find"),
      link("Photo Gallery", "/photo"),
      external("Print Archive", "https://drexel.primo.exlibrisgroup.com/discovery/collectionDiscovery?vid=01DRXU_INST:01DRXU&inst=01DRXU_INST&collectionId=81448731180004721"),
      link("Constitution", "/proxy/wp-content/uploads/2026/03/The-Triangle-Constitution-3.pdf"),
    ],
  },
  {
    entries: [
      heading("News", "/news"),
      link("Campus", "/campus"),
      link("Academic Transformation", "/academic-transformation"),
      link("Politics", "/politics"),
      link("Transit", "/transit"),
      link("Public Safety", "/public-safety"),
    ],
  },
  {
    entries: [
      heading("Sports", "/sports"),
      link("Men's Basketball", "/mens-basketball"),
      link("Women's Basketball", "/womens-basketball"),
      link("Big 5", "/big-5"),
      link("Philly Sports", "/philly-sports"),
      link("Field Hockey", "/field-hockey"),
      link("Men's Soccer", "/mens-soccer"),
      link("Women's Soccer", "/womens-soccer"),
    ],
  },
  {
    entries: [
      heading("Opinion", "/opinion"),
      link("Science & Tech", "/science-tech"),
      link("From the Editor", "/from-the-editor"),
      spacer,
      heading("Columns", "/columns"),
      link("From the Playbook", "/from-the-playbook"),
      link("The Love Triangle", "/the-love-triangle"),
      link("Tri This Sweet Treat", "/tri-this-sweet-treat"),
    ],
  },
  {
    entries: [
      heading("Entertainment", "/entertainment"),
      link("Movies", "/movies"),
      link("Music", "/music"),
      link("Happening in Philly", "/happening-in-philly"),
      link("Cooking", "/cooking"),
      link("Books", "/books"),
      link("Gaming", "/gaming"),
      link("Listicles", "/listicles"),
    ],
  },
  {
    entries: [
      heading("Comics & Puzzles", "/comics-puzzles"),
      link("Political Cartoons", "/political-cartoons"),
      link("Crossword", "/crossword"),
      link("Sudoku", "/sudoku"),
      spacer,
      heading("Special Editions", "/"),
      link("Graduation", "/graduation"),
      link("Welcome Week", "/search?s=Welcome%20Week"),
      external("The Rectangle", "https://therectangle.org"),
      link("100 Year Anniversary", "/one-hundred"),
    ],
  },
];

// The footer renders on every page, and this site is SSR — without a memo that
// is one CMS round trip per request. 60s is short enough that an editor's save
// shows up on the next reload or two. Scheduled entries (`visible_from`) are
// filtered before caching, so one can appear up to 60s after its instant.
const FOOTER_TTL_MS = 60_000;
let footerCache: { columns: FooterColumn[]; fetchedAt: number } | null = null;

export async function getFooterColumns(): Promise<FooterColumn[]> {
  if (footerCache && Date.now() - footerCache.fetchedAt < FOOTER_TTL_MS) {
    return footerCache.columns;
  }

  try {
    const payload = await cms.getJson<FooterSettingsResponse>({
      endpoint: "footer_settings",
      path: ["settings", "footer"],
    });
    const columns = normalizeFooterColumns(payload.columns, Date.now());
    const resolved = columns.length > 0 ? columns : defaultFooterColumns;
    // Only a good response is cached; a CMS blip falls back for this request
    // and is retried on the next one.
    footerCache = { columns: resolved, fetchedAt: Date.now() };
    return resolved;
  } catch {
    return defaultFooterColumns;
  }
}
