import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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
const astroCli = path.resolve(projectRoot, "node_modules/astro/astro.js");

if (!existsSync(astroCli)) {
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
