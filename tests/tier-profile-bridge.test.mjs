import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_TEMPLATE_PATH, buildTierProfileHtml } from "../scripts/build-tier-profile.mjs";
import { startTierProfileBridge } from "../scripts/tier-profile-bridge.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function makeTempDir(prefix = "t3-orca-bridge-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function makePage(dir) {
  const html = buildTierProfileHtml(
    { providers: [{ providerInstanceId: "codex", models: [{ id: "gpt-6.1-sol" }] }] },
    readFileSync(DEFAULT_TEMPLATE_PATH, "utf8")
  );
  const page = join(dir, "tier-profile.html");
  writeFileSync(page, html);
  return page;
}

async function start(dir, extra = {}) {
  const project = join(dir, "project");
  mkdirSync(project, { recursive: true });
  const page = makePage(dir);
  const bridge = await startTierProfileBridge({
    project,
    page,
    idleMinutes: 0,
    ...extra,
  });
  return { bridge, project };
}

test("starts on loopback, injects the bridge config, and writes the project profile", async () => {
  const dir = makeTempDir();
  const readyFile = join(dir, "ready.json");
  let started;
  try {
    started = await start(dir, { readyFile });
    const { bridge, project } = started;
    assert.match(bridge.url, /^http:\/\/127\.0\.0\.1:\d+\/save$/);
    assert.equal(bridge.target, join(realpathSync(project), ".t3-orca", "tiers.yaml"));
    assert.ok(bridge.pagePath.endsWith("tier-profile.html"));
    assert.match(readFileSync(bridge.pagePath, "utf8"), /window\.__T3_ORCA_BRIDGE__/);
    assert.match(readFileSync(bridge.pagePath, "utf8"), new RegExp(bridge.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(bridge.pageUrl, /\/page\?token=/);
    assert.match(bridge.pageRoute, /^\/page\?token=/);

    const ready = JSON.parse(readFileSync(readyFile, "utf8"));
    assert.equal(ready.page, bridge.pagePath);
    assert.equal(ready.pageUrl, bridge.pageUrl);
    assert.equal(ready.pageRoute, bridge.pageRoute);
    assert.equal(ready.port, bridge.port);
    assert.equal(ready.target, bridge.target);
    assert.equal(ready.pid, process.pid);
    assert.equal(statSync(readyFile).mode & 0o077, 0);

    const served = await fetch(bridge.pageUrl);
    assert.equal(served.status, 200);
    assert.match(served.headers.get("content-type"), /text\/html/);
    const servedHtml = await served.text();
    assert.match(servedHtml, /window\.__T3_ORCA_BRIDGE__/);
    assert.match(servedHtml, /"url":"\/save"/);

    const health = await fetch(`${bridge.healthUrl}?token=${encodeURIComponent(bridge.token)}`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(await health.json(), { ok: true, target: bridge.target });

    const body = "tiers:\n  ui: sol6.1 @ high\n";
    const saved = await fetch(`${bridge.url}?token=${encodeURIComponent(bridge.token)}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body,
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get("access-control-allow-origin"), "*");
    const payload = await saved.json();
    assert.deepEqual(payload, { ok: true, path: bridge.target });
    assert.equal(readFileSync(bridge.target, "utf8"), body);
  } finally {
    started?.bridge.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects a missing or wrong token and invalid YAML without touching the file", async () => {
  const dir = makeTempDir();
  let started;
  try {
    started = await start(dir);
    const { bridge } = started;

    const noToken = await fetch(bridge.healthUrl);
    assert.equal(noToken.status, 403);

    const noPageToken = await fetch(bridge.healthUrl.replace("/health", "/page"));
    assert.equal(noPageToken.status, 403);

    const wrongToken = await fetch(`${bridge.url}?token=wrong`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "tiers: {}\n",
    });
    assert.equal(wrongToken.status, 403);

    const badYaml = await fetch(`${bridge.url}?token=${encodeURIComponent(bridge.token)}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not-a-profile: true\n",
    });
    assert.equal(badYaml.status, 400);
    assert.match((await badYaml.json()).error, /top-level "tiers:"/);

    assert.equal(existsSync(bridge.target), false);
  } finally {
    started?.bridge.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("accepts the token through the header and rejects oversized bodies", async () => {
  const dir = makeTempDir();
  let started;
  try {
    started = await start(dir);
    const { bridge } = started;

    const saved = await fetch(bridge.url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "X-T3-Orca-Token": bridge.token,
      },
      body: "tiers:\n  code: sol6.1 @ low\n",
    });
    assert.equal(saved.status, 200);

    const tooLarge = await fetch(`${bridge.url}?token=${encodeURIComponent(bridge.token)}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "tiers:\n  ui: " + "x".repeat(70 * 1024) + "\n",
    }).catch((error) => error);
    if (tooLarge instanceof Error) {
      assert.match(tooLarge.message, /fetch failed|socket|other side/i);
    } else {
      assert.equal(tooLarge.status, 413);
    }
  } finally {
    started?.bridge.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses a .t3-orca directory outside the project", () => {
  const dir = makeTempDir();
  const project = join(dir, "project");
  const outside = join(dir, "outside");
  mkdirSync(project);
  mkdirSync(outside);
  symlinkSync(outside, join(project, ".t3-orca"));
  try {
    assert.throws(
      () => startTierProfileBridge({ project, page: makePage(dir), idleMinutes: 0 }),
      /outside the project/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects an HTML file without the configurator script", async () => {
  const dir = makeTempDir();
  const project = join(dir, "project");
  mkdirSync(project);
  const page = join(dir, "bad.html");
  writeFileSync(page, "<html></html>");
  try {
    await assert.rejects(
      startTierProfileBridge({ project, page, idleMinutes: 0 }),
      /main script/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
