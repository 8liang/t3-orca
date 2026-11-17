#!/usr/bin/env node
// Build a Tier Profile window with live T3 Code capabilities injected.
// Usage:
//   node scripts/build-tier-profile.mjs <capabilities.json|-> [out.html]
// The capabilities file is the exact result of `orchestrator_capabilities`.
// The built page reads window.__T3_ORCA_CAPABILITIES__ on load. With no
// capabilities available, open assets/tier-profile.html directly and use the
// manual Capabilities panel.

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = resolve(here, "..", "assets", "tier-profile.html");
const [input, output] = process.argv.slice(2);

if (!input || input === "-h" || input === "--help") {
  console.error("Usage: node scripts/build-tier-profile.mjs <capabilities.json|-> [out.html]");
  process.exit(input ? 0 : 2);
}

const raw = input === "-" ? readFileSync(0, "utf8") : readFileSync(input, "utf8");

let capabilities;
try {
  capabilities = JSON.parse(raw);
} catch (error) {
  console.error(`Invalid capabilities JSON: ${error.message}`);
  process.exit(1);
}

const payload = JSON.stringify(capabilities)
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026")
  .split(String.fromCharCode(0x2028)).join("\\u2028")
  .split(String.fromCharCode(0x2029)).join("\\u2029");

const html = readFileSync(templatePath, "utf8");
const mainScript = /<script>\s*\(\(\)\s*=>\s*\{/.exec(html);
if (!mainScript) {
  console.error("Could not find the main script in assets/tier-profile.html.");
  process.exit(1);
}

const bootstrap = `<script>window.__T3_ORCA_CAPABILITIES__ = ${payload};</script>\n`;
const built = html.slice(0, mainScript.index) + bootstrap + html.slice(mainScript.index);
const out = output ? resolve(output) : join(tmpdir(), "t3-orca-tier-profile.html");

writeFileSync(out, built);
console.log(out);