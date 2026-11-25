import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const file of ["SKILL.md", "references/tier-profile.md"]) {
  test(`${file} sets the remote viewport for phone setup`, () => {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(text, /preview_resize/);
    assert.match(text, /"mode": "freeform", "width": 390, "height": 844/);
    assert.match(text, /viewport/);
  });
}

for (const file of ["SKILL.md", "references/tier-profile.md"]) {
  test(`${file} tries an inline form before chat-only phone setup`, () => {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(text, /Phone interaction failure:[\s\S]*?html_preview[\s\S]*?html_render/);
    assert.match(text, /original builder output/);
    assert.match(text, /Do not immediately replace the requested configurator with chat-only YAML/);
    assert.doesNotMatch(text, /use the \[chat fallback\]\([^)]*\) immediately/);
  });
}
