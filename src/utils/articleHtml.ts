/**
 * Structural repair for article bodies before they are rendered.
 *
 * Bodies authored (or re-saved) in the Delta CMS come out of Trix, and most are
 * pasted in from a word processor. That paste survives as markup the stylesheet
 * cannot read as prose:
 *
 *   <div><figure>lead photo</figure>The first paragraph...</div>
 *   <div>&nbsp;The second paragraph...<br><br>The third...</div>
 *   <div><br><br></div>
 *
 * Three separate symptoms come out of that one shape:
 *
 *   1. The block holding the lead figure is excluded from the prose rule in
 *      global.css -- that rule has to assume "contains a figure" means "layout
 *      wrapper" -- so the first paragraph renders at body's 18px and full
 *      column width while every other paragraph is 16px inside a 700px measure.
 *   2. `<br><br>` puts a blank line between paragraphs instead of the 16px
 *      margin the real block rule gives them, and the runs are not uniform
 *      (`<br> <br>`, a lone `&nbsp;<br>`), so the gaps up and down one article
 *      disagree with each other.
 *   3. When the body's first block opens on the figure rather than on text, the
 *      "does this body have prose?" sniff in the article page misses it and the
 *      article is laid out as an image-only post, with no sidebar.
 *
 * Rewriting the markup into plain sibling blocks fixes all three at once, and
 * fixes every already-published article without anyone re-opening it. The CMS
 * editor should stop producing this shape for new content too, but that cannot
 * repair the archive.
 */

/** Elements that never have a closing tag, so they must not move the depth. */
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/** A block-level tag inside a paragraph means it is not a plain paragraph. */
const NESTED_BLOCK = /<(?:figure|table|iframe|script|div|p|ul|ol|blockquote|h[1-6])\b/i;

const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g;

interface TopLevelElement {
  /** Lowercased tag name. */
  tag: string;
  /** The opening tag, verbatim, attributes included. */
  open: string;
  /** Everything between the open and close tags. */
  inner: string;
}

/**
 * Walk the top level of `html`, handing each element to `visit`. Anything
 * `visit` returns replaces that element; returning undefined leaves it as it
 * was. Text and comments between elements are passed through untouched.
 */
function mapTopLevel(
  html: string,
  visit: (element: TopLevelElement) => string | undefined,
): string {
  let out = "";
  let cursor = 0;
  let depth = 0;
  let elementStart = 0;
  let openEnd = 0;
  let openTag = "";
  let tagName = "";

  TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG.exec(html)) !== null) {
    const [raw, closing, name, , selfClosing] = match;
    if (raw.startsWith("<!--")) continue;

    const lowered = name.toLowerCase();
    if (VOID_ELEMENTS.has(lowered) || selfClosing) continue;

    if (!closing) {
      if (depth === 0) {
        elementStart = match.index;
        openEnd = TAG.lastIndex;
        openTag = raw;
        tagName = lowered;
      }
      depth += 1;
      continue;
    }

    // A stray close tag with nothing open is malformed markup; ignore it
    // rather than letting the depth go negative and desynchronise the walk.
    if (depth === 0) continue;
    depth -= 1;
    if (depth !== 0) continue;

    const replacement = visit({
      tag: tagName,
      open: openTag,
      inner: html.slice(openEnd, match.index),
    });
    if (replacement !== undefined) {
      out += html.slice(cursor, elementStart) + replacement;
      cursor = TAG.lastIndex;
    }
  }

  return out + html.slice(cursor);
}

/**
 * Leading and trailing whitespace, non-breaking spaces and line breaks. A
 * literal U+00A0 needs no alternative of its own: JavaScript's `\s` matches it.
 */
const EDGE_PADDING = /^(?:\s|&nbsp;|&#160;|<br\s*\/?>)+|(?:\s|&nbsp;|&#160;|<br\s*\/?>)+$/gi;

const PADDING = "(?:\\s|&nbsp;|&#160;)";
const BR = "<br\\s*/?>";

/**
 * What counts as a paragraph break depends on which shape the body is in, and
 * the difference is the whole reason there are two of these.
 *
 * A Trix body is a flat run of <div>s, one per paragraph, so a <br> inside one
 * is never structure the author built -- it is a paragraph the paste flattened.
 * Any run of them splits.
 *
 * A legacy WordPress body is <p> per paragraph, and its <br>s are frequently
 * deliberate: staff lists, addresses, event listings. Only a run of two or
 * more, or a single one carrying an emptied-out paragraph's stray non-breaking
 * space, is unambiguous enough to split there.
 */
const TRIX_PARAGRAPH_BREAK = new RegExp(`(?:${BR}${PADDING}*)+`, "gi");
const LEGACY_PARAGRAPH_BREAK = new RegExp(
  "(?:" +
    `${BR}${PADDING}*(?:${BR}${PADDING}*)+` +
    "|" +
    `(?:&nbsp;|&#160;|\\u00a0)\\s*${BR}\\s*` +
    "|" +
    `\\s*${BR}\\s*(?:&nbsp;|&#160;|\\u00a0)` +
  ")",
  "gi",
);

function trimEdges(html: string): string {
  return html.replace(EDGE_PADDING, "");
}

/**
 * Pull a lead `<figure>` out of the block that also holds the first paragraph,
 * so the figure becomes a sibling of the prose rather than its container. This
 * is also the shape the figure crop rules in global.css are written against
 * (`figure:has(+ p)`), which a nested figure never matched.
 */
function hoistLeadingFigure(inner: string): { figure: string; rest: string } {
  const match = /^\s*(<figure\b[\s\S]*?<\/figure>)/i.exec(inner);
  if (!match) return { figure: "", rest: inner };
  return { figure: match[1], rest: inner.slice(match[0].length) };
}

/** Split a paragraph block on pasted-in line-break paragraph marks. */
function splitParagraphs(inner: string, tag: string): string[] {
  const breaks = tag === "div" ? TRIX_PARAGRAPH_BREAK : LEGACY_PARAGRAPH_BREAK;
  return inner
    .split(breaks)
    .map(trimEdges)
    .filter((part) => part !== "");
}

export function normalizeArticleHtml(html: string): string {
  if (!html) return html;

  return mapTopLevel(html, ({ tag, open, inner }) => {
    if (tag !== "div" && tag !== "p") return undefined;

    const { figure, rest } = hoistLeadingFigure(inner);
    const close = `</${tag}>`;

    // Splitting is only safe once we know the block is plain prose: a block
    // holding a table or an embed may well contain <br>s that are not
    // paragraph marks, and its structure is not ours to rearrange.
    const parts = NESTED_BLOCK.test(rest)
      ? [trimEdges(rest)].filter((part) => part !== "")
      : splitParagraphs(rest, tag);

    if (!figure && parts.length === 1 && parts[0] === inner) return undefined;

    return figure + parts.map((part) => `${open}${part}${close}`).join("");
  });
}
