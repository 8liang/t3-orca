import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(here, "..", "scripts", "save-tier-profile.mjs");

function makeTempDir(prefix = "t3-orca-save-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("writes and overwrites the project tiers.yaml and adds .t3-orca/ to .gitignore", () => {
  const project = makeTempDir();
  try {
    writeFileSync(join(project, "README.md"), "x");
    const first = spawnSync(process.execPath, [scriptPath, "--project", project], {
      input: "tiers:\n  ui: sol6.1 @ high\n",
      encoding: "utf8",
    });
    assert.equal(first.status, 0, first.stderr);
    const target = join(project, ".t3-orca", "tiers.yaml");
    assert.equal(readFileSync(target, "utf8"), "tiers:\n  ui: sol6.1 @ high\n");
    const gitignore = join(project, ".gitignore");
    assert.equal(readFileSync(gitignore, "utf8"), ".t3-orca/\n");

    const second = spawnSync(process.execPath, [scriptPath, `--project=${project}`], {
      input: "tiers:\n  code: deepseek-flash-claude @ high\n",
      encoding: "utf8",
    });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readFileSync(target, "utf8"), "tiers:\n  code: deepseek-flash-claude @ high\n");
    assert.equal(readFileSync(gitignore, "utf8"), ".t3-orca/\n");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("appends .t3-orca/ to existing .gitignore without trailing newline and skips duplicates", () => {
  const project = makeTempDir();
  try {
    const gitignore = join(project, ".gitignore");
    writeFileSync(gitignore, "node_modules/");
    const res = spawnSync(process.execPath, [scriptPath, "--project", project], {
      input: "tiers:\n  ui: sol6.1 @ high\n",
      encoding: "utf8",
    });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(readFileSync(gitignore, "utf8"), "node_modules/\n.t3-orca/\n");

    writeFileSync(gitignore, "node_modules/\n/.t3-orca/\n");
    const second = spawnSync(process.execPath, [scriptPath, "--project", project], {
      input: "tiers:\n  ui: sol6.1 @ low\n",
      encoding: "utf8",
    });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readFileSync(gitignore, "utf8"), "node_modules/\n/.t3-orca/\n");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("respects ancestor git repo .gitignore unanchored vs anchored rules", () => {
  const repo = makeTempDir("t3-orca-git-");
  try {
    execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
    const sub = join(repo, "packages", "app");
    mkdirSync(sub, { recursive: true });

    writeFileSync(join(repo, ".gitignore"), "node_modules/\n.t3-orca/\n");
    const covered = spawnSync(process.execPath, [scriptPath, "--project", sub], {
      input: "tiers:\n  ui: sol6.1 @ high\n",
      encoding: "utf8",
    });
    assert.equal(covered.status, 0, covered.stderr);
    assert.equal(existsSync(join(sub, ".gitignore")), false);

    writeFileSync(join(repo, ".gitignore"), "/.t3-orca/\n");
    const anchored = spawnSync(process.execPath, [scriptPath, "--project", sub], {
      input: "tiers:\n  ui: sol6.1 @ low\n",
      encoding: "utf8",
    });
    assert.equal(anchored.status, 0, anchored.stderr);
    assert.equal(readFileSync(join(sub, ".gitignore"), "utf8"), ".t3-orca/\n");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("rejects empty input and input without a tiers block without modifying .gitignore", () => {
  const project = makeTempDir();
  try {
    const empty = spawnSync(process.execPath, [scriptPath, "--project", project], {
      input: "   \n",
      encoding: "utf8",
    });
    assert.equal(empty.status, 1);
    assert.match(empty.stderr, /empty/);
    assert.equal(existsSync(join(project, ".t3-orca", "tiers.yaml")), false);
    assert.equal(existsSync(join(project, ".gitignore")), false);

    const bad = spawnSync(process.execPath, [scriptPath, "--project", project], {
      input: "not-a-profile: true\n",
      encoding: "utf8",
    });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /top-level "tiers:"/);
    assert.equal(existsSync(join(project, ".t3-orca", "tiers.yaml")), false);
    assert.equal(existsSync(join(project, ".gitignore")), false);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("refuses a .t3-orca directory or .gitignore symlink that resolves outside the project", () => {
  const project = makeTempDir();
  const outside = makeTempDir("t3-orca-outside-");
  try {
    symlinkSync(outside, join(project, ".t3-orca"));
    const result = spawnSync(process.execPath, [scriptPath, "--project", project], {
      input: "tiers: {}\n",
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /outside the project/);
    assert.equal(existsSync(join(outside, "tiers.yaml")), false);

    const project2 = makeTempDir();
    try {
      const outsideGitignore = join(outside, ".gitignore");
      writeFileSync(outsideGitignore, "secret\n");
      symlinkSync(outsideGitignore, join(project2, ".gitignore"));
      const res2 = spawnSync(process.execPath, [scriptPath, "--project", project2], {
        input: "tiers: {}\n",
        encoding: "utf8",
      });
      assert.equal(res2.status, 1);
      assert.match(res2.stderr, /outside the project/);
      assert.equal(readFileSync(outsideGitignore, "utf8"), "secret\n");
      assert.equal(existsSync(join(project2, ".t3-orca", "tiers.yaml")), false);
    } finally {
      rmSync(project2, { recursive: true, force: true });
    }
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("requires a value for --project and rejects unknown options", () => {
  const noValue = spawnSync(process.execPath, [scriptPath, "--project"], { encoding: "utf8" });
  assert.equal(noValue.status, 2);
  assert.match(noValue.stderr, /--project requires a directory/);

  const unknown = spawnSync(process.execPath, [scriptPath, "--nope"], { encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown argument/);

  const missing = spawnSync(process.execPath, [scriptPath, "--project", "/nonexistent/t3-orca-project"], {
    input: "tiers: {}\n",
    encoding: "utf8",
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Project directory does not exist/);
});
