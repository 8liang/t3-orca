# Review-loop preset

An independent, read-only reviewer checks the change. The parent fixes substantive findings and verifies them. Repeat until a round finds no substantive issues, with at most 5 review rounds.

Use this preset when the user says:

- `review 循环`, `review-loop`, `只读 Review 循环`;
- `直接 review` together with `发现问题你来修`, `修完再 review`, or `循环到无实质性问题`;
- a request shaped like: `派 <target> 子代理只读 Review，你负责修复问题并验证，再次 Review，循环直到无实质性问题。忽略误报和纯风格建议，最多 5 轮，未通过则汇报阻塞原因。`

Do not use it for:

- a one-shot review that only reports findings: use one review delegate and stop;
- `逐项开发` / `tiered-delivery`: the parent reviews and fixes go back to the original child;
- ordinary implementation that did not ask for a delegated review.

## Core loop

```text
parent: implement or inspect existing change
  -> verify once (tests / build / lint)
  -> round N: fresh read-only review delegate from the configured `review` tier
       (preset default sol6.1 @ low when the profile has no target)
  -> parent triages findings
       substantive    -> fix -> verify
       false positive -> dismiss with evidence
       style only     -> ignore
  -> round is clean -> done
  -> round 5 still has substantive findings -> blocked, report why
```

## Roles

| Actor | Does | Never does |
|---|---|---|
| Parent | Authors or fixes code, runs verification, triages findings, starts every review round, reports | Sends fixes to the reviewer; treats style or false positives as blocking |
| Reviewer | Reads the code and diff, reports substantive findings, verifies earlier fixes | Edits, stages, commits, pushes, runs stateful commands, starts subagents, rubber-stamps |

## Reviewer target

Use the same tier profile and resolution order as `tiered-delivery`. The `review` tier names the independent reviewer; do not keep a separate reviewer setting.

The review-loop default for the `review` tier is `sol6.1 @ low` (provider `codex`, model `gpt-6.1-sol`, `reasoningEffort: low`).

Resolve in this order:

1. an explicit target in the current message (`派 claude opus 只读 review`, `review 用 sol6.1 high`);
2. the `review` tier from the project profile: inline `tiers:`, then `<project>/.t3-orca/tiers.yaml`;
3. no project profile: open the Tier Profile window once, prefilled with the preset default `sol6.1 @ low`, and save the result to the project before starting.

To get the reviewer from the example request, configure it in the same way as the development flow:

```yaml
tiers:
  review: sol6.1 @ low
```

`review: parent` is a `tiered-delivery` value. Here it means the profile did not name a reviewer, so use the preset default. This preset always needs an independent reviewer.

There is no global profile. If the project has no profile and the current message has no explicit target, open the Tier Profile window once so the project gets one; do not run on an unsaved default. If the user explicitly says to use the preset default for this run, use `sol6.1 @ low` without saving. If the user asks to configure tiers, resolve and validate it exactly as the development flow does, including the live-capabilities injection in the Tier Profile window.

`ui`, `code`, and `fast` do not affect the reviewer. Use the effort configured on the `review` tier; do not override a concrete profile target with the preset default.

Validate the target against `orchestrator_capabilities` and use `role: "review"`. If it is unavailable, choose the closest eligible independent reviewer, preferring the same driver, and record `requested`, `resolved`, and `substituted: true`. Invoking this preset authorizes that reported fallback; it is never silent. Never fall back to parent-only review. If no eligible target exists, stop and report.

Low effort is the shipped default because it catches substantive problems cheaply, not because every review must be low effort. The configured `review` tier's effort wins; an explicit user override such as `use high` or `use max` also wins.

## Read-only contract

Every round brief must state:

- Do not edit, create, delete, stage, commit, or push files.
- Do not run tests or commands that change repository state. The parent supplies test evidence; naming a missing test is fine.
- Do not start subagents.
- Verify claims by reading the code. Do not report speculative findings. A clean diff is a valid PASS.
- Report only substantive issues. Style, naming, formatting, and optional refactors are non-blocking and may be omitted.
- The reviewer has no parent history. The repo path, base SHA, diff command, scope, and prior findings are all in the brief.

Use `role: "review"`, `isolation: "shared"`, and `mode: "wait"`. The review gates the parent's next action, so waiting is correct. If the wait times out, end the turn; the completion wake resumes the loop.

`isolation: "shared"` is mandatory because the reviewer must see the parent's uncommitted fixes. A `worktree` checkout is created from the parent HEAD and excludes uncommitted edits, which are exactly what is being reviewed. Use `worktree` only if the change is already committed and that commit is reachable there, and say so in the brief.

Read-only guard: capture `git status --short` before round 1 and after each round. If a review round leaves unexpected changes, stop and report. Do not reset the tree blindly.

## Workflow

### 1. Prepare the change

If the request is only a review, start from the existing diff. If it also asks for implementation, the parent implements it first, or delegates implementation when the user asked, then waits for it. Fixes in this preset stay with the parent.

Before round 1:

- identify repo path, branch, base SHA, changed files, and untracked files;
- record requirements and acceptance criteria;
- run the exact test, build, or lint commands once. If they fail, fix that before requesting review. If the repo has no test command, say so and define the manual verification;
- capture the test evidence for the first brief.

Inspect with `git diff <base> -- <paths>`. Untracked files do not appear in `git diff`; list them and tell the reviewer to read them directly.

### 2. Start a review round

Start a fresh `delegate_task` for every round. Never use `t3_thread_send` to an earlier reviewer: a re-check must be independent, and a new task can be cancelled.

On completion or wake, read `task_status` with the `taskId`. Note `executedModel`; if it differs from the requested reviewer, report it.

Record: `round | taskId | childThreadId | link | reviewer target | verdict`.

If the loop is stopped or superseded while a reviewer is running, `task_cancel` that `taskId`; never use `t3_thread_interrupt` on a child thread.

If the reviewer asks a question or requests approval, answer only when it is procedural and already covered by the brief; otherwise surface it to the user and pause the loop.

### 3. Triage the findings

Classify every finding:

| Class | Action |
|---|---|
| Substantive | Fix it in the parent. |
| False positive | Dismiss with code evidence; carry it into the next brief as an adjudicated non-issue. |
| Style only | Ignore it; record it for the final report; do not change code for it. |
| Product or requirements decision | Ask the user and pause the loop. Do not guess. |
| Unrelated or pre-existing problem outside the change | Exclude it from this loop and report it as a follow-up. |

Substantive means: correctness bug, unhandled edge case, requirement or behavior mismatch, missing or incorrect test for changed behavior, build or test failure, security or data-loss risk, API or contract break, unrelated scope, or secrets in the diff.

Evidence decides, not the verdict alone. A reviewer's PASS does not close the loop if the parent sees a substantive issue, such as a failing test or a secret in the diff. A parent's dismissal does not close the loop if the finding is actually substantive.

If every finding is false positive or style only, the round is clean. Do not start a fix round for it.

### 4. Fix and verify

- Fix all substantive findings from the round in one batch.
- Keep the diff minimal and limited to the reviewed scope; no unrelated cleanup.
- Add or update the test the finding requires.
- Run targeted tests, then the relevant full suite, build, or lint. Record exact commands and results.
- Do not send fixes to the reviewer, and do not ask the reviewer to edit.
- Do not commit during the loop.

### 5. Re-review

Start another fresh reviewer with:

- the same requirements and read-only contract;
- the same base SHA, the current diff command, and fresh test evidence;
- prior findings with a status for each:
  `FIXED <evidence>`, `OPEN <reason>`, or `DISMISSED <parent evidence>`.

Ask the reviewer to verify each FIXED claim in the code and to look for new substantive issues. A DISMISSED finding should be re-raised only with new evidence.

### 6. Close or block

The loop is done when the latest round has no substantive findings and verification passes. That can be round 1 through 5.

If round 5 ends with substantive findings:

- stop immediately; do not fix beyond round 5 without a new budget;
- mark the work blocked and do not commit;
- report every unresolved finding with file:line, severity, and evidence;
- list the rounds used and what each round fixed;
- explain why each finding is unresolved: conflicting requirements, missing reproduction, a product decision, or an unavailable or flaky test;
- give the recommended next options;
- state explicitly: `blocked, not committed`.

Continue only if the user explicitly authorizes more rounds. Do not silently raise the limit.

### 7. Commit

Commit only if the user explicitly asked for a commit, and only after a clean round with passing verification. Stage only the loop's files; never push or open a PR. Otherwise leave the changes in the working tree and say so in the final report.

## Review brief template

```text
Act as an independent, read-only reviewer. Do not edit, create, delete, stage,
commit, or push anything. Do not run tests or commands that change repository
state. Do not start subagents.

Goal
Determine whether the change satisfies the requirements with no substantive
regressions.

Repo
- Path: <absolute path>
- Branch / base: <branch> @ <sha>
- Changed files: <paths>
- Untracked files: <paths or none>
- Inspect with: `git diff <base> -- <paths>` and read the files directly.

Requirements
- <acceptance criteria and invariants>

Test evidence (from the parent; do not re-run)
- <command> -> <pass/fail and key output>

Scope
- In scope: <paths and behaviors>
- Out of scope: <unrelated changes and pre-existing issues>

Report only substantive findings:
- correctness bugs and unhandled edge cases
- requirement or behavior mismatch
- missing or incorrect test for changed behavior
- build or test failure implied by the evidence
- security, privacy, or data-loss risk
- API or contract break
- unrelated scope or secrets in the diff

Do not report style, naming, formatting, or optional refactors as findings.
Do not invent issues. A clean diff is a valid PASS.

Prior findings (round 2+)
1. <id> <file:line> - <finding>
   Status: FIXED <evidence> | OPEN <reason> | DISMISSED <parent evidence>
Verify each FIXED claim in the code. Re-raise a DISMISSED finding only with new
evidence.

Report format
Verdict: PASS | CHANGES_REQUIRED
Findings:
1. [blocking|major|minor] <file:line> - <what is wrong>
   Evidence: <why it is wrong>
   Required: <behavior or invariant, not a style preference>
   Test: <test to add or run>
Prior findings: <id> - FIXED | OPEN | still-DISMISSED
Residual risks: <short>
```

## Final report

Keep a per-round table:

```text
Round | Reviewer target | Verdict | Substantive | Fixed | Dismissed | Tests
```

Final report:

- outcome: clean or blocked;
- rounds used;
- fixes made, with files;
- false positives and style items dismissed, with reasons;
- test, build, and lint commands and results;
- reviewer target actually used; note any substitution;
- commit status; confirm nothing was pushed;
- residual risks.

## Efficiency

- One reviewer per round. Do not fan out redundant reviewers in this preset.
- Keep the brief lean: requirements, diff range, current test evidence, and prior findings. Do not paste the whole history.
- Fix all substantive findings in one pass per round instead of one round per finding.
- Do not re-review a change that only edits the report or comments unless it changes behavior.
- Do not spend a round on dismissed or style-only items.

## Autonomy

Proceed without asking permission per round. Pause or stop only when:

- no eligible reviewer target exists; never substitute parent-only review;
- a finding requires a product or requirements decision the parent cannot make;
- the reviewer changed the working tree despite the read-only contract;
- round 5 is reached with substantive findings: report the block, do not continue without authorization;
- the user materially changes scope: stop the current loop, report, and start a new loop only on request.

## Example

```text
$t3-orca review 循环 src/api
```

Implement the change if it does not exist yet, run verification, then review round 1 with the configured `review` tier (preset default `sol6.1 @ low`). Fix substantive findings in the parent, rerun verification, and start a fresh reviewer for each later round. Ignore false positives and style. Stop at a clean round or after round 5 with a blocking report. Commit only if asked; never push.
