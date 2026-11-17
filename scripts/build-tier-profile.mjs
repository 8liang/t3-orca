#!/usr/bin/env node
// Build a Tier Profile window with live T3 Code capabilities and an optional
// existing project profile injected.
// Usage:
//   node <skill-dir>/scripts/build-tier-profile.mjs [--profile <tiers.yaml>] <capabilities.json|-> [out.html]
// The capabilities file is the exact result of `orchestrator_capabilities`.
// The built page reads window.__T3_ORCA_CAPABILITIES__ and
// window.__T3_ORCA_PROFILE__ on load. With no capabilities available, open
// assets/tier-profile.html directly and use the manual Capabilities panel.

import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TEMPLATE_PATH = resolve(here, "..", "assets", "tier-profile.html");

const USAGE =
  "Usage: node <skill-dir>/scripts/build-tier-profile.mjs [--profile <tiers.yaml>] <capabilities.json|-> [out.html]";

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
  return escapeForInlineScript(JSON.stringify(capabilities));
}

function escapeForInlineScript(json) {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .split(String.fromCharCode(0x2028)).join("\\u2028")
    .split(String.fromCharCode(0x2029)).join("\\u2029");
}

export function serializeProfileForScript(profile) {
  return serializeForInlineScript(profile);
}

export function serializeForInlineScript(value) {
  return escapeForInlineScript(JSON.stringify(value));
}

export function buildTierProfileHtml(capabilities, templateHtml, profile) {
  validateCapabilitiesEnvelope(capabilities);

  const mainScript = /<script>\s*\(\(\)\s*=>\s*\{/.exec(templateHtml);
  if (!mainScript) {
    throw new Error("Could not find the main script in assets/tier-profile.html.");
  }

  const payload = serializeCapabilitiesForScript(capabilities);
  let bootstrap = `<script>window.__T3_ORCA_CAPABILITIES__ = ${payload};</script>\n`;
  if (profile !== undefined) {
    bootstrap += `<script>window.__T3_ORCA_PROFILE__ = ${serializeProfileForScript(profile)};</script>\n`;
  }
  return templateHtml.slice(0, mainScript.index) + bootstrap + templateHtml.slice(mainScript.index);
}

export function injectBridgeConfig(html, bridge) {
  const mainScript = /<script>\s*\(\(\)\s*=>\s*\{/.exec(html);
  if (!mainScript) {
    throw new Error("Could not find the main script in the built HTML.");
  }
  const bootstrap = `<script>window.__T3_ORCA_BRIDGE__ = ${serializeForInlineScript(bridge)};</script>\n`;
  return html.slice(0, mainScript.index) + bootstrap + html.slice(mainScript.index);
}

export function createSafeTempOutputPath() {
  const dir = mkdtempSync(join(tmpdir(), "t3-orca-"));
  return join(dir, "tier-profile.html");
}

export function buildTierProfile({
  input,
  output,
  templatePath = DEFAULT_TEMPLATE_PATH,
  stdinText,
  profilePath,
} = {}) {
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

  let profile;
  if (profilePath !== undefined) {
    let text;
    try {
      text = readFileSync(profilePath, "utf8");
    } catch (error) {
      throw new Error(`Failed to read profile file "${profilePath}": ${error.message}`);
    }
    if (!text.trim()) {
      throw new Error(`Profile file "${profilePath}" is empty.`);
    }
    if (text.length > 64 * 1024) {
      throw new Error(`Profile file "${profilePath}" is too large.`);
    }
    let resolvedProfilePath;
    try {
      resolvedProfilePath = realpathSync(profilePath);
    } catch {
      resolvedProfilePath = resolve(profilePath);
    }
    profile = { path: resolvedProfilePath, text };
  }

  const built = buildTierProfileHtml(capabilities, templateHtml, profile);
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

  const positional = [];
  let profilePath;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--profile") {
      profilePath = argv[index + 1];
      if (!profilePath) {
        console.error("--profile requires a file path.");
        console.error(USAGE);
        return 2;
      }
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      profilePath = arg.slice("--profile=".length);
      if (!profilePath) {
        console.error("--profile requires a file path.");
        console.error(USAGE);
        return 2;
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      console.error(`Unknown option: ${arg}`);
      console.error(USAGE);
      return 2;
    } else {
      positional.push(arg);
    }
  }

  if (positional.length === 0) {
    console.error(USAGE);
    return 2;
  }

  if (positional.length > 2) {
    console.error(`Unexpected extra arguments: ${positional.slice(2).join(" ")}`);
    console.error(USAGE);
    return 2;
  }

  const [input, output] = positional;
  try {
    const out = buildTierProfile({ input, output, profilePath });
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
