import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { normalizeArticleHtml } from "../src/utils/articleHtml.ts";
import { expandShortcodes, expandShortcodesWith } from "../src/utils/shortcodes.ts";

const includes = (haystack: string, needle: string) =>
  assert.ok(haystack.includes(needle), `expected to find ${JSON.stringify(needle)} in:\n${haystack}`);
const excludes = (haystack: string, needle: string) =>
  assert.ok(!haystack.includes(needle), `expected not to find ${JSON.stringify(needle)} in:\n${haystack}`);

describe("legacy shortcodes", () => {
  const YOUTUBE_OUT = `\n        <div class="article-embed article-embed-video">\n            <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen title="YouTube video"></iframe>\n        </div>`;

  it("expands [youtube URL] into the 16:9 video box", () => {
    assert.equal(expandShortcodes("[youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ]"), YOUTUBE_OUT);
  });

  it("drops the size hints on a [youtube URL&amp;w=..&amp;h=..] shortcode", () => {
    assert.equal(expandShortcodes("[youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ&amp;w=560&amp;h=315]"), YOUTUBE_OUT);
  });

  it("expands the WordPress-era [soundcloud url=... /] into our player over the SoundCloud iframe", () => {
    const out = expandShortcodes(
      `[soundcloud url="https://api.soundcloud.com/tracks/123" params="auto_play=false" width="100%" height="300" iframe="true" /]`,
    );
    assert.equal(
      out,
      `<div class="article-embed article-embed-audio tr-audio" data-provider="soundcloud"><p class="article-embed-label">SoundCloud</p><p class="tr-audio-title" hidden></p><div class="tr-audio-host"><iframe src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F123&amp;auto_play=false" width="100%" height="300" loading="lazy" scrolling="no" allow="autoplay" title="SoundCloud player"></iframe></div><div class="tr-audio-row" hidden><button type="button" class="tr-audio-play" aria-label="Play"><span class="tr-audio-tri" aria-hidden="true"></span></button><div class="tr-audio-track" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><div class="tr-audio-fill"></div></div><span class="tr-audio-time">0:00 / 0:00</span></div><a class="article-embed-link" href="https://api.soundcloud.com/tracks/123">Open on SoundCloud</a></div>`,
    );
  });

  it("gives a SoundCloud track off soundcloud.com, or a javascript: URL, no open link", () => {
    for (const bad of ["javascript:alert(1)", "https://evil.test/tracks/1", "not a url"]) {
      const out = expandShortcodes(`[soundcloud url="${bad}" /]`);
      assert.ok(!out.includes("Open on SoundCloud"), bad);
      assert.ok(!out.includes('href="javascript'), bad);
    }
  });

  it("leaves an unknown shortcode visible as text", () => {
    assert.equal(expandShortcodes("<p>[sic]</p>"), "<p>[sic]</p>");
  });
});

const MEDIA = "https://media.example.test";
const expand = (html: string) => expandShortcodesWith(html, { mediaBaseUrl: MEDIA });

describe("block shortcodes expand only as the whole content of a top-level block", () => {
  const spotify = `[spotify url="https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5" /]`;

  it("replaces a <p> holding only the shortcode, with no <p> left around the embed", () => {
    const out = expand(`<p>Before</p><p>${spotify}</p><p>After</p>`);
    assert.equal(
      out,
      `<p>Before</p><div class="article-embed article-embed-audio tr-audio" data-provider="spotify" data-uri="spotify:episode:7makk4oTQel546B0PZlDM5"><p class="article-embed-label">Spotify</p><p class="tr-audio-title" hidden></p><div class="tr-audio-host"><iframe src="https://open.spotify.com/embed/episode/7makk4oTQel546B0PZlDM5" width="100%" height="152" loading="lazy" allow="encrypted-media" title="Spotify player"></iframe></div><div class="tr-audio-row" hidden><button type="button" class="tr-audio-play" aria-label="Play"><span class="tr-audio-tri" aria-hidden="true"></span></button><div class="tr-audio-track" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><div class="tr-audio-fill"></div></div><span class="tr-audio-time">0:00 / 0:00</span></div><a class="article-embed-link" href="https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5">Open on Spotify</a></div><p>After</p>`,
    );
  });

  it("replaces a <div> holding only the shortcode, even with whitespace around it", () => {
    const out = expand(`<div>\n  ${spotify}\n</div>`);
    includes(out, '<div class="article-embed article-embed-audio tr-audio" data-provider="spotify"');
    excludes(out, "[spotify");
  });

  it("replaces the whole <p>, attributes included", () => {
    const out = expand(`<p class="x" style="color:red">${spotify}</p>`);
    assert.equal(out.startsWith('<div class="article-embed'), true);
  });

  it("uses the full-height player for shows, albums and playlists", () => {
    const out = expand(`<p>[spotify url="https://open.spotify.com/show/7makk4oTQel546B0PZlDM5" /]</p>`);
    includes(out, 'height="352"');
  });

  it("leaves a shortcode inside a sentence as text", () => {
    const html = `<p>Listen: ${spotify}</p>`;
    assert.equal(expand(html), html);
  });

  it("leaves a shortcode sharing a block with other markup as text", () => {
    const html = `<div>${spotify}<p>caption</p></div>`;
    assert.equal(expand(html), html);
  });

  it("leaves a shortcode inside <code> as text", () => {
    const html = `<p><code>${spotify}</code></p>`;
    assert.equal(expand(html), html);
  });

  it("leaves a shortcode inside an attribute value as text", () => {
    const html = `<p><img alt="x>${spotify}" src="/a.png"></p>`;
    assert.equal(expand(html), html);
  });

  it("leaves a shortcode inside <script> as text", () => {
    const html = `<script>var s = '${spotify}';</script>`;
    assert.equal(expand(html), html);
  });

  it("leaves [Spotify] prose alone", () => {
    assert.equal(expand("<p>[Spotify]</p>"), "<p>[Spotify]</p>");
  });

  it("leaves a shortcode with an invalid URL visible as text", () => {
    const html = `<p>[spotify url="https://spotify.link/abc" /]</p>`;
    assert.equal(expand(html), html);
  });
});

describe("shortcode names and attributes are exact", () => {
  const episode = "https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5";

  for (const shortcode of [
    `[spotify-foo url="${episode}" /]`,
    `[spotify data-url="${episode}" /]`,
    `[spotify src="${episode}" /]`,
  ]) {
    it(`leaves ${shortcode} as text`, () => {
      const html = `<p>${shortcode}</p>`;
      assert.equal(expand(html), html);
    });
  }
});

describe("tiktok", () => {
  it("emits the portrait player built from the video id", () => {
    const out = expand(`<p>[tiktok url="https://www.tiktok.com/@scout2015/video/6718335390845095173?is_from_webapp=1" /]</p>`);
    assert.equal(
      out,
      `<div class="article-embed article-embed-video article-embed-portrait"><p class="article-embed-label">TikTok</p><div class="article-embed-player"><iframe src="https://www.tiktok.com/player/v1/6718335390845095173" loading="lazy" allow="fullscreen" title="TikTok video"></iframe></div><a class="article-embed-link" href="https://www.tiktok.com/@scout2015/video/6718335390845095173">View on TikTok</a></div>`,
    );
  });
});

describe("instagram", () => {
  const one = "/wp-content/uploads/scalene/instagram/Cabc123_-x/1.webp";
  const two = "/wp-content/uploads/scalene/instagram/Cabc123_-x/2.webp";

  it("renders only the link when the shortcode carries no media", () => {
    const out = expand(`<p>[instagram url="https://www.instagram.com/p/Cabc123_-x/?igsh=t" /]</p>`);
    assert.equal(
      out,
      `<div class="article-embed article-embed-social"><p class="article-embed-label">Instagram</p><a class="article-embed-link" href="https://www.instagram.com/p/Cabc123_-x/">View on Instagram</a></div>`,
    );
  });

  it("renders one image in the holder with no arrows", () => {
    const out = expand(`<p>[instagram url="https://www.instagram.com/p/Cabc123_-x/" media="${one}" /]</p>`);
    assert.equal(
      out,
      `<div class="article-embed article-embed-social tr-ig" data-count="1"><p class="article-embed-label">Instagram</p><div class="tr-ig-frame"><img src="/proxy${one}" alt="" loading="lazy"></div><a class="article-embed-link" href="https://www.instagram.com/p/Cabc123_-x/">View on Instagram</a></div>`,
    );
  });

  it("renders a carousel with the later images hidden and the arrows present", () => {
    const out = expand(`<p>[instagram url="https://www.instagram.com/p/Cabc123_-x/" media="${one},${two}" /]</p>`);
    includes(out, 'data-count="2"');
    includes(out, `<img src="/proxy${one}" alt="" loading="lazy"><img src="/proxy${two}" alt="" loading="lazy" hidden>`);
    includes(out, '<button type="button" class="tr-ig-prev" aria-label="Previous image" hidden>');
  });

  it("drops the whole list when one path is off our origin", () => {
    const out = expand(`<p>[instagram url="https://www.instagram.com/p/Cabc123_-x/" media="${one},https://evil.test/x.webp" /]</p>`);
    excludes(out, "tr-ig-frame");
    includes(out, "View on Instagram");
  });

  it("drops a list that climbs out of the uploads folder", () => {
    const out = expand(`<p>[instagram url="https://www.instagram.com/p/Cabc123_-x/" media="/wp-content/uploads/../../etc/passwd.png" /]</p>`);
    excludes(out, "tr-ig-frame");
  });

  it("serves the images through the site proxy even with no media base URL", () => {
    const out = expandShortcodesWith(`<p>[instagram url="https://www.instagram.com/p/Cabc123_-x/" media="${one}" /]</p>`, { mediaBaseUrl: "" });
    includes(out, `<img src="/proxy${one}"`);
  });

  it("stays as text when the hostile characters sit in the path", () => {
    const html = `<p>[instagram url="https://www.instagram.com/p/Cabc%22%3E%3Cimg%20onerror=1%3E/" /]</p>`;
    assert.equal(expand(html), html);
  });
});

describe("audio", () => {
  const src = `${MEDIA}/wp-content/uploads/2026/10/ep1.mp3`;

  it("expands a src on a ported media origin", () => {
    const ported = "https://media.example.test:8443/wp-content/uploads/2026/10/ep1.mp3";
    const out = expandShortcodesWith(`<div>[audio src="${ported}" /]</div>`, { mediaBaseUrl: "https://media.example.test:8443" });
    includes(out, `<audio preload="metadata" src="${ported}"`);
  });

  it("decodes a CMS-saved &amp; once and escapes it once", () => {
    const out = expand(`<div>[audio src="${MEDIA}/wp-content/uploads/2026/10/a&amp;b.mp3" /]</div>`);
    includes(out, `<audio preload="metadata" src="${MEDIA}/wp-content/uploads/2026/10/a&amp;b.mp3"`);
    excludes(out, "&amp;amp;");
  });

  it("decodes a numeric &#038; the same way", () => {
    const out = expand(`<div>[audio src="${MEDIA}/wp-content/uploads/2026/10/a&#038;b.mp3" /]</div>`);
    includes(out, `<audio preload="metadata" src="${MEDIA}/wp-content/uploads/2026/10/a&amp;b.mp3"`);
    excludes(out, "&amp;amp;");
  });

  const PLAYER = `<audio preload="metadata" src="${src}"></audio><div class="tr-audio-row"><button type="button" class="tr-audio-play" aria-label="Play"><span class="tr-audio-tri" aria-hidden="true"></span></button><div class="tr-audio-track" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><div class="tr-audio-fill"></div></div><span class="tr-audio-time">0:00 / 0:00</span></div><a class="article-embed-link" href="${src}">Open MP3</a>`;

  it("emits our player and an open link", () => {
    const out = expand(`<div>[audio src="${src}" /]</div>`);
    assert.equal(out, `<div class="article-embed article-embed-audio tr-audio" data-provider="file"><p class="article-embed-label">Audio</p>${PLAYER}</div>`);
  });

  it("names the source in the label", () => {
    const out = expand(`<div>[audio src="${src}" source="WKDU%2091.7%20FM" /]</div>`);
    includes(out, '<p class="article-embed-label">Audio from WKDU 91.7 FM</p>');
  });

  it("escapes a source holding markup and a quote", () => {
    const out = expand(`<div>[audio src="${src}" source="%3Cb%3EWKDU%3C%2Fb%3E%20%22live%22" /]</div>`);
    includes(out, "Audio from &lt;b&gt;WKDU&lt;/b&gt; &quot;live&quot;</p>");
  });

  it("cuts a source over 120 characters", () => {
    const long = "x".repeat(121);
    const out = expand(`<div>[audio src="${src}" source="${long}" /]</div>`);
    includes(out, `Audio from ${"x".repeat(120)}</p>`);
    excludes(out, "x".repeat(121));
  });

  it("accepts an uppercase extension", () => {
    const upper = `${MEDIA}/wp-content/uploads/2026/10/EP1.MP3`;
    includes(expand(`<div>[audio src="${upper}" /]</div>`), `src="${upper}"`);
  });

  for (const bad of [
    `http://media.example.test/wp-content/uploads/2026/10/ep1.mp3`,
    `https://other.example.test/wp-content/uploads/2026/10/ep1.mp3`,
    `${MEDIA}/other/ep1.mp3`,
  ]) {
    it(`stays as text for ${bad}`, () => {
      const html = `<div>[audio src="${bad}" /]</div>`;
      assert.equal(expand(html), html);
    });
  }

  it("stays as text when the media base URL is unset", () => {
    const html = `<div>[audio src="${src}" /]</div>`;
    assert.equal(expandShortcodesWith(html, { mediaBaseUrl: "" }), html);
  });

  it("leaves legacy [audio archives] prose alone", () => {
    assert.equal(expand("<p>[audio archives]</p>"), "<p>[audio archives]</p>");
  });
});

describe("pipeline with normalizeArticleHtml", () => {
  it("produces no <p> wrapping the embed and no empty <p> siblings", () => {
    const out = normalizeArticleHtml(
      expand(`<p>One</p><p>[spotify url="https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5" /]</p><p>Two</p>`),
    );
    assert.doesNotMatch(out, /<p[^>]*>\s*<div class="article-embed/);
    assert.doesNotMatch(out, /<p>\s*<\/p>/);
    includes(out, "<p>One</p>");
    includes(out, "<p>Two</p>");
  });

  it("still renders a bare legacy youtube shortcode between two paragraphs", () => {
    const out = normalizeArticleHtml(expand(`<p>One</p>\n[youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ]\n<p>Two</p>`));
    includes(out, "youtube.com/embed/dQw4w9WgXcQ");
  });

  it("passes an expanded [audio] block through unchanged", () => {
    const expanded = expand(`<div>[audio src="${MEDIA}/wp-content/uploads/2026/10/ep1.mp3" /]</div>`);
    assert.equal(normalizeArticleHtml(expanded), expanded);
  });

  it("passes an expanded [instagram] block through unchanged", () => {
    const expanded = expand(`<p>[instagram url="https://www.instagram.com/p/Cabc123_-x/" media="/wp-content/uploads/scalene/instagram/Cabc123_-x/1.webp" /]</p>`);
    assert.equal(normalizeArticleHtml(expanded), expanded);
  });
});
