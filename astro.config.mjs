// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import { VitePWA } from "vite-plugin-pwa";

// vite-plugin-pwa writes the service worker from a Vite `closeBundle` hook that
// it skips whenever `build.ssr` is set. Astro marks *every* build environment
// SSR -- including the client one that writes dist/client -- so that hook never
// fires and sw.js / workbox-*.js are never emitted -- while manifest.webmanifest
// still is, because that comes out of `generateBundle`, which does run. So the
// site advertises a PWA whose worker 404s, and every /sw.js request falls
// through to the [sectionSlug] catch-all and probes the CMS for a section.
//
// So: pin the plugin's outDir to the client output (its swDest and
// globDirectory are both derived from it, and the default would follow whichever
// Vite environment resolved last -- dist/server) and drive generation ourselves
// from `astro:build:done`, which runs once dist/client is fully written.
const pwaPlugins = VitePWA({
  registerType: "autoUpdate",
  // Astro's client assets land in dist/client; the plugin would otherwise
  // resolve sw.js and the precache glob against the wrong directory.
  outDir: "dist/client",
  // Splash.astro registers the worker itself. The plugin's registerSW.js is
  // injected through Vite's transformIndexHtml, which Astro's prerender step
  // never runs -- so leaving it on just ships a file nothing loads.
  injectRegister: null,
  includeAssets: [
    "favicon.ico",
    "favicon-16x16.png",
    "favicon-32x32.png",
    "apple-touch-icon.png",
    "robots.txt",
  ],
  manifest: {
    name: "The Triangle",
    short_name: "The Triangle",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563EB",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ]
  },
  workbox: {
    // This is an SSR site (output: 'server'). Only precache static
    // build assets -- never HTML pages, which are dynamic and would
    // otherwise be served stale from the cache.
    //
    // Scoped to the hashed build output rather than all of dist/client: a
    // blanket **/*.{png,webp,...} sweeps in splash_screens/ (3.1 MB, only ever
    // used by an installed iOS app), old_logos/ (1.7 MB, one page) and per-page
    // art like images/stand_locations.png (991 KB) -- 7.65 MB that every
    // first-time visitor would download in the background. The icons the
    // manifest and includeAssets reference are precached regardless of this.
    globPatterns: ["_astro/**/*.{js,css,woff,woff2}"],
    // Hashed build assets are already immutable; same reasoning as the
    // plugin's default, pinned here because that default is derived from
    // whichever Vite environment resolved last.
    dontCacheBustURLsMatching: /^_astro\//,
    // MPA/SSR site: do NOT serve a cached shell for page navigations.
    // Navigations must always hit the network so pages are never stale.
    navigateFallback: null,
    // Never let the service worker intercept or fall back API calls
    // (form submissions, etc.); always send them straight to network.
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
      },
    ],
  },
});

const pwaApi = pwaPlugins.find((plugin) => plugin.name === "vite-plugin-pwa")?.api;

/** @type {import('astro').AstroIntegration} */
const serviceWorkerIntegration = {
  name: "scalene:service-worker",
  hooks: {
    "astro:build:done": async () => {
      if (!pwaApi)
        throw new Error("vite-plugin-pwa did not expose its API; the service worker would be missing.");
      await pwaApi.generateSW();
    },
  },
};

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone', // required!
  }),
  // Behind the nginx reverse proxy (which terminates TLS), Astro only trusts
  // the forwarded Host / X-Forwarded-Proto headers when the resulting origin
  // matches an allowed domain; otherwise it falls back to "localhost" and its
  // checkOrigin CSRF guard rejects same-site multipart form POSTs (the guest
  // form). Listing our hostnames keeps checkOrigin enabled while letting
  // legitimate submissions through.
  //
  // Requires nginx to forward the real host and scheme, e.g.:
  //   proxy_set_header Host $host;
  //   proxy_set_header X-Forwarded-Proto $scheme;
  security: {
    allowedDomains: [
      { hostname: "www.thetriangle.org" },
      { hostname: "thetriangle.org" },
    ],
  },
  // Tailwind runs through postcss.config.mjs and the site is all .astro -- no
  // framework components to hydrate. The one integration is local: it writes
  // the service worker after the client build (see above).
  integrations: [serviceWorkerIntegration],
  vite: {
    plugins: pwaPlugins,
  }
});
