// Keeps the hashed build assets of earlier deploys servable.
//
// Article pages are cached by Cloudflare for up to 30 days (ArticleLayout.astro),
// and each cached page names the _astro/ CSS and JS of the build that rendered
// it. `astro build` empties dist/ first, so without this every deploy deleted
// the files a month of cached pages still point at: once Cloudflare dropped its
// own copy of one, those pages came back unstyled and with dead scripts.
//
// So every build's _astro/ files are copied into an archive beside the checkout
// (.asset-archive/, gitignored), and archived files the new build does not have
// are copied back into dist/client/_astro. A file is pruned once it has been
// absent from the builds for longer than RETENTION_MS, which has to outlast the
// longest edge TTL on an HTML page.
//
// Content-hashed names never collide, so restoring a file can't shadow a newer
// one. The archive lives in the deploy checkout on each host; both the prod
// deploy (git merge --ff-only) and the dev sync (git checkout --force) leave
// ignored files alone.

import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

/** 60 days: twice the 30-day article s-maxage, so a page cached on its last day still loads. */
export const RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

const MANIFEST = ".manifest.json";

/** Every file under dir, as paths relative to it. Missing dir: none. */
async function listFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  return entries
    .filter((entry) => entry.isFile())
    // relative(), not a slice: dir may or may not end in a separator.
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .filter((rel) => rel !== MANIFEST);
}

async function readManifest(archiveDir) {
  try {
    const parsed = JSON.parse(await readFile(join(archiveDir, MANIFEST), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // Missing or corrupt: start over. Worst case a file is kept a while longer.
    return {};
  }
}

async function copyInto(from, to) {
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
}

/**
 * Records the assets currently in assetsDir as live at `now`, without restoring
 * or pruning anything. Run before a build empties dist/, so the build being
 * replaced is archived even on the first deploy that carries this code.
 */
export async function snapshotAssets({ assetsDir, archiveDir, now = Date.now() }) {
  const current = await listFiles(assetsDir);
  if (current.length === 0) return { archived: 0 };
  await mkdir(archiveDir, { recursive: true });
  const manifest = await readManifest(archiveDir);
  const archived = new Set(await listFiles(archiveDir));
  // Only files the archive has never seen. dist/ also holds the earlier
  // builds' files retainAssets restored into it, and stamping those "seen now"
  // on every build would keep them forever: their retention must keep counting
  // from the last build that actually produced them.
  let added = 0;
  for (const rel of current) {
    if (archived.has(rel)) continue;
    await copyInto(join(assetsDir, rel), join(archiveDir, rel));
    manifest[rel] = now;
    added++;
  }
  await writeFile(join(archiveDir, MANIFEST), JSON.stringify(manifest));
  return { archived: added };
}

/**
 * After a build: archive the new assets, restore earlier builds' assets into
 * assetsDir, and prune the archive of anything retired for longer than maxAgeMs.
 */
export async function retainAssets({ assetsDir, archiveDir, now = Date.now(), maxAgeMs = RETENTION_MS }) {
  await mkdir(archiveDir, { recursive: true });
  const manifest = await readManifest(archiveDir);
  const current = new Set(await listFiles(assetsDir));
  const archived = await listFiles(archiveDir);

  for (const rel of current) {
    if (!archived.includes(rel)) await copyInto(join(assetsDir, rel), join(archiveDir, rel));
    manifest[rel] = now;
  }

  let restored = 0;
  let pruned = 0;
  for (const rel of archived) {
    if (current.has(rel)) continue;
    // A file with no record predates the manifest; treat it as seen now
    // rather than deleting something a cached page may still need.
    const lastSeen = typeof manifest[rel] === "number" ? manifest[rel] : now;
    if (now - lastSeen > maxAgeMs) {
      await rm(join(archiveDir, rel), { force: true });
      delete manifest[rel];
      pruned++;
      continue;
    }
    manifest[rel] = lastSeen;
    await copyInto(join(archiveDir, rel), join(assetsDir, rel));
    restored++;
  }

  // Drop records for files that are gone from both places.
  for (const rel of Object.keys(manifest)) {
    if (!current.has(rel) && !archived.includes(rel)) delete manifest[rel];
  }
  await writeFile(join(archiveDir, MANIFEST), JSON.stringify(manifest));
  return { current: current.size, restored, pruned };
}
