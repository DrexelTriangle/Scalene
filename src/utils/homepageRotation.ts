import type { ArticleSummary } from "./types";

/**
 * Whether a story has to stay where the CMS put it. A pin is an editor's
 * explicit "this goes here", and a breaking story's slot carries the breaking
 * kicker (see Section-3-6-3), so moving either would undo an editorial call.
 */
function isAnchored(article: ArticleSummary): boolean {
  return Boolean(article.is_featured || article.breaking_news);
}

/**
 * Cycles the unanchored stories of one section through the unanchored slots
 * by a random amount, so the homepage doesn't sit unchanged for days between
 * new posts. Anchored stories keep their exact index, and so do the first
 * `lockLeading` slots whatever is in them.
 *
 * A cyclic shift rather than a shuffle: the newest-first order survives as a
 * run, so the section never reads as scrambled.
 */
export function rotateSection<T extends ArticleSummary>(
  articles: T[] | undefined,
  lockLeading = 0,
): T[] {
  if (!articles) return [];

  const freeSlots: number[] = [];
  articles.forEach((article, index) => {
    if (index >= lockLeading && !isAnchored(article)) freeSlots.push(index);
  });

  const shift = Math.floor(Math.random() * freeSlots.length);
  if (shift === 0) return articles;

  const out = articles.slice();
  freeSlots.forEach((slot, i) => {
    out[slot] = articles[freeSlots[(i + shift) % freeSlots.length]];
  });
  return out;
}
