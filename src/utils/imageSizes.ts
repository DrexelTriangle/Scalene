/**
 * `sizes` values for card images, so the browser picks a rendition that fits
 * the slot the card is actually drawn in (a 480w one for a ~300px side card,
 * not the 960w one sized for a lead).
 */

type Breakpoint = 'base' | 'sm' | 'md' | 'lg' | 'xl';
type Length = { px: number } | { vw: number };

/** Narrowest first. Tailwind's default breakpoints. */
const BREAKPOINTS: [Breakpoint, number][] = [['base', 0], ['sm', 640], ['md', 768], ['lg', 1024], ['xl', 1280]];

/** The column a Section is drawn in. */
export type Column = 'full' | 'main';

const COLUMNS: Record<Column, Record<Breakpoint, Length>> = {
  // Section.astro on its own: 1200px at xl, 900px at lg, 90% of the page below.
  full: { base: { vw: 90 }, sm: { vw: 90 }, md: { vw: 90 }, lg: { px: 900 }, xl: { px: 1200 } },
  // The homepage's #main-left: the 8fr of an 8fr_4fr grid (from sm) in that
  // same container.
  main: { base: { vw: 90 }, sm: { vw: 60 }, md: { vw: 60 }, lg: { px: 600 }, xl: { px: 800 } },
};

/** How much of the column an image fills: a share of it, less the px of
 *  padding beside the image (ignored where the column is in vw: there the
 *  overestimate is a few px). */
export interface Slot {
  share: number;
  gutter?: number;
}

/**
 * `slots` gives the slot from each breakpoint up; an unlisted breakpoint keeps
 * the one below it, and below the first listed the image spans the column.
 * Widths round up: overestimating costs a slightly larger download,
 * underestimating blurs.
 */
export function slotSizes(column: Column, slots: Partial<Record<Breakpoint, Slot>>): string {
  let slot: Slot = { share: 1 };
  const widths = BREAKPOINTS.map(([bp, minWidth]) => {
    slot = slots[bp] ?? slot;
    const container = COLUMNS[column][bp];
    const width = 'px' in container
      ? `${roundUp(container.px * slot.share - (slot.gutter ?? 0))}px`
      : `${roundUp(container.vw * slot.share)}vw`;
    return { minWidth, width };
  });

  // Widest first; a breakpoint that changes nothing is dropped.
  const entries = widths
    .filter((entry, i) => i > 0 && entry.width !== widths[i - 1].width)
    .reverse()
    .map(({ minWidth, width }) => `(min-width: ${minWidth}px) ${width}`);
  return [...entries, widths[0].width].join(', ');
}

/** Up, but not past float noise: 90 * (6 / 9) is 60, not 61. */
const roundUp = (n: number) => Math.ceil(n - 1e-9);
