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
