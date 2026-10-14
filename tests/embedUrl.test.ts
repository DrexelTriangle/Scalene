import { describe, it } from "node:test";
import assert from "node:assert/strict";

import vectors from "../src/utils/embed-vectors.json" with { type: "json" };
import {
  audioToShortcode,
  embedToShortcode,
  encodeShortcodeUrl,
  parseAudioShortcode,
  parseAudioUrl,
  parseEmbedUrl,
  parseMediaPaths,
  shortcodeToAudio,
  shortcodeToEmbed,
} from "../src/utils/embedUrl.ts";

describe("parseEmbedUrl", () => {
  for (const v of vectors.accept) {
    it(`accepts ${v.input}`, () => {
      assert.deepEqual(parseEmbedUrl(v.input), { ok: true, embed: { provider: v.provider, url: v.url } });
    });
  }
  for (const v of vectors.reject) {
    it(`rejects ${v.input || "(empty)"} as ${v.reason}`, () => {
      assert.deepEqual(parseEmbedUrl(v.input), { ok: false, reason: v.reason });
    });
  }
});

describe("parseAudioUrl", () => {
  const base = vectors.audio.mediaBaseUrl;
  for (const v of vectors.audio.accept) {
    it(`accepts ${v.input}`, () => {
      assert.equal(parseAudioUrl(v.input, base), v.url);
    });
  }
  for (const input of vectors.audio.reject) {
    it(`rejects ${input || "(empty)"}`, () => {
      assert.equal(parseAudioUrl(input, base), null);
    });
  }
  it("rejects everything when the media base URL is unset", () => {
    assert.equal(parseAudioUrl(vectors.audio.accept[0].input, ""), null);
  });
  const ported = "https://media.example.test:8443/wp-content/uploads/2026/10/ep1.mp3";
  it("accepts a port when the media base URL has the same port", () => {
    assert.equal(parseAudioUrl(ported, "https://media.example.test:8443"), ported);
  });
  it("rejects a port when the media base URL has no port", () => {
    assert.equal(parseAudioUrl(ported, "https://media.example.test"), null);
  });
  it("still rejects userinfo", () => {
    assert.equal(
      parseAudioUrl("https://u:p@media.example.test:8443/wp-content/uploads/2026/10/ep1.mp3", "https://media.example.test:8443"),
      null,
    );
  });
});

describe("shortcode round trip", () => {
  for (const v of vectors.shortcodes) {
    it(`parses and re-emits ${v.text}`, () => {
      const embed = shortcodeToEmbed(v.text);
      assert.deepEqual(embed, { provider: v.provider, url: v.url });
      assert.equal(embedToShortcode(embed!), v.text);
    });
  }
  for (const text of vectors.shortcodeRejects) {
    it(`does not parse ${text}`, () => {
      assert.equal(shortcodeToEmbed(text), null);
    });
  }
  it("round-trips audio", () => {
    const base = vectors.audio.mediaBaseUrl;
    const src = vectors.audio.accept[0].url;
    const text = audioToShortcode(src);
    assert.equal(text, `[audio src="${src}" /]`);
    assert.equal(shortcodeToAudio(text, base), src);
  });
  it("round-trips the audio source line, quotes and brackets included", () => {
    const base = vectors.audio.mediaBaseUrl;
    const src = vectors.audio.accept[0].url;
    const text = audioToShortcode(src, ` WKDU "91.7" [FM] `);
    assert.equal(text, `[audio src="${src}" source="WKDU%20%2291.7%22%20%5BFM%5D" /]`);
    assert.deepEqual(parseAudioShortcode(text, base), { src, source: 'WKDU "91.7" [FM]' });
  });
  it("cuts the source to 120 characters on write", () => {
    const src = vectors.audio.accept[0].url;
    const text = audioToShortcode(src, "y".repeat(130));
    assert.equal(text, `[audio src="${src}" source="${"y".repeat(120)}" /]`);
  });
  it("reads an audio shortcode without a source", () => {
    const base = vectors.audio.mediaBaseUrl;
    const src = vectors.audio.accept[0].url;
    assert.deepEqual(parseAudioShortcode(`[audio src="${src}" /]`, base), { src, source: "" });
  });
  it("tolerates surrounding whitespace", () => {
    assert.deepEqual(shortcodeToEmbed("  [youtube https://youtu.be/dQw4w9WgXcQ]\n"), {
      provider: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });
});

describe("encodeShortcodeUrl", () => {
  it("percent-encodes the characters that would break a shortcode attribute", () => {
    assert.equal(encodeShortcodeUrl('https://a.test/x"y]z w<>'), "https://a.test/x%22y%5Dz%20w%3C%3E");
  });
  it("leaves an already safe URL alone", () => {
    const url = "https://soundcloud.com/a/b?secret_token=s-1&x=%20";
    assert.equal(encodeShortcodeUrl(url), url);
  });
});

describe("parseMediaPaths", () => {
  const base = "https://media.example.test";
  const one = "/wp-content/uploads/scalene/instagram/abc/1.webp";
  it("returns absolute URLs on the media origin", () => {
    assert.deepEqual(parseMediaPaths(`${one}, /wp-content/uploads/scalene/instagram/abc/2.jpg`, base), [
      `${base}${one}`,
      `${base}/wp-content/uploads/scalene/instagram/abc/2.jpg`,
    ]);
  });
  for (const bad of [
    "https://media.example.test/wp-content/uploads/x.webp",
    "/other/x.webp",
    "/wp-content/uploads/../x.webp",
    "/wp-content/uploads//x.webp",
    "/wp-content/uploads/x.webp?x=1",
    "/wp-content/uploads/x.svg",
    `${one},/wp-content/uploads/x.gif`,
  ]) {
    it(`rejects the whole list for ${bad}`, () => {
      assert.deepEqual(parseMediaPaths(bad, base), []);
    });
  }
  it("returns nothing for an empty list or an unset base", () => {
    assert.deepEqual(parseMediaPaths("", base), []);
    assert.deepEqual(parseMediaPaths(one, ""), []);
  });
});
