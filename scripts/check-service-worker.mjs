// Build-output smoke check for the PWA service worker.
//
// vite-plugin-pwa generates the worker from a Vite hook it skips on SSR builds,
// and Astro marks every build environment SSR -- so the worker silently stopped
// being emitted while manifest.webmanifest and registerSW.js kept appearing.
// The site advertised a PWA whose /sw.js 404ed for months. astro.config.mjs
// drives the generation explicitly now; this check fails the build if that
// wiring ever breaks again.
//
// Run after `npm run build`: node scripts/check-service-worker.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const clientDir = resolve(import.meta.dirname, "..", "dist", "client");

const problems = [];

let sw = "";
try {
  sw = readFileSync(resolve(clientDir, "sw.js"), "utf-8");
} catch {
  problems.push("dist/client/sw.js is missing -- the service worker was not generated.");
}

let entries = [];
if (sw) {
  const workbox = readdirSync(clientDir).filter((f) => /^workbox-[^/]+\.js$/.test(f));
  if (workbox.length === 0)
    problems.push("dist/client/workbox-*.js is missing -- sw.js would 404 on its own runtime.");

  entries = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
  if (entries.length === 0)
    problems.push("sw.js precaches nothing -- check the workbox globPatterns.");

  // Every precached URL must actually exist at the site root, or the worker
  // fails to install and the whole PWA goes dead.
  for (const entry of entries) {
    try {
      statSync(resolve(clientDir, entry));
    } catch {
      problems.push(`sw.js precaches "${entry}", which is not in dist/client.`);
    }
  }

  // HTML is served by the SSR server and must never come from the cache.
  const html = entries.filter((e) => e.endsWith(".html") || e.endsWith("/"));
  if (html.length > 0)
    problems.push(`sw.js precaches HTML (${html.join(", ")}); pages would be served stale.`);
}

if (problems.length > 0) {
  console.error("Service worker check failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`Service worker check passed: sw.js precaches ${entries.length} assets.`);
