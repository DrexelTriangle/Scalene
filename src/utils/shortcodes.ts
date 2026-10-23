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

import { mapTopLevel } from "./articleHtml.ts";
import { AUDIO_SOURCE_MAX, decodeShortcodeText, parseAudioUrl, parseEmbedUrl, shortcodeToQuizId, validMediaPaths } from "./embedUrl.ts";

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
/**
 * One player for every audio source. The row is ours: the Wordangle triangle,
 * a seek track and the time, driven by the article page's script. What it
 * drives differs: a native <audio> for an MP3, or the provider's own iframe
 * kept in the host and controlled through its widget API (SoundCloud,
 * Spotify). For those the row starts hidden and the provider's player is
 * visible, so a reader without scripts, or whose provider script never
 * loads, still gets a working player; the script swaps them once ready.
 */
const PLAYER_ROW = `<div class="tr-audio-row"><button type="button" class="tr-audio-play" aria-label="Play"><span class="tr-audio-tri" aria-hidden="true"></span></button><div class="tr-audio-track" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><div class="tr-audio-fill"></div></div><span class="tr-audio-time">0:00 / 0:00</span></div>`;

function providerPlayer(provider: string, label: string, iframe: string, link: string, attrs = ""): string {
  // The title line is filled by the article page script from the provider
  // (SoundCloud's widget, Spotify's oEmbed); hidden until it has a name.
  return `<div class="article-embed article-embed-audio tr-audio" data-provider="${provider}"${attrs}><p class="article-embed-label">${label}</p><p class="tr-audio-title" hidden></p><div class="tr-audio-host">${iframe}</div>${PLAYER_ROW.replace('<div class="tr-audio-row">', '<div class="tr-audio-row" hidden>')}${link}</div>`;
}

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
  const iframe = `<iframe src="${escapeAttribute(player.toString())}" width="100%" height="${height}" loading="lazy" scrolling="no" allow="autoplay" title="SoundCloud player"></iframe>`;
  // The track URL is unvalidated legacy text, so it only becomes a link when
  // it is https on a SoundCloud host; anything else gets the player alone.
  let linkHref = "";
  try {
    const u = new URL(track);
    if (u.protocol === "https:" && /(^|\.)soundcloud\.com$/.test(u.hostname.toLowerCase())) linkHref = u.toString();
  } catch {
    // Not a URL at all: no link.
  }
  const link = linkHref ? `<a class="article-embed-link" href="${escapeAttribute(linkHref)}">Open on SoundCloud</a>` : "";
  return providerPlayer("soundcloud", "SoundCloud", iframe, link);
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
 * Spotify's embed URL is the share URL with /embed/ inserted. Episodes and
 * tracks use the compact 152px player; shows, albums and playlists list their
 * contents and need the 352px one. Heights are attributes, not inline style:
 * the article page strips width and height out of inline styles.
 * Source: developer.spotify.com/documentation/embeds/tutorials/creating-an-embed
 */
function spotifyEmbed(url: string): string | null {
  const parsed = parseEmbedUrl(url);
  if (!parsed.ok || parsed.embed.provider !== "spotify") return null;
  const m = /^https:\/\/open\.spotify\.com\/(\w+)\/(\w+)$/.exec(parsed.embed.url);
  if (!m) return null;
  const height = m[1] === "episode" || m[1] === "track" ? "152" : "352";
  // data-uri is what the iFrame API loads; the iframe is the fallback player.
  const iframe = `<iframe src="${escapeAttribute(`https://open.spotify.com/embed/${m[1]}/${m[2]}`)}" width="100%" height="${height}" loading="lazy" allow="encrypted-media" title="Spotify player"></iframe>`;
  const link = `<a class="article-embed-link" href="${escapeAttribute(parsed.embed.url)}">Open on Spotify</a>`;
  return providerPlayer("spotify", "Spotify", iframe, link, ` data-uri="spotify:${m[1]}:${m[2]}"`);
}

/**
 * TikTok's documented script-free Embed Player. The box is a portrait class
 * in global.css; the player is vertical and the 16:9 video box would letterbox
 * it. No description or music parameters until a browser check confirms the
 * player fits 9:16 with them (spec section 5).
 * Source: developers.tiktok.com/doc/embed-player
 */
function tiktokEmbed(url: string): string | null {
  const parsed = parseEmbedUrl(url);
  if (!parsed.ok || parsed.embed.provider !== "tiktok") return null;
  const m = /\/video\/(\d+)$/.exec(parsed.embed.url);
  if (!m) return null;
  return `<div class="article-embed article-embed-video article-embed-portrait"><p class="article-embed-label">TikTok</p><div class="article-embed-player"><iframe src="${escapeAttribute(`https://www.tiktok.com/player/v1/${m[1]}`)}" loading="lazy" allow="fullscreen" title="TikTok video"></iframe></div><a class="article-embed-link" href="${escapeAttribute(parsed.embed.url)}">View on TikTok</a></div>`;
}

/**
 * Instagram renders in our own holder: the post images the CMS copied into
 * the media library when the writer inserted the embed (the media attribute),
 * and a link back to the post. Instagram's own embed brought its header,
 * like bar and comment box along and could not be trimmed, so it is gone.
 * With no usable images only the link renders. Arrows sit hidden until the
 * article page's script shows them for a carousel.
 */
function instagramEmbed(url: string, media: string): string | null {
  const parsed = parseEmbedUrl(url);
  if (!parsed.ok || parsed.embed.provider !== "instagram") return null;
  const permalink = escapeAttribute(parsed.embed.url);
  const link = `<a class="article-embed-link" href="${permalink}">View on Instagram</a>`;
  // Served through the site's own /proxy route like every article image, so
  // the reader's browser never fetches from the media host directly.
  const images = validMediaPaths(media).map((path) => `/proxy${path}`);
  if (images.length === 0) {
    return `<div class="article-embed article-embed-social"><p class="article-embed-label">Instagram</p>${link}</div>`;
  }
  const imgs = images
    .map((src, i) => `<img src="${escapeAttribute(src)}" alt="" loading="lazy"${i > 0 ? " hidden" : ""}>`)
    .join("");
  const arrows =
    images.length > 1
      ? `<button type="button" class="tr-ig-prev" aria-label="Previous image" hidden></button><button type="button" class="tr-ig-next" aria-label="Next image" hidden></button>`
      : "";
  return `<div class="article-embed article-embed-social tr-ig" data-count="${images.length}"><p class="article-embed-label">Instagram</p><div class="tr-ig-frame">${imgs}${arrows}</div>${link}</div>`;
}

/**
 * Uploaded MP3 on our own media origin. The src is validated against
 * MEDIA_BASE_URL so an [audio] shortcode can never point the player at a
 * third party. The link is "Open" rather than a download attribute, which
 * browsers ignore across origins.
 */
function audioEmbed(src: string, source: string, mediaBaseUrl: string): string | null {
  const valid = parseAudioUrl(src, mediaBaseUrl);
  if (!valid) return null;
  const safe = escapeAttribute(valid);
  // The player is ours: the native element keeps the decoding and the
  // article page's script drives it. Without scripts the link still works.
  // The play mark is the Wordangle triangle, drawn with borders like the
  // board's row arrows, turned to point right.
  const from = source.trim().slice(0, AUDIO_SOURCE_MAX);
  const label = from ? `Audio from ${escapeAttribute(from)}` : "Audio";
  return `<div class="article-embed article-embed-audio tr-audio" data-provider="file"><p class="article-embed-label">${label}</p><audio preload="metadata" src="${safe}"></audio>${PLAYER_ROW}<a class="article-embed-link" href="${safe}">Open MP3</a></div>`;
}

/**
 * [quiz id="N"] becomes an empty slot rather than markup. The article page
 * splits the body at these and renders Quiz.astro into each one, because a
 * component rendered as a string through set:html ships no script. The id is
 * read by the shared parser, so this site accepts exactly what the CMS writes.
 */
function quizSlot(id: number): string {
  return `<div class="tr-quiz-slot" data-quiz-id="${id}"></div>`;
}

/** The new shortcodes, each matched only as the entire content of a block. */
const BLOCK_SHORTCODE = /^\[(spotify|tiktok|instagram|audio)(?=\s)([^\]]*?)\s*\/?\]$/i;
const URL_ATTRIBUTE = /(?:^|\s)(url|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const TEXT_ATTRIBUTE = /(?:^|\s)(source|media)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** The free-text attributes (source=, media=), entity-decoded then percent-decoded. */
function textAttributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(TEXT_ATTRIBUTE)) {
    out[m[1].toLowerCase()] = decodeShortcodeText(he.decode(m[2] ?? m[3] ?? ""));
  }
  return out;
}

/**
 * Expand a block whose whole content is one new shortcode. Returns the
 * replacement for the entire element (open tag included), or undefined to
 * leave it alone. Matching the whole block is what keeps a shortcode inside a
 * sentence, an attribute value, a <code> sample or a <script> from ever
 * expanding: none of those is the sole content of a top-level <p> or <div>.
 */
function expandBlockShortcode(inner: string, mediaBaseUrl: string): string | undefined {
  const text = inner.trim();
  if (!text.startsWith("[")) return undefined;
  const quizId = shortcodeToQuizId(text);
  if (quizId !== null) return quizSlot(quizId);
  const m = BLOCK_SHORTCODE.exec(text);
  if (!m) return undefined;
  const attr = URL_ATTRIBUTE.exec(m[2]);
  if (!attr) return undefined;
  // Decode once: a body saved by the CMS editor stores & as &amp;.
  const value = he.decode(attr[2] ?? attr[3] ?? "");
  const name = attr[1].toLowerCase();
  const provider = m[1].toLowerCase();
  const extra = textAttributes(m[2]);
  // Link providers take url=, audio takes src=; any other pairing stays text.
  if (provider === "audio") {
    return name === "src" ? (audioEmbed(value, extra.source ?? "", mediaBaseUrl) ?? undefined) : undefined;
  }
  if (name !== "url") return undefined;
  switch (provider) {
    case "spotify":
      return spotifyEmbed(value) ?? undefined;
    case "tiktok":
      return tiktokEmbed(value) ?? undefined;
    case "instagram":
      return instagramEmbed(value, extra.media ?? "") ?? undefined;
    default:
      return undefined;
  }
}

function expandBlockShortcodes(content: string, mediaBaseUrl: string): string {
  return mapTopLevel(content, ({ tag, inner }) => {
    if (tag !== "p" && tag !== "div") return undefined;
    return expandBlockShortcode(inner, mediaBaseUrl);
  });
}

/**
 * Expand the shortcodes we support. Anything unrecognised is left untouched,
 * so an unknown shortcode still shows up as text rather than vanishing.
 *
 * Two mechanisms, deliberately: the WordPress-era shortcodes keep the regexes
 * they have always had, so the migrated corpus renders exactly as before. The
 * shortcodes the CMS editor writes are expanded by a block pass that only
 * fires when a top-level <p> or <div> holds nothing but the shortcode.
 */
export function expandShortcodesWith(
  content: string,
  options: { mediaBaseUrl: string },
): string {
  if (!content || !content.includes("[")) return content;

  const legacy = content
    .replace(/\[puzzleme\s+([^\]]*)\]/gi, (_, raw) => puzzlemeEmbed(raw))
    // Self-closing in practice ("... /]"), so the trailing slash is consumed
    // here rather than left to land inside the attribute string.
    .replace(/\[soundcloud\s+([^\]]*?)\s*\/?\]/gi, (_, raw) =>
      soundcloudEmbed(raw),
    )
    .replace(/\[youtube\s+([^\]]+?)\s*\/?\]/gi, (_, raw) => youtubeEmbed(raw));

  return expandBlockShortcodes(legacy, options.mediaBaseUrl);
}

// Inlined at build time like the proxy's copy of this variable; unset means
// [audio] shortcodes stay as text, never that the build fails. Optional
// chaining because tests/ run this module under plain node, where
// import.meta.env does not exist.
const MEDIA_BASE_URL = String(import.meta.env?.MEDIA_BASE_URL ?? "");

export function expandShortcodes(content: string): string {
  return expandShortcodesWith(content, { mediaBaseUrl: MEDIA_BASE_URL });
}

/**
 * Two shapes, both narrow enough to leave editorial brackets ("[sic]",
 * "[Editor's note]") alone: the shortcodes this corpus actually carries, named
 * explicitly; and any bracketed token carrying attributes, which is what makes
 * it a shortcode rather than prose. Mirrors shortcodePattern in the CMS's
 * database/http_models.go, which keeps them out of newly derived excerpts.
 */
const shortcodePattern =
  /\[\/?(?:puzzleme|caption|gallery|embed|playlist|audio|video|quiz)\b[^\]]*\]|\[[a-z][a-z0-9_-]*\s+[^\]]*=[^\]]*\]/gis;

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
