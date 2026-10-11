import { describe, expect, it } from "vitest";

import { normalizeArticleHtml } from "./articleHtml";
import { expandShortcodes, expandShortcodesWith } from "./shortcodes";

describe("legacy shortcodes stay exactly as they render today", () => {
  const YOUTUBE_OUT = `\n        <div class="article-embed article-embed-video">\n            <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen title="YouTube video"></iframe>\n        </div>`;

  it("expands [youtube URL] into the 16:9 video box", () => {
    expect(expandShortcodes("[youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ]")).toBe(YOUTUBE_OUT);
  });

  it("drops the size hints on a [youtube URL&amp;w=..&amp;h=..] shortcode", () => {
    expect(expandShortcodes("[youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ&amp;w=560&amp;h=315]")).toBe(YOUTUBE_OUT);
  });

  it("expands the WordPress-era [soundcloud url=... /] into the player iframe", () => {
    const out = expandShortcodes(
      `[soundcloud url="https://api.soundcloud.com/tracks/123" params="auto_play=false" width="100%" height="300" iframe="true" /]`,
    );
    expect(out).toBe(`\n        <div class="article-embed article-embed-audio">\n            <iframe src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F123&amp;auto_play=false" width="100%" height="300" loading="lazy" scrolling="no" allow="autoplay" title="SoundCloud player"></iframe>\n        </div>`);
  });

  it("leaves an unknown shortcode visible as text", () => {
    expect(expandShortcodes("<p>[sic]</p>")).toBe("<p>[sic]</p>");
  });
});

const MEDIA = "https://media.example.test";
const expand = (html: string) => expandShortcodesWith(html, { mediaBaseUrl: MEDIA });

describe("block shortcodes expand only as the whole content of a top-level block", () => {
  const spotify = `[spotify url="https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5" /]`;

  it("replaces a <p> holding only the shortcode, with no <p> left around the embed", () => {
    const out = expand(`<p>Before</p><p>${spotify}</p><p>After</p>`);
    expect(out).toBe(
      `<p>Before</p><div class="article-embed article-embed-audio"><iframe src="https://open.spotify.com/embed/episode/7makk4oTQel546B0PZlDM5" width="100%" height="152" loading="lazy" allow="encrypted-media" title="Spotify player"></iframe></div><p>After</p>`,
    );
  });

  it("replaces a <div> holding only the shortcode, even with whitespace around it", () => {
    const out = expand(`<div>\n  ${spotify}\n</div>`);
    expect(out).toContain('<div class="article-embed article-embed-audio">');
    expect(out).not.toContain("[spotify");
  });

  it("replaces the whole <p>, attributes included", () => {
    const out = expand(`<p class="x" style="color:red">${spotify}</p>`);
    expect(out.startsWith('<div class="article-embed')).toBe(true);
  });

  it("uses the full-height player for shows, albums and playlists", () => {
    const out = expand(`<p>[spotify url="https://open.spotify.com/show/7makk4oTQel546B0PZlDM5" /]</p>`);
    expect(out).toContain('height="352"');
  });

  it("leaves a shortcode inside a sentence as text", () => {
    const html = `<p>Listen: ${spotify}</p>`;
    expect(expand(html)).toBe(html);
  });

  it("leaves a shortcode sharing a block with other markup as text", () => {
    const html = `<div>${spotify}<p>caption</p></div>`;
    expect(expand(html)).toBe(html);
  });

  it("leaves a shortcode inside <code> as text", () => {
    const html = `<p><code>${spotify}</code></p>`;
    expect(expand(html)).toBe(html);
  });

  it("leaves a shortcode inside an attribute value as text", () => {
    const html = `<p><img alt="x>${spotify}" src="/a.png"></p>`;
    expect(expand(html)).toBe(html);
  });

  it("leaves a shortcode inside <script> as text", () => {
    const html = `<script>var s = '${spotify}';</script>`;
    expect(expand(html)).toBe(html);
  });

  it("leaves [Spotify] prose alone", () => {
    expect(expand("<p>[Spotify]</p>")).toBe("<p>[Spotify]</p>");
  });

  it("leaves a shortcode with an invalid URL visible as text", () => {
    const html = `<p>[spotify url="https://spotify.link/abc" /]</p>`;
    expect(expand(html)).toBe(html);
  });
});

describe("shortcode names and attributes are exact", () => {
  const episode = "https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5";

  it.each([
    `[spotify-foo url="${episode}" /]`,
    `[spotify data-url="${episode}" /]`,
    `[spotify src="${episode}" /]`,
  ])("leaves %s as text", (shortcode) => {
    const html = `<p>${shortcode}</p>`;
    expect(expand(html)).toBe(html);
  });
});

describe("tiktok", () => {
  it("emits the portrait player built from the video id", () => {
    const out = expand(`<p>[tiktok url="https://www.tiktok.com/@scout2015/video/6718335390845095173?is_from_webapp=1" /]</p>`);
    expect(out).toBe(
      `<div class="article-embed article-embed-video article-embed-portrait"><iframe src="https://www.tiktok.com/player/v1/6718335390845095173" loading="lazy" allow="fullscreen" title="TikTok video"></iframe></div>`,
    );
  });
});

describe("instagram", () => {
  it("emits the official blockquote with a plain link fallback", () => {
    const out = expand(`<p>[instagram url="https://www.instagram.com/p/Cabc123_-x/?igsh=t" /]</p>`);
    expect(out).toBe(
      `<div class="article-embed article-embed-social"><blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/Cabc123_-x/" data-instgrm-version="14"><a href="https://www.instagram.com/p/Cabc123_-x/">View this post on Instagram</a></blockquote></div>`,
    );
  });

  it("keeps a valid permalink free of quotes inside the attribute", () => {
    const out = expand(`<p>[instagram url="https://www.instagram.com/p/Cabc123_-x/" /]</p>`);
    expect(out).toContain('data-instgrm-permalink="https://www.instagram.com/p/Cabc123_-x/" data-instgrm-version');
  });

  it("stays as text when the hostile characters sit in the path", () => {
    const html = `<p>[instagram url="https://www.instagram.com/p/Cabc%22%3E%3Cimg%20onerror=1%3E/" /]</p>`;
    expect(expand(html)).toBe(html);
  });
});

describe("audio", () => {
  const src = `${MEDIA}/wp-content/uploads/2026/10/ep1.mp3`;

  it("expands a src on a ported media origin", () => {
    const ported = "https://media.example.test:8443/wp-content/uploads/2026/10/ep1.mp3";
    const out = expandShortcodesWith(`<div>[audio src="${ported}" /]</div>`, { mediaBaseUrl: "https://media.example.test:8443" });
    expect(out).toContain(`<audio controls preload="metadata" src="${ported}"`);
  });
  
  it("decodes a CMS-saved &amp; once and escapes it once", () => {
    const out = expand(`<div>[audio src="${MEDIA}/wp-content/uploads/2026/10/a&amp;b.mp3" /]</div>`);
    expect(out).toContain(`<audio controls preload="metadata" src="${MEDIA}/wp-content/uploads/2026/10/a&amp;b.mp3"`);
    expect(out).not.toContain("&amp;amp;");
  });

  it("decodes a numeric &#038; the same way", () => {
    const out = expand(`<div>[audio src="${MEDIA}/wp-content/uploads/2026/10/a&#038;b.mp3" /]</div>`);
    expect(out).toContain(`<audio controls preload="metadata" src="${MEDIA}/wp-content/uploads/2026/10/a&amp;b.mp3"`);
    expect(out).not.toContain("&amp;amp;");
  });

  it("emits a native player and an open link", () => {
    const out = expand(`<div>[audio src="${src}" /]</div>`);
    expect(out).toBe(
      `<div class="article-embed article-embed-audio"><audio controls preload="metadata" src="${src}" aria-label="Audio player"></audio><a class="article-embed-link" href="${src}">Open MP3</a></div>`,
    );
  });

  it("accepts an uppercase extension", () => {
    const upper = `${MEDIA}/wp-content/uploads/2026/10/EP1.MP3`;
    expect(expand(`<div>[audio src="${upper}" /]</div>`)).toContain(`src="${upper}"`);
  });

  it.each([
    `http://media.example.test/wp-content/uploads/2026/10/ep1.mp3`,
    `https://other.example.test/wp-content/uploads/2026/10/ep1.mp3`,
    `${MEDIA}/other/ep1.mp3`,
  ])("stays as text for %s", (bad) => {
    const html = `<div>[audio src="${bad}" /]</div>`;
    expect(expand(html)).toBe(html);
  });

  it("stays as text when the media base URL is unset", () => {
    const html = `<div>[audio src="${src}" /]</div>`;
    expect(expandShortcodesWith(html, { mediaBaseUrl: "" })).toBe(html);
  });

  it("leaves legacy [audio archives] prose alone", () => {
    expect(expand("<p>[audio archives]</p>")).toBe("<p>[audio archives]</p>");
  });
});

describe("pipeline with normalizeArticleHtml", () => {
  it("produces no <p> wrapping the embed and no empty <p> siblings", () => {
    const out = normalizeArticleHtml(
      expand(`<p>One</p><p>[spotify url="https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5" /]</p><p>Two</p>`),
    );
    expect(out).not.toMatch(/<p[^>]*>\s*<div class="article-embed/);
    expect(out).not.toMatch(/<p>\s*<\/p>/);
    expect(out).toContain("<p>One</p>");
    expect(out).toContain("<p>Two</p>");
  });

  it("still renders a bare legacy youtube shortcode between two paragraphs", () => {
    const out = normalizeArticleHtml(expand(`<p>One</p>\n[youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ]\n<p>Two</p>`));
    expect(out).toContain("youtube.com/embed/dQw4w9WgXcQ");
  });

  it("passes an expanded [audio] block through unchanged", () => {
    const expanded = expand(`<div>[audio src="${MEDIA}/wp-content/uploads/2026/10/ep1.mp3" /]</div>`);
    expect(normalizeArticleHtml(expanded)).toBe(expanded);
  });

  it("passes an expanded [instagram] block through unchanged", () => {
    const expanded = expand(`<p>[instagram url="https://www.instagram.com/p/Cabc123_-x/" /]</p>`);
    expect(normalizeArticleHtml(expanded)).toBe(expanded);
  });
});
