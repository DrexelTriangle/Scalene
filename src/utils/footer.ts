// Footer entry types and normalization for the CMS footer (GET /v1/settings/footer).
// Pure functions only -- no import.meta.env -- so tests/footer.test.ts can run
// them under plain Node.

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

export const spacer: FooterEntry = { kind: "spacer", label: "", href: "", new_tab: false };

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;

/**
 * An entry may carry `visible_from` (an RFC3339 instant) so editors can stage
 * a link ahead of a launch. It stays hidden until that instant. Anything that
 * isn't a parseable RFC3339 string leaves the entry visible: a bad schedule
 * should never silently drop a link that rendered before the field existed.
 */
export function isFooterEntryVisible(visibleFrom: unknown, now: number): boolean {
  if (typeof visibleFrom !== "string") return true;
  const value = visibleFrom.trim();
  if (!RFC3339.test(value)) return true;
  const from = Date.parse(value.toUpperCase());
  if (Number.isNaN(from)) return true;
  return now >= from;
}

export function normalizeFooterColumns(raw: unknown, now: number = Date.now()): FooterColumn[] {
  if (!Array.isArray(raw)) return [];

  const columns: FooterColumn[] = [];
  for (const rawColumn of raw) {
    const rawEntries = (rawColumn as FooterColumn | undefined)?.entries;
    if (!Array.isArray(rawEntries)) continue;

    const entries: FooterEntry[] = [];
    for (const rawEntry of rawEntries) {
      const entry = (rawEntry ?? {}) as Partial<FooterEntry> & { visible_from?: unknown };
      // Scheduled entries are dropped first, so a column whose only real
      // entries are still scheduled collapses below like any empty column.
      if (!isFooterEntryVisible(entry.visible_from, now)) continue;
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
