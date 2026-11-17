import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function page({ profile } = {}) {
  const html = readFileSync(new URL("../assets/tier-profile.html", import.meta.url), "utf8");
  const script = html.match(/<script>\s*\(\(\) => \{([\s\S]*)\}\)\(\);\s*<\/script>/)[1];
  const prefix = script.slice(0, script.indexOf('  document.getElementById("tierList").addEventListener'));
  const context = vm.createContext({
    window: profile ? { __T3_ORCA_PROFILE__: profile } : {},
    localStorage: { getItem() {}, setItem() {}, removeItem() {} },
    document: { querySelector: () => ({}), getElementById: () => null },
    console,
  });
  vm.runInContext(`(() => {${prefix}
    renderCards = renderYaml = renderIssues = renderCapsBadge = renderProfileBadge = renderPresets = () => {};
    globalThis.page = { state, parseProfileYaml, applyProfileText, tierToYaml, resolveBase };
  })()`, context);
  return context.page;
}

test("loads an injected profile during page initialization", () => {
  const { state } = page({
    profile: {
      path: "/repo/.t3-orca/tiers.yaml",
      text: "tiers:\n  code: sol6.1 @ low\n",
    },
  });

  assert.equal(state.profileLoaded, true);
  assert.equal(state.profilePath, "/repo/.t3-orca/tiers.yaml");
  assert.equal(state.tiers.code.provider, "codex");
  assert.equal(state.tiers.code.model, "gpt-6.1-sol");
  assert.equal(state.tiers.code.options.reasoningEffort, "low");
});

test("loads a full project profile into tier state", () => {
  const { state, applyProfileText } = page();
  applyProfileText(`
tiers:
  ui: sol6.1 @ high
  code:
    provider: magpie
    model: dumate/deepseek-v41-flash[1m]
    role: implementation
    options:
      effort: high
  fast: code @ low
  review: parent
`, { path: "/repo/.t3-orca/tiers.yaml" });

  assert.equal(state.profileLoaded, true);
  assert.equal(state.profilePath, "/repo/.t3-orca/tiers.yaml");
  assert.equal(state.tiers.ui.provider, "codex");
  assert.equal(state.tiers.ui.model, "gpt-6.1-sol");
  assert.equal(state.tiers.ui.options.reasoningEffort, "high");
  assert.equal(state.tiers.code.provider, "magpie");
  assert.equal(state.tiers.code.model, "dumate/deepseek-v41-flash[1m]");
  assert.equal(state.tiers.code.options.effort, "high");
  assert.equal(state.tiers.fast.mode, "same");
  assert.equal(state.tiers.fast.ref, "code");
  assert.equal(state.tiers.fast.options.effort, "low");
  assert.equal(state.tiers.review.mode, "parent");
});

test("a diff-only project profile overlays the defaults", () => {
  const { state, applyProfileText } = page();
  applyProfileText(`
# 仅列出与默认 profile 不同的 tier
tiers:
  code: sol6.1 @ low
`);

  assert.equal(state.diffOnly, true);
  assert.equal(state.tiers.ui.provider, "codex");
  assert.equal(state.tiers.code.provider, "codex");
  assert.equal(state.tiers.code.model, "gpt-6.1-sol");
  assert.equal(state.tiers.code.options.reasoningEffort, "low");
  assert.equal(state.tiers.fast.mode, "same");
  assert.equal(state.tiers.fast.ref, "code");
  assert.equal(state.tiers.review.mode, "parent");
});

test("supports custom tiers and forward same-tier references", () => {
  const { state, applyProfileText } = page();
  applyProfileText(`
tiers:
  fast: frontend @ low
  frontend:
    provider: cursor
    model: claude-opus-5-5
    role: design
    options:
      effort: max
`);

  assert.ok(state.order.includes("frontend"));
  assert.equal(state.tiers.frontend.mode, "target");
  assert.equal(state.tiers.frontend.provider, "cursor");
  assert.equal(state.tiers.frontend.model, "claude-opus-5-5");
  assert.equal(state.tiers.frontend.options.effort, "max");
  assert.equal(state.tiers.fast.mode, "same");
  assert.equal(state.tiers.fast.ref, "frontend");
  assert.equal(state.tiers.fast.options.effort, "low");
});

test("keeps quoted model ids and replaces a previous draft", () => {
  const { state, applyProfileText } = page();
  state.tiers.ui.provider = "cursor";
  applyProfileText(`
tiers:
  code:
    provider: magpie
    model: "dumate/deepseek-v41-flash[1m]"
    options:
      effort: high
`);

  assert.equal(state.tiers.ui.provider, "codex");
  assert.equal(state.tiers.code.model, "dumate/deepseek-v41-flash[1m]");
  assert.equal(state.tiers.code.options.effort, "high");
});

test("handles an empty tiers map as an empty overlay", () => {
  const { state, applyProfileText } = page();
  applyProfileText("tiers: {}\n");
  assert.equal(state.profileLoaded, true);
  assert.equal(state.tiers.ui.provider, "codex");
  assert.equal(state.tiers.code.provider, "magpie");
});
