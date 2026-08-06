const cmsBaseUrl = import.meta.env.CMS_API_BASE_URL ?? "https://localhost:8080/v1";
const normalizedCmsBaseUrl = String(cmsBaseUrl).replace(/\/$/, "");
const siteSettingsUrl = `${normalizedCmsBaseUrl}/settings/site`;
const footerSettingsUrl = `${normalizedCmsBaseUrl}/settings/footer`;
const defaultSiteTitle = "The Triangle";

type SiteSettingsResponse = {
  site_title?: string;
};

export async function getSiteTitle(): Promise<string> {
  try {
    const response = await fetch(siteSettingsUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      return defaultSiteTitle;
    }
    const payload = (await response.json()) as SiteSettingsResponse;
    const title = String(payload.site_title ?? "").trim();
    return title || defaultSiteTitle;
  } catch {
    return defaultSiteTitle;
  }
}

/**
 * A footer column is a flat ordered list, not a heading with children: two of
 * the columns stack a second bolded group under a blank line ("Columns" under
 * "Opinion", "Special Editions" under "Comics & Puzzles").
 */
export type FooterEntryKind = "link" | "heading" | "spacer";

export type FooterEntry = {
  kind: FooterEntryKind;
  label: string;
  href: string;
  new_tab: boolean;
};

export type FooterColumn = {
  entries: FooterEntry[];
};

type FooterSettingsResponse = {
  columns?: unknown;
};

const link = (label: string, href: string): FooterEntry => ({ kind: "link", label, href, new_tab: false });
const external = (label: string, href: string): FooterEntry => ({ kind: "link", label, href, new_tab: true });
const heading = (label: string, href: string): FooterEntry => ({ kind: "heading", label, href, new_tab: false });
const spacer: FooterEntry = { kind: "spacer", label: "", href: "", new_tab: false };

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

function normalizeColumns(raw: unknown): FooterColumn[] {
  if (!Array.isArray(raw)) return [];

  const columns: FooterColumn[] = [];
  for (const rawColumn of raw) {
    const rawEntries = (rawColumn as FooterColumn | undefined)?.entries;
    if (!Array.isArray(rawEntries)) continue;

    const entries: FooterEntry[] = [];
    for (const rawEntry of rawEntries) {
      const entry = (rawEntry ?? {}) as Partial<FooterEntry>;
      const kind: FooterEntryKind =
        entry.kind === "heading" || entry.kind === "spacer" ? entry.kind : "link";
      if (kind === "spacer") {
        entries.push(spacer);
        continue;
      }
      const label = String(entry.label ?? "").trim();
      if (!label) continue;
      entries.push({
        kind,
        label,
        href: String(entry.href ?? "").trim(),
        new_tab: Boolean(entry.new_tab),
      });
    }

    if (entries.some((entry) => entry.kind !== "spacer")) {
      columns.push({ entries });
    }
  }
  return columns;
}

// The footer renders on every page, and this site is SSR — without a memo that
// is one CMS round trip per request. 60s is short enough that an editor's save
// shows up on the next reload or two.
const FOOTER_TTL_MS = 60_000;
let footerCache: { columns: FooterColumn[]; fetchedAt: number } | null = null;

export async function getFooterColumns(): Promise<FooterColumn[]> {
  if (footerCache && Date.now() - footerCache.fetchedAt < FOOTER_TTL_MS) {
    return footerCache.columns;
  }

  try {
    const response = await fetch(footerSettingsUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      return defaultFooterColumns;
    }
    const payload = (await response.json()) as FooterSettingsResponse;
    const columns = normalizeColumns(payload.columns);
    const resolved = columns.length > 0 ? columns : defaultFooterColumns;
    // Only a good response is cached; a CMS blip falls back for this request
    // and is retried on the next one.
    footerCache = { columns: resolved, fetchedAt: Date.now() };
    return resolved;
  } catch {
    return defaultFooterColumns;
  }
}
