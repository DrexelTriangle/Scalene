import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RETENTION_MS, retainAssets, snapshotAssets } from "../scripts/asset-retention.mjs";

const DAY = 24 * 60 * 60 * 1000;

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "asset-retention-"));
  const assetsDir = join(root, "dist", "client", "_astro");
  const archiveDir = join(root, ".asset-archive");
  return { root, assetsDir, archiveDir, cleanup: () => rm(root, { recursive: true, force: true }) };
}

async function build(assetsDir: string, files: string[]) {
  await rm(assetsDir, { recursive: true, force: true });
  await mkdir(assetsDir, { recursive: true });
  for (const f of files) {
    await mkdir(join(assetsDir, f, ".."), { recursive: true });
    await writeFile(join(assetsDir, f), f);
  }
}

async function list(dir: string) {
  return (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile() && e.name !== ".manifest.json")
    .map((e) => join(e.parentPath, e.name).slice(dir.length + 1))
    .sort();
}

// The point of the whole module: a page cached from the previous deploy still
// finds its CSS after the next one.
test("an earlier build's assets are served alongside the new build's", async () => {
  const t = await setup();
  try {
    await build(t.assetsDir, ["Base.aaaa.css", "page.aaaa.js"]);
    await retainAssets({ ...t, now: 1 * DAY });

    await build(t.assetsDir, ["Base.bbbb.css", "page.bbbb.js"]);
    const result = await retainAssets({ ...t, now: 2 * DAY });

    assert.deepEqual(await list(t.assetsDir), ["Base.aaaa.css", "Base.bbbb.css", "page.aaaa.js", "page.bbbb.js"]);
    assert.equal(result.restored, 2);
  } finally {
    await t.cleanup();
  }
});

test("assets retired for longer than the retention window are pruned", async () => {
  const t = await setup();
  try {
    await build(t.assetsDir, ["old.aaaa.css"]);
    await retainAssets({ ...t, now: 0 });
    await build(t.assetsDir, ["new.bbbb.css"]);
    await retainAssets({ ...t, now: 1 * DAY }); // old.aaaa last seen at day 0

    await build(t.assetsDir, ["new.bbbb.css"]);
    const result = await retainAssets({ ...t, now: RETENTION_MS + 1 });

    assert.deepEqual(await list(t.assetsDir), ["new.bbbb.css"]);
    assert.deepEqual(await list(t.archiveDir), ["new.bbbb.css"]);
    assert.equal(result.pruned, 1);
  } finally {
    await t.cleanup();
  }
});

// Retention is measured from when a file was last in a build, not first: a
// file that ships unchanged for months must not be pruned the day it retires.
test("retention counts from the last build a file was in", async () => {
  const t = await setup();
  try {
    await build(t.assetsDir, ["stable.cccc.js"]);
    await retainAssets({ ...t, now: 0 });
    await retainAssets({ ...t, now: 100 * DAY }); // still in the build at day 100

    await build(t.assetsDir, ["next.dddd.js"]);
    await retainAssets({ ...t, now: 101 * DAY });

    assert.ok((await list(t.assetsDir)).includes("stable.cccc.js"));
  } finally {
    await t.cleanup();
  }
});

// The first deploy that carries this code: the live build's files are only on
// disk in dist/, which `astro build` is about to empty.
test("a snapshot before the build preserves the build being replaced", async () => {
  const t = await setup();
  try {
    await build(t.assetsDir, ["live.eeee.css", "fonts/face.eeee.woff2"]);
    await snapshotAssets({ ...t, now: 0 });

    await build(t.assetsDir, ["live.ffff.css"]);
    await retainAssets({ ...t, now: 1 * DAY });

    assert.deepEqual(await list(t.assetsDir), ["fonts/face.eeee.woff2", "live.eeee.css", "live.ffff.css"]);
  } finally {
    await t.cleanup();
  }
});

// The build passes directories from fileURLToPath(new URL("_astro/", ...)),
// which end in a separator; a slice-based relative path cut the first letter
// off every file name.
test("directories given with a trailing separator keep file names whole", async () => {
  const t = await setup();
  try {
    await build(t.assetsDir, ["Banner.aaaa.js"]);
    await snapshotAssets({ assetsDir: t.assetsDir + "/", archiveDir: t.archiveDir + "/", now: 0 });
    await build(t.assetsDir, ["Banner.bbbb.js"]);
    await retainAssets({ assetsDir: t.assetsDir + "/", archiveDir: t.archiveDir + "/", now: 1 });
    assert.deepEqual(await list(t.assetsDir), ["Banner.aaaa.js", "Banner.bbbb.js"]);
  } finally {
    await t.cleanup();
  }
});

// The real build runs snapshotAssets before every retainAssets, while dist/
// still holds the restored files of earlier builds. The snapshot must not
// re-stamp those, or nothing restored would ever age out.
test("restored files still age out when every build snapshots first", async () => {
  const t = await setup();
  try {
    await build(t.assetsDir, ["old.aaaa.css"]);
    await snapshotAssets({ ...t, now: 0 });
    await retainAssets({ ...t, now: 0 });

    // Daily deploys of a build without old.aaaa.css, which keeps being restored.
    for (let day = 1; day <= 61; day++) {
      await snapshotAssets({ ...t, now: day * DAY }); // dist/ holds old.aaaa.css here
      await build(t.assetsDir, [`new.${day}.css`]);
      await retainAssets({ ...t, now: day * DAY });
    }

    assert.ok(!(await list(t.archiveDir)).includes("old.aaaa.css"), "old.aaaa.css was never pruned");
    assert.ok(!(await list(t.assetsDir)).includes("old.aaaa.css"));
  } finally {
    await t.cleanup();
  }
});

test("a missing dist or archive is not an error", async () => {
  const t = await setup();
  try {
    assert.deepEqual(await snapshotAssets({ ...t }), { archived: 0 });
    await build(t.assetsDir, ["a.css"]);
    const result = await retainAssets({ ...t });
    assert.equal(result.current, 1);
  } finally {
    await t.cleanup();
  }
});
