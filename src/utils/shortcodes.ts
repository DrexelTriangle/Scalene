/**
 * WordPress shortcode expansion.
 *
 * Article bodies come out of the CMS as raw `post_content`, which still holds
 * unexpanded WordPress shortcodes. Under WordPress a plugin expanded these at
 * render time; nothing does now, so they reach the page as literal
 * "[puzzleme ...]" text.
 *
 * The markup below is what the AmuseLabs plugin actually emitted -- taken from
 * `content.rendered` for an existing crossword post rather than written from
 * memory. Notably it drops the shortcode's `basepath`: the embed script
 * resolves its own CDN, and the working WordPress output carried no
 * data-basepath at all.
 */

/** Attributes are single-quoted in practice, but accept double quotes too. */
function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([\w-]+)\s*=\s*(?:'([^']*)'|"([^"]*)")/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  }
  return attributes;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function puzzlemeEmbed(raw: string): string {
  const attributes = parseAttributes(raw);
  const id = attributes.id ?? "";
  const set = attributes.set ?? "";

  // Without both of these the embed script has nothing to load, so leave the
  // shortcode visible rather than emitting a silently empty puzzle.
  if (!id || !set) return `[puzzleme ${raw}]`;

  const puzzleType = attributes.type || "crossword";
  // Attribution is authored as HTML (it contains a link), so it is inserted
  // as-is, exactly as WordPress did.
  const attribution = attributes.attribution ?? "";
  const attributionDiv = attribution
    ? `\n            <div class="pm-attribution-div" style="font-family: sans-serif;font-size: 12px;color:#666666;padding-top: 5px;width: 100%">${attribution}</div>`
    : "";

  // .article-embed opts this wrapper out of the prose column in global.css.
  // The stylesheet can otherwise only infer "layout, not prose" from a block's
  // contents, which is a guess a third-party script can invalidate.
  return `
        <div class="article-embed" style="position: relative;text-align: center">
            <div class="pm-embed-div" data-id="${escapeAttribute(id)}" data-set="${escapeAttribute(set)}" data-puzzleType="${escapeAttribute(puzzleType)}" data-height="700px" data-embedparams="embed=wp"></div>${attributionDiv}
        </div>`;
}

/**
 * Expand the shortcodes we support. Anything unrecognised is left untouched,
 * so an unknown shortcode still shows up as text rather than vanishing.
 */
export function expandShortcodes(content: string): string {
  if (!content || !content.includes("[")) return content;

  return content.replace(/\[puzzleme\s+([^\]]*)\]/gi, (_, raw) =>
    puzzlemeEmbed(raw),
  );
}
