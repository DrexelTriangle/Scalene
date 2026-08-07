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

import he from "he";

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
  // as-is, exactly as WordPress did -- but only WordPress-era bodies hold that
  // markup raw. A post written in the CMS editor stores the shortcode with the
  // attribution entity-encoded ("&lt;a href=..."), which printed the tags as
  // visible text under the puzzle. Decoding first gives both shapes the same
  // markup to insert; on a legacy body with no entities it is a no-op.
  const attribution = he.decode(attributes.attribution ?? "");
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

/**
 * Two shapes, both narrow enough to leave editorial brackets ("[sic]",
 * "[Editor's note]") alone: the shortcodes this corpus actually carries, named
 * explicitly; and any bracketed token carrying attributes, which is what makes
 * it a shortcode rather than prose. Mirrors shortcodePattern in the CMS's
 * database/http_models.go, which keeps them out of newly derived excerpts.
 */
const shortcodePattern =
  /\[\/?(?:puzzleme|caption|gallery|embed|playlist|audio|video)\b[^\]]*\]|\[[a-z][a-z0-9_-]*\s+[^\]]*=[^\]]*\]/gis;

/**
 * Remove shortcodes rather than expand them, for the places that show article
 * text as plain prose: excerpts and meta descriptions. Only the body has room
 * for an embed, and an excerpt that is a shortcode is worse than a short one --
 * a crossword post whose whole body is [puzzleme ...] printed its embed ids
 * under the headline on section listings, in the RSS feed and in <meta
 * name="description">. Excerpts stored before the CMS learned to skip
 * shortcodes still carry them, so this is what actually clears the page.
 */
export function stripShortcodes(content: string): string {
  if (!content || !content.includes("[")) return content;

  return content.replace(shortcodePattern, " ");
}
