#!/usr/bin/env node
// Build a Tier Profile window with live T3 Code capabilities injected.
// Usage:
//   node <skill-dir>/scripts/build-tier-profile.mjs <capabilities.json|-> [out.html]
// The capabilities file is the exact result of `orchestrator_capabilities`.
// The built page reads window.__T3_ORCA_CAPABILITIES__ on load. With no
// capabilities available, open assets/tier-profile.html directly and use the
// manual Capabilities panel.

import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TEMPLATE_PATH = resolve(here, "..", "assets", "tier-profile.html");

const USAGE =
  "Usage: node <skill-dir>/scripts/build-tier-profile.mjs <capabilities.json|-> [out.html]";

export function validateCapabilitiesEnvelope(raw) {
  let payload = raw;
  if (payload && Array.isArray(payload.content)) {
    const text = payload.content.find((item) => item && typeof item.text === "string")?.text;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        throw new Error(`Invalid JSON inside capabilities content[].text: ${error.message}`);
      }
    }
  }
  if (payload && payload.result && !payload.providers) {
    payload = payload.result;
  }
  if (payload && payload.structuredContent && payload.structuredContent.providers) {
    payload = payload.structuredContent;
  }
  if (!payload || !Array.isArray(payload.providers)) {
    throw new Error(
      'Invalid capabilities payload: expected a "providers" array (directly or inside result, structuredContent, or content[].text).'
    );
  }
  return payload;
}

export function serializeCapabilitiesForScript(capabilities) {
  return JSON.stringify(capabilities)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .split(String.fromCharCode(0x2028)).join("\\u2028")
    .split(String.fromCharCode(0x2029)).join("\\u2029");
}

export function buildTierProfileHtml(capabilities, templateHtml) {
  validateCapabilitiesEnvelope(capabilities);

  const mainScript = /<script>\s*\(\(\)\s*=>\s*\{/.exec(templateHtml);
  if (!mainScript) {
    throw new Error("Could not find the main script in assets/tier-profile.html.");
  }

  const payload = serializeCapabilitiesForScript(capabilities);
  const bootstrap = `<script>window.__T3_ORCA_CAPABILITIES__ = ${payload};</script>\n`;
  return templateHtml.slice(0, mainScript.index) + bootstrap + templateHtml.slice(mainScript.index);
}

export function createSafeTempOutputPath() {
  const dir = mkdtempSync(join(tmpdir(), "t3-orca-"));
  return join(dir, "tier-profile.html");
}

export function buildTierProfile({ input, output, templatePath = DEFAULT_TEMPLATE_PATH, stdinText } = {}) {
  let raw;
  if (input === "-") {
    raw = typeof stdinText === "string" ? stdinText : readFileSync(0, "utf8");
  } else {
    try {
      raw = readFileSync(input, "utf8");
    } catch (error) {
      throw new Error(`Failed to read capabilities file "${input}": ${error.message}`);
    }
  }

  if (!raw.trim()) {
    throw new Error("Capabilities input is empty.");
  }

  let capabilities;
  try {
    capabilities = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid capabilities JSON: ${error.message}`);
  }

  let templateHtml;
  try {
    templateHtml = readFileSync(templatePath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read template "${templatePath}": ${error.message}`);
  }

  const built = buildTierProfileHtml(capabilities, templateHtml);
  const out = output ? resolve(output) : createSafeTempOutputPath();

  try {
    writeFileSync(out, built);
  } catch (error) {
    throw new Error(`Failed to write output HTML "${out}": ${error.message}`);
  }

  return out;
}

export function runCli(argv = process.argv.slice(2)) {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(USAGE);
    return 0;
  }

  if (argv.length === 0) {
    console.error(USAGE);
    return 2;
  }

  if (argv.length > 2) {
    console.error(`Unexpected extra arguments: ${argv.slice(2).join(" ")}`);
    console.error(USAGE);
    return 2;
  }

  const [input, output] = argv;
  try {
    const out = buildTierProfile({ input, output });
    console.log(out);
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  process.exitCode = runCli();
}
