import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const file of ["SKILL.md", "references/tier-profile.md"]) {
  test(`${file} documents project default load, setup persistence, and session-only overrides`, () => {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(text, /conversation start/i);
    assert.match(text, /\.t3-orca\/tiers\.yaml/);
    assert.match(text, /setup/i);
    assert.match(text, /sub-conversations|child tasks/i);
    assert.match(text, /other sessions in the same project/i);
    assert.match(text, /never modify `\.t3-orca\/tiers\.yaml`|never write or modify `\.t3-orca\/tiers\.yaml`/i);
  });
}

for (const file of ["references/tiered-delivery.md", "references/review-loop.md"]) {
  test(`${file} keeps conversational overrides scoped to current conversation without modifying tiers.yaml`, () => {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(text, /conversation start/i);
    assert.match(text, /without modifying `\.t3-orca\/tiers\.yaml`/i);
  });
}
