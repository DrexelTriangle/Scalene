// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';
import { VitePWA } from "vite-plugin-pwa";

// https://astro.build/config
export default defineConfig({
  host: '0.0.0.0',
  output: 'server',
  adapter: node({
    mode: 'standalone', // required!
  }),
  // The guest form submits multipart/form-data through the nginx reverse
  // proxy, which terminates TLS. Astro's checkOrigin compares the browser
  // Origin (https) against the app's computed origin (http/localhost behind
  // the proxy), so it rejects the submission. These endpoints are public and
  // unauthenticated, so CSRF origin-checking adds little; disable it.
  security: {
    checkOrigin: false,
  },
  integrations: [react(), tailwind()],
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
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
          globPatterns: ["**/*.{js,css,ico,png,svg,webp,woff,woff2}"],
          // Too large to precache (3.66 MB, over workbox's 2 MB limit);
          // exclude it so the build doesn't warn/exit non-zero.
          globIgnores: ["**/images/Rectangle.webp"],
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
      })
    ]
  }
});