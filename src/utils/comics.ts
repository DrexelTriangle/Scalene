import type { Category } from "./types";

/**
 * The sections whose art is drawn to its own frame.
 *
 * A photograph survives a crop -- that is what the uniform banner ratio on an
 * article's lead image is for. A comic or a puzzle does not: its panels run to
 * the edge and the lettering inside them *is* the piece, so trimming the sides
 * takes the joke out with the margins.
 *
 * Slugs rather than names: the CMS taxonomy is keyed on them, and an editor
 * renaming a section's display label should not silently start cropping it.
 */
const COMIC_SECTIONS: ReadonlySet<string> = new Set([
  "comics",
  "comics-puzzles",
  "political-cartoons",
  "cartoons",
  "crossword",
  "sudoku",
  "puzzles",
]);

/** Is this post filed under a section whose images must not be cropped? */
export function isComicPost(categories?: Category[] | null): boolean {
  return (categories ?? []).some((category) =>
    COMIC_SECTIONS.has(category?.slug?.toLowerCase() ?? ""),
  );
}
