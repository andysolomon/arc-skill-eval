/**
 * Dev launcher: runs the arc-skill-eval daemon (the live runner behind
 * localhost mode) alongside the vite dev server. `npm run dev` uses this;
 * `npm run daemon` still starts the daemon alone.
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const children = [
  spawn("node", ["daemon/src/index.mjs"], { cwd: webDir, stdio: "inherit" }),
  spawn("npx", ["vite", "--host", "127.0.0.1"], { cwd: webDir, stdio: "inherit" }),
];

const shutdown = (code) => {
  for (const child of children) {
    child.kill("SIGTERM");
  }
  process.exit(code ?? 0);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const child of children) {
  child.on("exit", (code) => shutdown(code ?? 0));
}
