import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { normalizeArticleHtml } from "../src/utils/articleHtml.ts";
import vectors from "../src/utils/embed-vectors.json" with { type: "json" };
import { expandShortcodes, expandShortcodesWith, stripShortcodes } from "../src/utils/shortcodes.ts";

const includes = (haystack: string, needle: string) =>
  assert.ok(haystack.includes(needle), `expected to find ${JSON.stringify(needle)} in:\n${haystack}`);
const excludes = (haystack: string, needle: string) =>
  assert.ok(!haystack.includes(needle), `expected not to find ${JSON.stringify(needle)} in:\n${haystack}`);

describe("legacy shortcodes stay exactly as they render today", () => {
  const YOUTUBE_OUT = `\n        <div class="article-embed article-embed-video">\n            <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen title="YouTube video"></iframe>\n        </div>`;

  it("expands [youtube URL] into the 16:9 video box", () => {
    assert.equal(expandShortcodes("[youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ]"), YOUTUBE_OUT);
  });

  it("drops the size hints on a [youtube URL&amp;w=..&amp;h=..] shortcode", () => {
    assert.equal(expandShortcodes("[youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ&amp;w=560&amp;h=315]"), YOUTUBE_OUT);
  });

  it("expands the WordPress-era [soundcloud url=... /] into the player iframe", () => {
    const out = expandShortcodes(
      `[soundcloud url="https://api.soundcloud.com/tracks/123" params="auto_play=false" width="100%" height="300" iframe="true" /]`,
    );
    assert.equal(
      out,
      `\n        <div class="article-embed article-embed-audio">\n            <iframe src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F123&amp;auto_play=false" width="100%" height="300" loading="lazy" scrolling="no" allow="autoplay" title="SoundCloud player"></iframe>\n        </div>`,
    );
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
      `<p>Before</p><div class="article-embed article-embed-audio"><iframe src="https://open.spotify.com/embed/episode/7makk4oTQel546B0PZlDM5" width="100%" height="152" loading="lazy" allow="encrypted-media" title="Spotify player"></iframe></div><p>After</p>`,
    );
  });

  it("replaces a <div> holding only the shortcode, even with whitespace around it", () => {
    const out = expand(`<div>\n  ${spotify}\n</div>`);
    includes(out, '<div class="article-embed article-embed-audio">');
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
      `<div class="article-embed article-embed-video article-embed-portrait"><iframe src="https://www.tiktok.com/player/v1/6718335390845095173" loading="lazy" allow="fullscreen" title="TikTok video"></iframe></div>`,
    );
  });
});

describe("instagram", () => {
  it("emits the official blockquote with a plain link fallback", () => {
    const out = expand(`<p>[instagram url="https://www.instagram.com/p/Cabc123_-x/?igsh=t" /]</p>`);
    assert.equal(
      out,
      `<div class="article-embed article-embed-social"><blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/Cabc123_-x/" data-instgrm-version="14"><a href="https://www.instagram.com/p/Cabc123_-x/">View this post on Instagram</a></blockquote></div>`,
    );
  });

  it("keeps a valid permalink free of quotes inside the attribute", () => {
    const out = expand(`<p>[instagram url="https://www.instagram.com/p/Cabc123_-x/" /]</p>`);
    includes(out, 'data-instgrm-permalink="https://www.instagram.com/p/Cabc123_-x/" data-instgrm-version');
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
    includes(out, `<audio controls preload="metadata" src="${ported}"`);
  });

  it("decodes a CMS-saved &amp; once and escapes it once", () => {
    const out = expand(`<div>[audio src="${MEDIA}/wp-content/uploads/2026/10/a&amp;b.mp3" /]</div>`);
    includes(out, `<audio controls preload="metadata" src="${MEDIA}/wp-content/uploads/2026/10/a&amp;b.mp3"`);
    excludes(out, "&amp;amp;");
  });

  it("decodes a numeric &#038; the same way", () => {
    const out = expand(`<div>[audio src="${MEDIA}/wp-content/uploads/2026/10/a&#038;b.mp3" /]</div>`);
    includes(out, `<audio controls preload="metadata" src="${MEDIA}/wp-content/uploads/2026/10/a&amp;b.mp3"`);
    excludes(out, "&amp;amp;");
  });

  it("emits a native player and an open link", () => {
    const out = expand(`<div>[audio src="${src}" /]</div>`);
    assert.equal(
      out,
      `<div class="article-embed article-embed-audio"><audio controls preload="metadata" src="${src}" aria-label="Audio player"></audio><a class="article-embed-link" href="${src}">Open MP3</a></div>`,
    );
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
    const expanded = expand(`<p>[instagram url="https://www.instagram.com/p/Cabc123_-x/" /]</p>`);
    assert.equal(normalizeArticleHtml(expanded), expanded);
  });
});

describe("quiz shortcode becomes a slot the article page fills", () => {
  it("replaces a <p> holding only [quiz id] with the slot div", () => {
    assert.equal(
      expand(`<p>Before</p><p>[quiz id="12"]</p><p>After</p>`),
      `<p>Before</p><div class="tr-quiz-slot" data-quiz-id="12"></div><p>After</p>`,
    );
  });

  // The shared vectors are the CMS's own accept and reject lists, so this
  // site expands exactly the blocks the CMS editor treats as quiz cards.
  for (const v of vectors.quiz.accept) {
    it(`expands the shared vector ${v.input.trim()} to the slot for quiz ${v.id}`, () => {
      assert.equal(expand(`<div>${v.input}</div>`), `<div class="tr-quiz-slot" data-quiz-id="${v.id}"></div>`);
    });
  }

  for (const input of vectors.quiz.reject) {
    it(`leaves the shared reject ${input} as text`, () => {
      assert.equal(expand(`<p>${input}</p>`), `<p>${input}</p>`);
    });
  }

  it("leaves a single-quoted id as text, as the CMS parser does", () => {
    assert.equal(expand(`<p>[quiz id='7']</p>`), `<p>[quiz id='7']</p>`);
  });

  it("leaves an empty id as text rather than a slot with no id", () => {
    assert.equal(expand(`<p>[quiz id=""]</p>`), `<p>[quiz id=""]</p>`);
  });

  it("leaves a quiz shortcode inside a sentence as text", () => {
    const html = `<p>Take the quiz [quiz id="3"] now</p>`;
    assert.equal(expand(html), html);
  });

  it("strips a bare [quiz] from excerpts", () => {
    assert.equal(stripShortcodes("Intro [quiz] outro"), "Intro   outro");
  });

  it("strips a quiz shortcode with its id from excerpts", () => {
    assert.equal(stripShortcodes(`Intro [quiz id="12"] outro`), "Intro   outro");
  });
});
