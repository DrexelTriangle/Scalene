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
 * The player URL WordPress's SoundCloud shortcode built, rebuilt here.
 *
 * The shortcode carries the track as `url` and the player options as a `params`
 * query string of its own: `params="color=#000000&auto_play=false&..."`. Both
 * go into w.soundcloud.com/player/ as query parameters, with the track URL
 * percent-encoded inside it -- which matters, because these are private tracks
 * whose URL carries a `?secret_token=`, and losing it makes the player 404.
 *
 * Entity decoding first: a body written in the CMS editor stores the `&` in
 * params as `&amp;`, and parsing that literally yields one option named
 * "amp;auto_play". On a WordPress-era body it is a no-op.
 */
function soundcloudEmbed(raw: string): string {
  const attributes = parseAttributes(raw);
  const track = he.decode(attributes.url ?? "");

  // No track, nothing to play. Leave the shortcode visible rather than emit an
  // empty player, the same way puzzlemeEmbed does.
  if (!track) return `[soundcloud ${raw}]`;

  const player = new URL("https://w.soundcloud.com/player/");
  player.searchParams.set("url", track);
  for (const [option, value] of new URLSearchParams(
    he.decode(attributes.params ?? ""),
  )) {
    player.searchParams.set(option, value);
  }

  // The shortcode's own height, which is 300 on every article in the corpus.
  const height = /^\d+$/.test(attributes.height ?? "") ? attributes.height : "300";

  // Sized by attributes and a class rather than an inline style: the article
  // page strips width and height declarations out of every inline style it
  // renders, to unpick the dimensions WordPress baked into its images. An embed
  // that sizes itself inline gets silently flattened by that pass.
  return `
        <div class="article-embed article-embed-audio">
            <iframe src="${escapeAttribute(player.toString())}" width="100%" height="${height}" loading="lazy" scrolling="no" allow="autoplay" title="SoundCloud player"></iframe>
        </div>`;
}

/**
 * WordPress's YouTube shortcode takes a bare watch URL rather than attributes:
 * `[youtube https://www.youtube.com/watch?v=ID]`, sometimes with `&w=560&h=315`
 * appended. Every one of the 97 articles carrying it uses that shape.
 *
 * The size hints are dropped on purpose. They encode a 2013 fixed-width column;
 * the embed is rendered 16:9 and fluid instead, so it works on a phone.
 */
function youtubeEmbed(rawUrl: string): string {
  const trimmed = he.decode(rawUrl.trim());
  let id = "";
  try {
    id = new URL(trimmed).searchParams.get("v") ?? "";
  } catch {
    /* not a URL we can read; fall through to leaving the shortcode alone */
  }

  // Ids are [A-Za-z0-9_-]; anything else came out of a malformed shortcode and
  // would build a src pointing at nothing.
  if (!/^[\w-]+$/.test(id)) return `[youtube ${rawUrl}]`;

  // The 16:9 box is a class, not an inline style, for the reason given in
  // soundcloudEmbed: inline width and height do not survive the article page's
  // dimension stripping, and an iframe that loses them falls back to the HTML
  // default of 300x150.
  return `
        <div class="article-embed article-embed-video">
            <iframe src="https://www.youtube.com/embed/${escapeAttribute(id)}" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen title="YouTube video"></iframe>
        </div>`;
}

/**
 * Expand the shortcodes we support. Anything unrecognised is left untouched,
 * so an unknown shortcode still shows up as text rather than vanishing.
 */
export function expandShortcodes(content: string): string {
  if (!content || !content.includes("[")) return content;

  return content
    .replace(/\[puzzleme\s+([^\]]*)\]/gi, (_, raw) => puzzlemeEmbed(raw))
    // Self-closing in practice ("... /]"), so the trailing slash is consumed
    // here rather than left to land inside the attribute string.
    .replace(/\[soundcloud\s+([^\]]*?)\s*\/?\]/gi, (_, raw) =>
      soundcloudEmbed(raw),
    )
    .replace(/\[youtube\s+([^\]]+?)\s*\/?\]/gi, (_, raw) => youtubeEmbed(raw));
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
