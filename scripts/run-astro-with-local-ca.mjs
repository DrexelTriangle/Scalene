import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const command = process.argv[2];
const extraArgs = process.argv.slice(3);
const validCommands = new Set(["dev", "build", "preview"]);

if (!validCommands.has(command)) {
  console.error(`Invalid astro command: ${command ?? "<missing>"}`);
  console.error("Usage: node scripts/run-astro-with-local-ca.mjs <dev|build|preview>");
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
// Astro 7 moved the CLI entrypoint to bin/astro.mjs; astro.js is where it
// lived up to Astro 6. Check both so this keeps working either way.
const astroCliCandidates = [
  path.resolve(projectRoot, "node_modules/astro/bin/astro.mjs"),
  path.resolve(projectRoot, "node_modules/astro/astro.js"),
];

const astroCli = astroCliCandidates.find((candidate) => existsSync(candidate));

if (!astroCli) {
  console.error("Astro CLI not found. Run `npm install` first.");
  process.exit(1);
}

const explicitCert =
  process.env.LOCALHOST_CERT_PATH?.trim() || process.env.NODE_EXTRA_CA_CERTS?.trim();
const certCandidates = [
  explicitCert,
  path.resolve(projectRoot, "../triangle-cms/server/certs/localhost.crt"),
  path.resolve(projectRoot, "triangle-cms/server/certs/localhost.crt"),
].filter(Boolean);

const certPath = certCandidates.find((candidate) => existsSync(candidate));
const env = { ...process.env };

if (certPath) {
  env.NODE_EXTRA_CA_CERTS = certPath;
  console.log(`[local-ca] Using certificate: ${certPath}`);
} else {
  console.warn("[local-ca] No localhost certificate found.");
  console.warn(
    "[local-ca] Set LOCALHOST_CERT_PATH to your localhost.crt path if TLS requests fail."
  );
}

// ASTRO_KEY encrypts the props a page passes to its server islands, and Astro
// reads it from the process environment at build time only -- never from .env,
// which Vite loads into import.meta.env and not into process.env. Without it
// each build makes a random key, so after a deploy every article Cloudflare
// still holds from the previous build (up to 30 days of them) asks for its
// comments, poll, ad and related row with props the new server cannot decrypt,
// and those parts of the page come back empty. The hosts' build runs through
// here with no ASTRO_KEY exported, so pick it up from .env.
if (command === "build" && !env.ASTRO_KEY) {
  const envFile = path.resolve(projectRoot, ".env");
  const line = existsSync(envFile)
    ? readFileSync(envFile, "utf8")
        .split(/\r?\n/)
        .find((l) => /^\s*ASTRO_KEY\s*=/.test(l))
    : undefined;
  // The value only: up to whitespace or an inline "# comment", quotes removed.
  // A generated key is base64 and holds neither; a corrupted key here would
  // pass silently and break every cached page's islands after the next deploy.
  const key = line
    ?.replace(/^\s*ASTRO_KEY\s*=\s*/, "")
    .replace(/^(["'])(.*)\1.*$/, "$2")
    .split(/[\s#]/)[0];
  if (key) {
    env.ASTRO_KEY = key;
    console.log("[astro-key] Using ASTRO_KEY from .env");
  } else {
    console.warn(
      "[astro-key] No ASTRO_KEY: server-island props get a one-off key, so pages cached " +
        "from this build lose their islands after the next deploy. Set ASTRO_KEY in .env " +
        "(npx astro create-key) on any host that serves production traffic."
    );
  }
}

const child = spawn(process.execPath, [astroCli, command, ...extraArgs], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Failed to start astro ${command}:`, error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
