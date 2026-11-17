import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import {
  DEFAULT_TEMPLATE_PATH,
  buildTierProfileHtml,
  serializeCapabilitiesForScript,
  validateCapabilitiesEnvelope,
} from "../scripts/build-tier-profile.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const scriptPath = resolve(repoRoot, "scripts", "build-tier-profile.mjs");

function makeTempDir(prefix = "t3-orca-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function extractInjectedCapabilities(html) {
  const match = /<script>window\.__T3_ORCA_CAPABILITIES__ = ([\s\S]*?);<\/script>/.exec(html);
  assert.ok(match, "Expected injected __T3_ORCA_CAPABILITIES__ script tag");
  const sandbox = { window: {} };
  vm.runInNewContext(`window.__T3_ORCA_CAPABILITIES__ = ${match[1]};`, sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.__T3_ORCA_CAPABILITIES__));
}

test("cross-cwd invocation with default safe temp output leaves target cwd untouched", () => {
  const targetCwd = makeTempDir("t3-orca-cwd-");
  const capsDir = makeTempDir("t3-orca-caps-");
  const capsFile = join(capsDir, "caps.json");
  let builtPath = "";

  try {
    writeFileSync(
      capsFile,
      JSON.stringify({
        providers: [{ providerInstanceId: "codex", models: [{ id: "gpt-6.1-sol" }] }],
      })
    );

    const stdout = execFileSync(process.execPath, [scriptPath, capsFile], {
      cwd: targetCwd,
      encoding: "utf8",
    });

    builtPath = stdout.trim();
    assert.ok(builtPath.startsWith(tmpdir()), `Expected temp output under ${tmpdir()}, got ${builtPath}`);
    assert.ok(existsSync(builtPath), "Expected built HTML file to exist");
    assert.deepEqual(readdirSync(targetCwd), [], "Target cwd must remain untouched");

    const html = readFileSync(builtPath, "utf8");
    const injected = extractInjectedCapabilities(html);
    assert.equal(injected.providers[0].providerInstanceId, "codex");
  } finally {
    rmSync(targetCwd, { recursive: true, force: true });
    rmSync(capsDir, { recursive: true, force: true });
    if (builtPath) {
      rmSync(dirname(builtPath), { recursive: true, force: true });
    }
  }
});

test("supports explicit output path relative to caller cwd and stdin input", () => {
  const callerCwd = makeTempDir("t3-orca-out-");
  mkdirSync(join(callerCwd, "nested"));
  const payload = {
    providers: [{ providerInstanceId: "magpie", models: [{ id: "gcp-ai/gemini-4-hydrogen[1m]" }] }],
  };

  try {
    const res = spawnSync(process.execPath, [scriptPath, "-", "nested/out.html"], {
      cwd: callerCwd,
      input: JSON.stringify(payload),
      encoding: "utf8",
    });

    assert.equal(res.status, 0, res.stderr);
    const outPath = res.stdout.trim();
    assert.equal(realpathSync(outPath), realpathSync(resolve(callerCwd, "nested", "out.html")));
    const injected = extractInjectedCapabilities(readFileSync(outPath, "utf8"));
    assert.equal(injected.providers[0].models[0].id, "gcp-ai/gemini-4-hydrogen[1m]");
  } finally {
    rmSync(callerCwd, { recursive: true, force: true });
  }
});

test("supports all orchestrator_capabilities envelopes", () => {
  const templateHtml = readFileSync(DEFAULT_TEMPLATE_PATH, "utf8");
  const core = { providers: [{ providerInstanceId: "codex", models: [{ id: "gpt-6.1-sol" }] }] };
  const envelopes = [
    core,
    { result: core },
    { structuredContent: core },
    { result: { structuredContent: core } },
    { content: [{ type: "text", text: JSON.stringify(core) }] },
    { content: [{ type: "text", text: JSON.stringify({ result: core }) }] },
  ];

  for (const envelope of envelopes) {
    const unwrapped = validateCapabilitiesEnvelope(envelope);
    assert.equal(unwrapped.providers[0].providerInstanceId, "codex");

    const html = buildTierProfileHtml(envelope, templateHtml);
    const injected = extractInjectedCapabilities(html);
    assert.deepEqual(injected, envelope);
  }
});

test("escapes HTML/script breakout sequences, line terminators, and $ replacement patterns", () => {
  const templateHtml = readFileSync(DEFAULT_TEMPLATE_PATH, "utf8");
  const tricky = {
    providers: [
      {
        providerInstanceId: "test",
        displayName: "</script><script>alert(1)</script> & <!-- $& $$ $'",
        models: [
          {
            id: "line break model",
            label: "Model $`",
          },
        ],
      },
    ],
  };

  const serialized = serializeCapabilitiesForScript(tricky);
  assert.ok(!serialized.includes("</script>"));
  assert.ok(!serialized.includes(" "));
  assert.ok(!serialized.includes(" "));

  const html = buildTierProfileHtml(tricky, templateHtml);
  const bootstrapEnd = html.indexOf("</script>\n<script>");
  assert.ok(bootstrapEnd > 0, "Expected bootstrap script before main script");

  const injected = extractInjectedCapabilities(html);
  assert.deepEqual(injected, tricky);
});

test("CLI usage and failure modes return helpful messages without stack traces", () => {
  const missingArgs = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
  assert.equal(missingArgs.status, 2);
  assert.match(missingArgs.stderr, /Usage:/);

  const helpFlag = spawnSync(process.execPath, [scriptPath, "--help"], { encoding: "utf8" });
  assert.equal(helpFlag.status, 0);
  assert.match(helpFlag.stdout, /Usage:/);

  const extraArgs = spawnSync(process.execPath, [scriptPath, "a.json", "b.html", "c"], { encoding: "utf8" });
  assert.equal(extraArgs.status, 2);
  assert.match(extraArgs.stderr, /Unexpected extra arguments/);

  const missingFile = spawnSync(process.execPath, [scriptPath, "/nonexistent/t3-orca-missing.json"], {
    encoding: "utf8",
  });
  assert.equal(missingFile.status, 1);
  assert.match(missingFile.stderr, /Failed to read capabilities file/);
  assert.doesNotMatch(missingFile.stderr, /at Object\./);

  const workDir = makeTempDir("t3-orca-err-");
  try {
    const badJsonFile = join(workDir, "bad.json");
    writeFileSync(badJsonFile, "{not-json");
    const badJson = spawnSync(process.execPath, [scriptPath, badJsonFile], { encoding: "utf8" });
    assert.equal(badJson.status, 1);
    assert.match(badJson.stderr, /Invalid capabilities JSON/);

    const badEnvelopeFile = join(workDir, "no-providers.json");
    writeFileSync(badEnvelopeFile, JSON.stringify({ ok: true }));
    const badEnvelope = spawnSync(process.execPath, [scriptPath, badEnvelopeFile], { encoding: "utf8" });
    assert.equal(badEnvelope.status, 1);
    assert.match(badEnvelope.stderr, /expected a "providers" array/);

    const validFile = join(workDir, "valid.json");
    writeFileSync(validFile, JSON.stringify({ providers: [] }));
    const badOut = spawnSync(process.execPath, [scriptPath, validFile, join(workDir, "no-such-dir", "out.html")], {
      encoding: "utf8",
    });
    assert.equal(badOut.status, 1);
    assert.match(badOut.stderr, /Failed to write output HTML/);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
