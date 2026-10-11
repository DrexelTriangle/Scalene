# Article embeds, Scalene side: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render four new article shortcodes (`[spotify]`, `[tiktok]`, `[instagram]`, `[audio]`) on thetriangle.org, with tests, without changing how any existing article renders.

**Architecture:** A new block-level pass in `src/utils/shortcodes.ts` rides on the existing `mapTopLevel` walker from `src/utils/articleHtml.ts`. It fires only when a top-level `<p>` or `<div>` contains exactly one new shortcode, replaces the whole block, and never touches the legacy `[youtube]`/`[soundcloud]` regexes. URL validation lives in a new `src/utils/embedUrl.ts`, a byte-identical copy of the module the CMS editor will use, exercised by a shared `embed-vectors.json`.

**Tech Stack:** Astro 7 (SSR, node adapter), TypeScript strict, `he` for entity decoding, Vitest (new, Node environment), Tailwind 3 in `global.css`.

**Spec:** `/Users/eden/Documents/code/triangle/triangle-cms/docs/superpowers/specs/2026-10-06-article-embeds-design.md` (sections 2, 4, 5, 8, 9). Read it before starting.

## Global constraints

- Never edit `youtubeEmbed`, `soundcloudEmbed`, `puzzlemeEmbed` or the three legacy `.replace` calls in `expandShortcodes`. The 246 legacy embeds must render byte-identically before and after this work.
- No new runtime dependency. `he` is already present. Vitest is a dev dependency only.
- No edits to `src/pages/proxy/[...image].ts`, nginx, Cloudflare, deploy workflows or `astro.config.mjs`.
- Every size in emitted markup is a class or an HTML attribute, never an inline `style` (the article page strips width/height from inline styles, `[article].astro:117-128`).
- Every attribute value emitted goes through `escapeAttribute`. Every output URL is rebuilt from validated parts, never echoed from input.
- Entities in a captured attribute value are decoded exactly once with `he.decode` before URL parsing.
- `.mp3` matches case-insensitively.
- Headings, comments and PR text: sentence case, no em dashes, straight quotes.
- Branch: `feature/article-embeds` (already created from `main` at `293fe29`). Commit after every task. Do not push or open a PR; Eden does that per his standing rule.
- Run Scalene commands from `/Users/eden/Documents/code/triangle/Scalene` with Node 22 (`.nvmrc`).

## Review focus

Inputs the spec implies but no earlier draft tested. Each has a test in the task that owns it.

1. A `[spotify url="..."]` written inside a sentence in a `<p>` must stay as text, not become a player mid-paragraph (Task 3).
2. A Spotify share URL carrying `?si=...` must produce an embed URL with no query string (Task 2).
3. An `[instagram]` shortcode whose URL has a `>` inside the attribute (`?x=">`) must not break out of `data-instgrm-permalink` (Task 3).
4. A `[tiktok]` block inside a `<div>` that also contains other text must stay as text (Task 3).
5. `[audio]` with the right host but an `http:` scheme must stay as text (Task 2).

---

### Task 1: Vitest setup and a legacy-behavior pin

**Files:**
- Modify: `package.json` (scripts, devDependencies)
- Create: `vitest.config.ts`
- Create: `src/utils/shortcodes.test.ts`

**Interfaces:**
- Produces: `npm test` runs Vitest in the Node environment over `src/**/*.test.ts`. CI already runs `npm test` when the script exists (`.github/workflows/ci.yml:66-68`), so no workflow edit is needed.

- [ ] **Step 1: Install Vitest as a dev dependency**

Run: `npm install --save-dev vitest@^3.2.0`
Expected: `package.json` devDependencies gains `"vitest": "^3.2.x"` and `package-lock.json` updates. Note: `main` already has a stash named `pre-pull package-lock` from an earlier session; ignore it.

- [ ] **Step 2: Add the test script**

In `package.json`, inside `"scripts"`, after `"lint:fix"`, add:

```json
    "test": "vitest run"
```

- [ ] **Step 3: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

// Node environment on purpose: these tests cover pure string and URL logic in
// src/utils. Nothing here needs a DOM, and jsdom would be a second dev
// dependency with nothing to exercise.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write a test that pins the legacy YouTube and SoundCloud output**

Create `src/utils/shortcodes.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { expandShortcodes } from "./shortcodes";

describe("legacy shortcodes stay exactly as they render today", () => {
  it("expands [youtube URL] into the 16:9 video box", () => {
    const out = expandShortcodes("[youtube https://www.youtube.com/watch?v=abc123XYZ_-]");
    expect(out).toContain('<div class="article-embed article-embed-video">');
    expect(out).toContain('src="https://www.youtube.com/embed/abc123XYZ_-"');
  });

  it("expands the WordPress-era [soundcloud url=... /] into the player iframe", () => {
    const out = expandShortcodes(
      `[soundcloud url="https://api.soundcloud.com/tracks/123" params="auto_play=false" width="100%" height="300" iframe="true" /]`,
    );
    expect(out).toContain('<div class="article-embed article-embed-audio">');
    expect(out).toContain("w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F123");
    expect(out).toContain('height="300"');
  });

  it("leaves an unknown shortcode visible as text", () => {
    expect(expandShortcodes("<p>[sic]</p>")).toBe("<p>[sic]</p>");
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: 3 passed.

- [ ] **Step 6: Confirm lint and astro check still pass**

Run: `npm run lint && npm run check`
Expected: both exit 0. If eslint flags `vitest.config.ts`, add it to the eslint ignore list in `eslint.config.js` next to any existing config-file ignores rather than changing rules.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/utils/shortcodes.test.ts
git commit -m "test: add Vitest and pin legacy shortcode output"
```

---

### Task 2: Shared URL parser and test vectors

**Files:**
- Create: `src/utils/embedUrl.ts`
- Create: `src/utils/embed-vectors.json`
- Create: `src/utils/embedUrl.test.ts`

**Interfaces:**
- Produces:
  - `type EmbedProvider = "youtube" | "soundcloud" | "spotify" | "tiktok" | "instagram"`
  - `type Embed = { provider: EmbedProvider; url: string }`
  - `type ParseResult = { ok: true; embed: Embed } | { ok: false; reason: "short-link" | "invalid" }`
  - `parseEmbedUrl(input: string): ParseResult`
  - `parseAudioUrl(input: string, mediaBaseUrl: string): string | null` (returns the normalized `https://origin/path.mp3` or null)
  - `encodeShortcodeUrl(url: string): string`
  - `embedToShortcode(embed: Embed): string`
  - `shortcodeToEmbed(text: string): Embed | null`
  - `audioToShortcode(src: string): string`
  - `shortcodeToAudio(text: string, mediaBaseUrl: string): string | null`
- This file must stay byte-identical to `frontend/src/lib/embedUrl.ts` in triangle-cms. The CMS plan creates that copy from this exact content. If one changes, change both.

- [ ] **Step 1: Write the vectors file**

Create `src/utils/embed-vectors.json`:

```json
{
  "accept": [
    { "input": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "provider": "youtube", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { "input": "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "provider": "youtube", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { "input": "https://www.youtube.com/watch?v=dQw4w9WgXcQ&amp;w=560&amp;h=315", "provider": "youtube", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { "input": "https://m.youtube.com/watch?v=dQw4w9WgXcQ", "provider": "youtube", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { "input": "https://youtu.be/dQw4w9WgXcQ", "provider": "youtube", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { "input": "https://www.youtube.com/shorts/dQw4w9WgXcQ", "provider": "youtube", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { "input": "https://www.youtube.com/live/dQw4w9WgXcQ", "provider": "youtube", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { "input": "https://soundcloud.com/thetriangle/episode-one", "provider": "soundcloud", "url": "https://soundcloud.com/thetriangle/episode-one" },
    { "input": "https://soundcloud.com/thetriangle/episode-one?si=abc&utm_source=x", "provider": "soundcloud", "url": "https://soundcloud.com/thetriangle/episode-one" },
    { "input": "https://soundcloud.com/thetriangle/private-ep?secret_token=s-AbC123", "provider": "soundcloud", "url": "https://soundcloud.com/thetriangle/private-ep?secret_token=s-AbC123" },
    { "input": "https://api.soundcloud.com/tracks/123456789", "provider": "soundcloud", "url": "https://api.soundcloud.com/tracks/123456789" },
    { "input": "https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5", "provider": "spotify", "url": "https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5" },
    { "input": "https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5?si=xyz", "provider": "spotify", "url": "https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5" },
    { "input": "https://open.spotify.com/intl-de/track/7makk4oTQel546B0PZlDM5", "provider": "spotify", "url": "https://open.spotify.com/track/7makk4oTQel546B0PZlDM5" },
    { "input": "https://open.spotify.com/intl-pt-br/show/7makk4oTQel546B0PZlDM5/", "provider": "spotify", "url": "https://open.spotify.com/show/7makk4oTQel546B0PZlDM5" },
    { "input": "https://www.tiktok.com/@scout2015/video/6718335390845095173", "provider": "tiktok", "url": "https://www.tiktok.com/@scout2015/video/6718335390845095173" },
    { "input": "https://m.tiktok.com/@scout2015/video/6718335390845095173?is_from_webapp=1", "provider": "tiktok", "url": "https://www.tiktok.com/@scout2015/video/6718335390845095173" },
    { "input": "https://www.instagram.com/p/Cabc123_-x/", "provider": "instagram", "url": "https://www.instagram.com/p/Cabc123_-x/" },
    { "input": "https://www.instagram.com/p/Cabc123_-x/?igsh=tracking", "provider": "instagram", "url": "https://www.instagram.com/p/Cabc123_-x/" },
    { "input": "https://www.instagram.com/reel/Cabc123_-x", "provider": "instagram", "url": "https://www.instagram.com/reel/Cabc123_-x/" },
    { "input": "https://www.instagram.com/reels/Cabc123_-x/", "provider": "instagram", "url": "https://www.instagram.com/reel/Cabc123_-x/" },
    { "input": "https://www.instagram.com/thetriangle/p/Cabc123_-x/", "provider": "instagram", "url": "https://www.instagram.com/p/Cabc123_-x/" },
    { "input": "https://www.instagram.com/p/Cabc123_-x/?x=\"><img onerror=1>", "provider": "instagram", "url": "https://www.instagram.com/p/Cabc123_-x/" }
  ],
  "reject": [
    { "input": "https://vm.tiktok.com/ZMabc/", "reason": "short-link" },
    { "input": "https://vt.tiktok.com/ZMabc/", "reason": "short-link" },
    { "input": "https://spotify.link/abc", "reason": "short-link" },
    { "input": "https://on.soundcloud.com/abc", "reason": "short-link" },
    { "input": "https://www.youtube.com/watch?v=short", "reason": "invalid" },
    { "input": "https://www.youtube.com/channel/UCabc", "reason": "invalid" },
    { "input": "https://open.spotify.com/track/tooshort", "reason": "invalid" },
    { "input": "https://www.tiktok.com/@scout2015", "reason": "invalid" },
    { "input": "https://www.instagram.com/tv/Cabc123_-x/", "reason": "invalid" },
    { "input": "https://evil.example/watch?v=dQw4w9WgXcQ", "reason": "invalid" },
    { "input": "https://user:pw@www.youtube.com/watch?v=dQw4w9WgXcQ", "reason": "invalid" },
    { "input": "https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ", "reason": "invalid" },
    { "input": "javascript:alert(1)", "reason": "invalid" },
    { "input": "not a url", "reason": "invalid" },
    { "input": "", "reason": "invalid" }
  ],
  "audio": {
    "mediaBaseUrl": "https://media.example.test",
    "accept": [
      { "input": "https://media.example.test/wp-content/uploads/2026/10/ep1.mp3", "url": "https://media.example.test/wp-content/uploads/2026/10/ep1.mp3" },
      { "input": "https://media.example.test/wp-content/uploads/2026/10/EP1.MP3", "url": "https://media.example.test/wp-content/uploads/2026/10/EP1.MP3" },
      { "input": "https://media.example.test/wp-content/uploads/2026/10/ep1.mp3?ver=2#t=10", "url": "https://media.example.test/wp-content/uploads/2026/10/ep1.mp3" }
    ],
    "reject": [
      "http://media.example.test/wp-content/uploads/2026/10/ep1.mp3",
      "https://other.example.test/wp-content/uploads/2026/10/ep1.mp3",
      "https://media.example.test/other/ep1.mp3",
      "https://media.example.test/wp-content/uploads/2026/10/ep1.wav",
      "https://media.example.test/wp-content/uploads/2026/10/ep1.mp3.html",
      "https://user@media.example.test/wp-content/uploads/2026/10/ep1.mp3",
      "javascript:alert(1)",
      "blob:https://cms.example/abc",
      ""
    ]
  },
  "shortcodes": [
    { "text": "[youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ]", "provider": "youtube", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { "text": "[soundcloud url=\"https://soundcloud.com/thetriangle/episode-one\" /]", "provider": "soundcloud", "url": "https://soundcloud.com/thetriangle/episode-one" },
    { "text": "[spotify url=\"https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5\" /]", "provider": "spotify", "url": "https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5" },
    { "text": "[tiktok url=\"https://www.tiktok.com/@scout2015/video/6718335390845095173\" /]", "provider": "tiktok", "url": "https://www.tiktok.com/@scout2015/video/6718335390845095173" },
    { "text": "[instagram url=\"https://www.instagram.com/p/Cabc123_-x/\" /]", "provider": "instagram", "url": "https://www.instagram.com/p/Cabc123_-x/" }
  ],
  "shortcodeRejects": [
    "[Spotify]",
    "[spotify]",
    "[tiktok url=]",
    "[instagram url=\"https://www.instagram.com/tv/Cabc123_-x/\" /]",
    "[spotify url=\"https://spotify.link/abc\" /]",
    "Listen: [spotify url=\"https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5\" /]"
  ]
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/utils/embedUrl.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import vectors from "./embed-vectors.json";
import {
  audioToShortcode,
  embedToShortcode,
  encodeShortcodeUrl,
  parseAudioUrl,
  parseEmbedUrl,
  shortcodeToAudio,
  shortcodeToEmbed,
} from "./embedUrl";

describe("parseEmbedUrl", () => {
  for (const v of vectors.accept) {
    it(`accepts ${v.input}`, () => {
      expect(parseEmbedUrl(v.input)).toEqual({ ok: true, embed: { provider: v.provider, url: v.url } });
    });
  }
  for (const v of vectors.reject) {
    it(`rejects ${v.input || "(empty)"} as ${v.reason}`, () => {
      expect(parseEmbedUrl(v.input)).toEqual({ ok: false, reason: v.reason });
    });
  }
});

describe("parseAudioUrl", () => {
  const base = vectors.audio.mediaBaseUrl;
  for (const v of vectors.audio.accept) {
    it(`accepts ${v.input}`, () => {
      expect(parseAudioUrl(v.input, base)).toBe(v.url);
    });
  }
  for (const input of vectors.audio.reject) {
    it(`rejects ${input || "(empty)"}`, () => {
      expect(parseAudioUrl(input, base)).toBeNull();
    });
  }
  it("rejects everything when the media base URL is unset", () => {
    expect(parseAudioUrl(vectors.audio.accept[0].input, "")).toBeNull();
  });
});

describe("shortcode round trip", () => {
  for (const v of vectors.shortcodes) {
    it(`parses and re-emits ${v.text}`, () => {
      const embed = shortcodeToEmbed(v.text);
      expect(embed).toEqual({ provider: v.provider, url: v.url });
      expect(embedToShortcode(embed!)).toBe(v.text);
    });
  }
  for (const text of vectors.shortcodeRejects) {
    it(`does not parse ${text}`, () => {
      expect(shortcodeToEmbed(text)).toBeNull();
    });
  }
  it("round-trips audio", () => {
    const base = vectors.audio.mediaBaseUrl;
    const src = vectors.audio.accept[0].url;
    const text = audioToShortcode(src);
    expect(text).toBe(`[audio src="${src}" /]`);
    expect(shortcodeToAudio(text, base)).toBe(src);
  });
  it("tolerates surrounding whitespace", () => {
    expect(shortcodeToEmbed("  [youtube https://youtu.be/dQw4w9WgXcQ]\n")).toEqual({
      provider: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });
});

describe("encodeShortcodeUrl", () => {
  it("percent-encodes the characters that would break a shortcode attribute", () => {
    expect(encodeShortcodeUrl('https://a.test/x"y]z w<>')).toBe("https://a.test/x%22y%5Dz%20w%3C%3E");
  });
  it("leaves an already safe URL alone", () => {
    const url = "https://soundcloud.com/a/b?secret_token=s-1&x=%20";
    expect(encodeShortcodeUrl(url)).toBe(url);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npm test -- embedUrl`
Expected: FAIL, "Cannot find module './embedUrl'" (or an equivalent resolution error).

- [ ] **Step 4: Write the module**

Create `src/utils/embedUrl.ts`. This file is shared verbatim with the CMS editor; keep it free of Astro, DOM and Node imports.

```ts
/**
 * Share-URL validation and shortcode (de)serialization for article embeds.
 *
 * This file is copied byte-for-byte into the CMS editor
 * (triangle-cms/frontend/src/lib/embedUrl.ts) so that what the editor accepts
 * and what this site renders can never disagree. Both copies run the same
 * embed-vectors.json. Change one, change both.
 *
 * Every accepted URL is rebuilt from its validated parts (host plus captured
 * ID). Nothing a writer pasted reaches the page as-is, which is what keeps
 * tracking parameters and attribute-breaking characters out of the markup.
 */

export type EmbedProvider = "youtube" | "soundcloud" | "spotify" | "tiktok" | "instagram";

export type Embed = { provider: EmbedProvider; url: string };

export type ParseResult =
  | { ok: true; embed: Embed }
  | { ok: false; reason: "short-link" | "invalid" };

const INVALID: ParseResult = { ok: false, reason: "invalid" };
const SHORT_LINK: ParseResult = { ok: false, reason: "short-link" };

/** Hosts whose links need a redirect to resolve. We do no network calls, so
 *  these get a specific message asking for the full URL. */
const SHORT_LINK_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com", "spotify.link", "on.soundcloud.com"]);

const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com"]);
const SOUNDCLOUD_HOSTS = new Set(["soundcloud.com", "www.soundcloud.com", "api.soundcloud.com"]);
const TIKTOK_HOSTS = new Set(["www.tiktok.com", "tiktok.com", "m.tiktok.com"]);
const INSTAGRAM_HOSTS = new Set(["www.instagram.com", "instagram.com"]);

const YOUTUBE_ID = /^[\w-]{11}$/;
const YOUTUBE_PATH_ID = /^\/(?:shorts|live)\/([\w-]{11})\/?$/;
const YOUTU_BE_PATH = /^\/([\w-]{11})\/?$/;
const SOUNDCLOUD_PATH = /^\/(?:[\w.-]+\/[\w.-]+|tracks\/\d+)\/?$/;
const SPOTIFY_INTL_PREFIX = /^\/intl-[a-z]{2}(?:-[a-z]{2})?(?=\/)/;
const SPOTIFY_PATH = /^\/(track|episode|show|album|playlist)\/([A-Za-z0-9]{22})\/?$/;
const TIKTOK_PATH = /^\/@([\w.-]+)\/video\/(\d+)\/?$/;
const INSTAGRAM_PATH = /^\/(?:[\w.]+\/)?(p|reel|reels)\/([A-Za-z0-9_-]+)\/?$/;

/** Parse a user-supplied string as an http(s) URL with no userinfo or port. */
function parseUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  return url;
}

function youtube(id: string): ParseResult {
  if (!YOUTUBE_ID.test(id)) return INVALID;
  return { ok: true, embed: { provider: "youtube", url: `https://www.youtube.com/watch?v=${id}` } };
}

export function parseEmbedUrl(input: string): ParseResult {
  const url = parseUrl(input);
  if (!url) return INVALID;
  const host = url.hostname.toLowerCase();

  if (SHORT_LINK_HOSTS.has(host)) return SHORT_LINK;

  if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === "/watch") return youtube(url.searchParams.get("v") ?? "");
    const m = YOUTUBE_PATH_ID.exec(url.pathname);
    return youtube(m ? m[1] : "");
  }
  if (host === "youtu.be") {
    const m = YOUTU_BE_PATH.exec(url.pathname);
    return youtube(m ? m[1] : "");
  }
  if (SOUNDCLOUD_HOSTS.has(host)) {
    if (!SOUNDCLOUD_PATH.test(url.pathname)) return INVALID;
    // SoundCloud's ID is not in the share URL, so the path is kept. The query
    // is dropped except secret_token, which private tracks need to play.
    const out = new URL(`https://${host}${url.pathname.replace(/\/$/, "")}`);
    const token = url.searchParams.get("secret_token");
    if (token && /^[\w-]+$/.test(token)) out.searchParams.set("secret_token", token);
    return { ok: true, embed: { provider: "soundcloud", url: out.toString() } };
  }
  if (host === "open.spotify.com") {
    const m = SPOTIFY_PATH.exec(url.pathname.replace(SPOTIFY_INTL_PREFIX, ""));
    if (!m) return INVALID;
    return { ok: true, embed: { provider: "spotify", url: `https://open.spotify.com/${m[1]}/${m[2]}` } };
  }
  if (TIKTOK_HOSTS.has(host)) {
    const m = TIKTOK_PATH.exec(url.pathname);
    if (!m) return INVALID;
    return { ok: true, embed: { provider: "tiktok", url: `https://www.tiktok.com/@${m[1]}/video/${m[2]}` } };
  }
  if (INSTAGRAM_HOSTS.has(host)) {
    const m = INSTAGRAM_PATH.exec(url.pathname);
    if (!m) return INVALID;
    const kind = m[1] === "reels" ? "reel" : m[1];
    return { ok: true, embed: { provider: "instagram", url: `https://www.instagram.com/${kind}/${m[2]}/` } };
  }
  return INVALID;
}

/**
 * Validate an uploaded-audio URL: https, exactly the media origin, under the
 * WordPress uploads prefix, an .mp3 path. Returns the URL with query and
 * fragment removed, or null. An empty mediaBaseUrl rejects everything, which
 * is what a build without MEDIA_BASE_URL should do.
 */
export function parseAudioUrl(input: string, mediaBaseUrl: string): string | null {
  const url = parseUrl(input);
  if (!url || url.protocol !== "https:") return null;
  let origin: string;
  try {
    origin = new URL(mediaBaseUrl).origin;
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  if (!url.pathname.startsWith("/wp-content/uploads/")) return null;
  if (!/\.mp3$/i.test(url.pathname)) return null;
  return `${url.origin}${url.pathname}`;
}

/**
 * The shortcode attribute grammar: inside url="..." only these characters
 * appear. Everything else is percent-encoded, so a quote or a closing bracket
 * can never end the attribute or the shortcode early.
 */
const SHORTCODE_SAFE_CHAR = /^[A-Za-z0-9\-._~:/?#@!$&'()*+,;=%]$/;

export function encodeShortcodeUrl(url: string): string {
  let out = "";
  for (const ch of url) {
    out += SHORTCODE_SAFE_CHAR.test(ch) ? ch : encodeURIComponent(ch);
  }
  return out;
}

/** One template per provider; YouTube keeps its legacy bare form. */
export function embedToShortcode(embed: Embed): string {
  if (embed.provider === "youtube") return `[youtube ${embed.url}]`;
  return `[${embed.provider} url="${encodeShortcodeUrl(embed.url)}" /]`;
}

const YOUTUBE_SHORTCODE = /^\[youtube\s+(\S+?)\s*\/?\]$/i;
const ATTR_SHORTCODE = /^\[(soundcloud|spotify|tiktok|instagram)\b([^\]]*?)\s*\/?\]$/i;
const URL_ATTR = /\burl\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * Parse text that is exactly one shortcode. Legacy attribute-form shortcodes
 * with extra attributes parse too, as long as their url validates. Returns the
 * canonical embed, or null when the text is not one valid shortcode.
 */
export function shortcodeToEmbed(text: string): Embed | null {
  const t = text.trim();
  const yt = YOUTUBE_SHORTCODE.exec(t);
  if (yt) {
    const r = parseEmbedUrl(yt[1]);
    return r.ok && r.embed.provider === "youtube" ? r.embed : null;
  }
  const m = ATTR_SHORTCODE.exec(t);
  if (!m) return null;
  const attr = URL_ATTR.exec(m[2]);
  if (!attr) return null;
  const r = parseEmbedUrl(attr[1] ?? attr[2] ?? "");
  return r.ok && r.embed.provider === m[1].toLowerCase() ? r.embed : null;
}

export function audioToShortcode(src: string): string {
  return `[audio src="${encodeShortcodeUrl(src)}" /]`;
}

const AUDIO_SHORTCODE = /^\[audio\b([^\]]*?)\s*\/?\]$/i;
const SRC_ATTR = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

export function shortcodeToAudio(text: string, mediaBaseUrl: string): string | null {
  const m = AUDIO_SHORTCODE.exec(text.trim());
  if (!m) return null;
  const attr = SRC_ATTR.exec(m[1]);
  if (!attr) return null;
  return parseAudioUrl(attr[1] ?? attr[2] ?? "", mediaBaseUrl);
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- embedUrl`
Expected: all pass. If the `&amp;w=560` vector fails, the cause is that `new URL` keeps `&amp;` literally; `searchParams.get("v")` still returns the ID because `v` is the first parameter, so that vector must pass without any decoding here. Decoding happens in the Scalene expander (Task 3) and is unnecessary in the editor, which reads `textContent`.

- [ ] **Step 6: Type-check**

Run: `npm run check`
Expected: 0 errors. `tsconfig.json` extends Astro's strict preset, which has `resolveJsonModule` enabled, so the JSON import compiles.

- [ ] **Step 7: Commit**

```bash
git add src/utils/embedUrl.ts src/utils/embed-vectors.json src/utils/embedUrl.test.ts
git commit -m "feat: add shared embed URL parser and test vectors"
```

---

### Task 3: Block-level expanders for Spotify, TikTok, Instagram and audio

**Files:**
- Modify: `src/utils/articleHtml.ts:18-20` (export `mapTopLevel`)
- Modify: `src/utils/shortcodes.ts` (new expanders, new pass, wired into `expandShortcodes`)
- Modify: `src/utils/shortcodes.test.ts` (new cases)

**Interfaces:**
- Consumes: `mapTopLevel(html, visit)` from `articleHtml.ts` (currently module-private; export it unchanged). `parseEmbedUrl`, `parseAudioUrl` from Task 2. `he.decode`, `escapeAttribute`, `parseAttributes` already in `shortcodes.ts`.
- Produces: `expandShortcodes(content)` unchanged in signature; new exported `expandShortcodesWith(content, options: { mediaBaseUrl: string })` for tests; emitted markup per the table below.

| Shortcode | Emitted block |
|---|---|
| spotify | `<div class="article-embed article-embed-audio"><iframe src="https://open.spotify.com/embed/{type}/{id}" width="100%" height="{152 or 352}" loading="lazy" allow="encrypted-media" title="Spotify player"></iframe></div>` |
| tiktok | `<div class="article-embed article-embed-video article-embed-portrait"><iframe src="https://www.tiktok.com/player/v1/{id}" loading="lazy" allow="fullscreen" title="TikTok video"></iframe></div>` |
| instagram | `<div class="article-embed article-embed-social"><blockquote class="instagram-media" data-instgrm-permalink="{url}" data-instgrm-version="14"><a href="{url}">View this post on Instagram</a></blockquote></div>` |
| audio | `<div class="article-embed article-embed-audio"><audio controls preload="metadata" src="{src}" aria-label="Audio player"></audio><a class="article-embed-link" href="{src}">Open MP3</a></div>` |

- [ ] **Step 1: Export the walker**

In `src/utils/articleHtml.ts`, change line 18 from `function mapTopLevel(` to `export function mapTopLevel(`. Also export the interface so callers can type the visitor: change `interface TopLevelElement {` (line 43) to `export interface TopLevelElement {`. No other change to that file.

- [ ] **Step 2: Write the failing tests**

Append to `src/utils/shortcodes.test.ts`:

```ts
import { expandShortcodesWith } from "./shortcodes";

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

  it("keeps a <p> whose attributes carry over nothing; the whole element is replaced", () => {
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

  it("decodes entities once: a CMS-saved &amp; in the query still yields the canonical embed", () => {
    const out = expand(
      `<p>[spotify url="https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5?si=1&amp;x=2" /]</p>`,
    );
    expect(out).toContain('src="https://open.spotify.com/embed/episode/7makk4oTQel546B0PZlDM5"');
    expect(out).not.toContain("&amp;amp;");
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

  it("cannot be broken out of with a quote in the pasted URL", () => {
    const html = `<p>[instagram url="https://www.instagram.com/p/Cabc123_-x/?x=%22%3E%3Cimg%20onerror=1%3E" /]</p>`;
    const out = expand(html);
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("%22");
  });
});

describe("audio", () => {
  const src = `${MEDIA}/wp-content/uploads/2026/10/ep1.mp3`;

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

  it("stays as text on http, on another host, or outside uploads", () => {
    for (const bad of [
      `http://media.example.test/wp-content/uploads/2026/10/ep1.mp3`,
      `https://other.example.test/wp-content/uploads/2026/10/ep1.mp3`,
      `${MEDIA}/other/ep1.mp3`,
    ]) {
      const html = `<div>[audio src="${bad}" /]</div>`;
      expect(expand(html)).toBe(html);
    }
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
  it("produces no <p> wrapping the embed and no empty <p> siblings", async () => {
    const { normalizeArticleHtml } = await import("./articleHtml");
    const out = normalizeArticleHtml(
      expand(`<p>One</p><p>[spotify url="https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5" /]</p><p>Two</p>`),
    );
    expect(out).not.toMatch(/<p[^>]*>\s*<div class="article-embed/);
    expect(out).not.toMatch(/<p>\s*<\/p>/);
    expect(out).toContain("<p>One</p>");
    expect(out).toContain("<p>Two</p>");
  });

  it("still renders a bare legacy youtube shortcode between two paragraphs", async () => {
    const { normalizeArticleHtml } = await import("./articleHtml");
    const out = normalizeArticleHtml(expand(`<p>One</p>\n[youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ]\n<p>Two</p>`));
    expect(out).toContain("youtube.com/embed/dQw4w9WgXcQ");
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npm test -- shortcodes`
Expected: FAIL on the import of `expandShortcodesWith`.

- [ ] **Step 4: Implement the expanders and the block pass**

In `src/utils/shortcodes.ts`, add these imports under the existing `import he from "he";`:

```ts
import { mapTopLevel } from "./articleHtml";
import { parseAudioUrl, parseEmbedUrl } from "./embedUrl";
```

Add the four expanders after `youtubeEmbed` and before `expandShortcodes`:

```ts
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
  return `<div class="article-embed article-embed-audio"><iframe src="${escapeAttribute(`https://open.spotify.com/embed/${m[1]}/${m[2]}`)}" width="100%" height="${height}" loading="lazy" allow="encrypted-media" title="Spotify player"></iframe></div>`;
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
  return `<div class="article-embed article-embed-video article-embed-portrait"><iframe src="${escapeAttribute(`https://www.tiktok.com/player/v1/${m[1]}`)}" loading="lazy" allow="fullscreen" title="TikTok video"></iframe></div>`;
}

/**
 * Instagram has no documented script-free embed. This is the official
 * blockquote; embed.js, injected by the article page only when this markup is
 * present, upgrades it into the post. Until then, and if the script never
 * loads, the reader sees the link.
 * Source: developers.facebook.com/docs/instagram-platform/oembed
 */
function instagramEmbed(url: string): string | null {
  const parsed = parseEmbedUrl(url);
  if (!parsed.ok || parsed.embed.provider !== "instagram") return null;
  const permalink = escapeAttribute(parsed.embed.url);
  return `<div class="article-embed article-embed-social"><blockquote class="instagram-media" data-instgrm-permalink="${permalink}" data-instgrm-version="14"><a href="${permalink}">View this post on Instagram</a></blockquote></div>`;
}

/**
 * Uploaded MP3 on our own media origin. The src is validated against
 * MEDIA_BASE_URL so an [audio] shortcode can never point the player at a
 * third party. The link is "Open" rather than a download attribute, which
 * browsers ignore across origins.
 */
function audioEmbed(src: string, mediaBaseUrl: string): string | null {
  const valid = parseAudioUrl(src, mediaBaseUrl);
  if (!valid) return null;
  const safe = escapeAttribute(valid);
  return `<div class="article-embed article-embed-audio"><audio controls preload="metadata" src="${safe}" aria-label="Audio player"></audio><a class="article-embed-link" href="${safe}">Open MP3</a></div>`;
}

/** The new shortcodes, each matched only as the entire content of a block. */
const BLOCK_SHORTCODE = /^\[(spotify|tiktok|instagram|audio)\b([^\]]*?)\s*\/?\]$/i;
const URL_ATTRIBUTE = /\b(url|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

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
  const m = BLOCK_SHORTCODE.exec(text);
  if (!m) return undefined;
  const attr = URL_ATTRIBUTE.exec(m[2]);
  if (!attr) return undefined;
  // Decode once: a body saved by the CMS editor stores & as &amp;.
  const value = he.decode(attr[2] ?? attr[3] ?? "");
  switch (m[1].toLowerCase()) {
    case "spotify":
      return spotifyEmbed(value) ?? undefined;
    case "tiktok":
      return tiktokEmbed(value) ?? undefined;
    case "instagram":
      return instagramEmbed(value) ?? undefined;
    case "audio":
      return attr[1].toLowerCase() === "src" ? (audioEmbed(value, mediaBaseUrl) ?? undefined) : undefined;
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
```

Replace the existing `expandShortcodes` with:

```ts
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
// [audio] shortcodes stay as text, never that the build fails.
const MEDIA_BASE_URL = String(import.meta.env.MEDIA_BASE_URL ?? "");

export function expandShortcodes(content: string): string {
  return expandShortcodesWith(content, { mediaBaseUrl: MEDIA_BASE_URL });
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all pass, including Task 1's legacy pins. If the `<p class="x" style=...>` test fails, check that `mapTopLevel`'s replacement spans from `elementStart` through the close tag (it does: `out += html.slice(cursor, elementStart) + replacement` then advances `cursor` past the close tag), so the open tag's attributes are dropped with the element.

- [ ] **Step 6: Type-check and lint**

Run: `npm run check && npm run lint`
Expected: 0 errors. If `import.meta.env.MEDIA_BASE_URL` is flagged as untyped, add to `src/env.d.ts` (create it if absent):

```ts
interface ImportMetaEnv {
  readonly MEDIA_BASE_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 7: Commit**

```bash
git add src/utils/articleHtml.ts src/utils/shortcodes.ts src/utils/shortcodes.test.ts src/env.d.ts
git commit -m "feat: expand spotify, tiktok, instagram and audio shortcodes as blocks"
```

---

### Task 4: Styles for the new embed boxes

**Files:**
- Modify: `src/styles/global.css:230-251`

**Interfaces:**
- Consumes: the classes emitted in Task 3: `.article-embed-portrait`, `.article-embed-social`, `.article-embed-link`, and `audio` inside `.article-embed-audio`.

- [ ] **Step 1: Add the rules**

In `src/styles/global.css`, immediately after the block ending at line 251 (`#article .article-embed-video iframe { ... }`), add:

```css
/*
 * Embeds the CMS editor writes: Spotify (audio box, sized by its own height
 * attribute), TikTok (portrait), Instagram (sizes its own blockquote) and an
 * uploaded MP3 in a native <audio>. Same rule as above: no inline sizes.
 */
#article .article-embed-social {
  @apply my-[16px] mx-[auto] max-w-[700px];
}

#article .article-embed-portrait {
  position: relative;
  width: 100%;
  max-width: 325px;
  aspect-ratio: 9 / 16;
}

#article .article-embed-portrait iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}

#article .article-embed-audio audio {
  display: block;
  width: 100%;
}

#article .article-embed-link {
  display: inline-block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-blue);
}
```

- [ ] **Step 2: Build to prove Tailwind compiles the `@apply`**

Run: `npm run build`
Expected: build succeeds. (`CMS_API_BASE_URL` must be set in the environment for the build to reach the CMS; use the same value the local dev setup uses, per `README.md:23-35`.)

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "style: boxes for portrait, social and native audio embeds"
```

---

### Task 5: Instagram script injection on the article page

**Files:**
- Modify: `src/pages/[sections]/[article].astro:256` (flag) and `:308-313` (script)

**Interfaces:**
- Consumes: the exact opening tag Task 3 emits, `<blockquote class="instagram-media"`.

- [ ] **Step 1: Add the flag next to the puzzle flags**

After line 256 (`const hasPuzzleScript = content.includes("pm-embed-div");`), add:

```ts
// The Instagram expander emits exactly this opening tag; embed.js upgrades the
// blockquote into the post. Keyed on the emitted tag rather than the class
// name alone so prose or a code sample mentioning "instagram-media" does not
// pull the script in. Same pattern as the puzzle script above.
const hasInstagramEmbed = content.includes('<blockquote class="instagram-media"');
```

- [ ] **Step 2: Add the conditional script**

After the puzzle `<script>` block (ends line 313, `></script>)}`), add:

```astro
        {hasInstagramEmbed && (
        <script
            is:inline
            async
            src="https://www.instagram.com/embed.js"
        ></script>)}
```

No `integrity` attribute: Instagram ships embed.js unversioned and rotates it, so a pinned hash would break the embed on their next deploy. This is a recorded decision in the spec (section 3).

- [ ] **Step 3: Check**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "src/pages/[sections]/[article].astro"
git commit -m "feat: load Instagram embed.js only when an article embeds a post"
```

---

### Task 6: Vector drift check in CI

**Files:**
- Modify: `.github/workflows/ci.yml` (one step, after the `Test` step at line 66-68)

**Interfaces:**
- Consumes: `src/utils/embed-vectors.json` from Task 2 and, once the CMS PR merges, `frontend/src/lib/embed-vectors.json` on triangle-cms `main`.

Both repos are public, so a raw fetch needs no token. The step fetches `main` rather than a pinned commit: the CMS copy does not exist yet while this PR is open, so a 404 skips the check with a warning, and the check activates by itself the day the CMS PR merges. This deviates from the spec's "pinned commit" wording for that reason; record it in the PR.

- [ ] **Step 1: Add the step**

After the `Test` step, add:

```yaml
      # The CMS editor and this site each carry a copy of embed-vectors.json so
      # neither can accept a URL the other rejects. The CMS copy is the source;
      # this fails the build when the two drift. A fetch failure (including the
      # 404 before the CMS copy exists) only warns, so an outage elsewhere can
      # never block a Scalene deploy.
      - name: Check embed vectors match triangle-cms
        run: |
          url="https://raw.githubusercontent.com/DrexelTriangle/triangle-cms/main/frontend/src/lib/embed-vectors.json"
          if ! curl -fsSL "$url" -o /tmp/cms-vectors.json; then
            echo "::warning::could not fetch $url; skipping embed vector drift check"
            exit 0
          fi
          if ! diff -q /tmp/cms-vectors.json src/utils/embed-vectors.json; then
            echo "::error::src/utils/embed-vectors.json differs from the triangle-cms copy; sync both repos"
            diff /tmp/cms-vectors.json src/utils/embed-vectors.json || true
            exit 1
          fi
```

- [ ] **Step 2: Validate the workflow file**

Run: `npx --yes yaml-lint .github/workflows/ci.yml` or, if unavailable, `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"`
Expected: no error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: fail when embed vectors drift from triangle-cms"
```

---

### Task 7: Browser checks and PR text

**Files:**
- None in the repo. Output is a checklist result pasted into the PR description.

- [ ] **Step 1: Run the dev server against a local CMS**

Run: `npm run dev` (needs the triangle-cms API on `https://localhost:8080`, per `README.md:23-35`).

- [ ] **Step 2: Create a test article in the CMS admin with this exact body**

The CMS editor cannot write these yet, so paste the body through the article API or a direct DB edit on the local instance:

```html
<p>Spotify episode</p>
<div>[spotify url="https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5" /]</div>
<p>TikTok</p>
<div>[tiktok url="https://www.tiktok.com/@scout2015/video/6718335390845095173" /]</div>
<p>Instagram</p>
<div>[instagram url="https://www.instagram.com/p/CUbHfhpswxt/" /]</div>
<p>Legacy YouTube</p>
[youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ]
<p>SoundCloud share URL, not the legacy api form</p>
<div>[soundcloud url="https://soundcloud.com/forss/flickermood" /]</div>
<p>Uploaded MP3</p>
<div>[audio src="<MEDIA_BASE_URL>/wp-content/uploads/<any existing mp3 or a test file you upload>" /]</div>
```

- [ ] **Step 3: Check each item and record the result**

- Spotify player renders at 152px, no horizontal scroll at 375px wide.
- TikTok player renders inside a 325px-wide portrait box with no clipping. If the player is clipped, note it; the fix is to leave the query as is (no `description=1` is emitted) and adjust nothing else.
- Instagram post renders after embed.js loads; with the network tab blocking `instagram.com`, the plain link shows instead.
- The MP3 plays and seeking works (drag the scrubber); `MEDIA_BASE_URL` must be set in the dev server's environment or the block stays as text.
- With `instagram.com` blocked in the network tab, the Instagram fallback link renders as a plain link, not as a quote.
- Legacy YouTube renders exactly as on production for the same shortcode.
- SoundCloud share URL plays through the existing expander. If it does not, the SoundCloud accept vector for `soundcloud.com/{user}/{track}` must be removed from `embed-vectors.json` in both repos before the CMS PR, and the spec's SoundCloud row updated.
- Response headers on `www.thetriangle.org` (production, read only): record whether a `Content-Security-Policy` header exists. If it does, list the `frame-src`, `script-src` and `media-src` values for Sachin. Do not change anything.

- [ ] **Step 4: Write the PR description**

Use this text, filling in the checklist results:

```
Render four new article shortcodes written by the CMS editor: [spotify], [tiktok], [instagram], [audio]. Nothing about existing [youtube] and [soundcloud] rendering changes; their regexes are untouched and now pinned by tests.

What changed
- src/utils/embedUrl.ts: share-URL validation, shared byte-for-byte with the CMS editor, with embed-vectors.json as the common test set.
- src/utils/shortcodes.ts: a block pass on the existing mapTopLevel walker. A new shortcode expands only when it is the whole content of a top-level <p> or <div>, and the whole block is replaced.
- global.css: portrait, social and native-audio boxes.
- [article].astro: Instagram's embed.js is injected only when an article embeds a post, the same way the AmuseLabs script is.
- First test file in this repo. Vitest runs under the existing CI "Test" step. One new CI step diffs embed-vectors.json against the triangle-cms copy; it warns and skips until that copy exists on main.

Not changed: the media proxy, nginx, Cloudflare, deploy scripts, MEDIA_BASE_URL handling. When MEDIA_BASE_URL is unset at build time, [audio] shortcodes stay as text.

Deploy note: these expanders must stay deployed once the CMS starts writing the shortcodes (triangle-cms PR to follow). Rolling this back after that PR ships would show raw shortcode text on affected articles.

Browser checks (local dev server): <results from step 3>
Production CSP header: <present / absent; values if present>
```

- [ ] **Step 5: Hand to Eden**

Stop. Eden reviews the branch and decides on push and PR per his standing rule for these repos.
