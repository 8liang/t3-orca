# Tiered delivery preset

Use this preset when the user says:

- `逐项开发`
- `tiered delivery`
- `按 ORCA 默认开发流程`
- or gives a multi-item implementation request that also asks for autonomous review/commit handling.

The short invocation is enough. Do not ask the user to type `provider:model:effort` when a tier is known.

The provider IDs below are the current defaults for this environment. Resolve them against the live capability payload; if an ID or label differs, match by `driverKind`/label and report the substitution.

This preset intentionally differs from the default independent-review pattern:

- the parent thread is the only reviewer;
- fix instructions go back to the original child thread;
- each item gets at most 5 review rounds;
- an item is committed only after tests and review pass;
- nothing is pushed.

Invoking this preset authorizes a reported fallback when a tier target is unavailable. A fallback is not a silent substitution: record the requested tier, the resolved target, and why it changed.

## Tier profile

The table below is the default profile used to prefill the setup page. A run resolves an inline `tiers:` block first, then the project's `.t3-orca/tiers.yaml`. There is no global profile.

If the project has no profile, open the Tier Profile window once, let the user choose, and save the generated YAML to `<project>/.t3-orca/tiers.yaml` before delegating. Do not silently use the default table, do not ask for provider/model/effort per item, and do not reuse another project's profile. See [tier-profile.md](tier-profile.md).

Profiles can use friendly aliases such as `ui: sol6.1 @ high` and `code: deepseek-flash-claude @ high`; see [tier-profile.md](tier-profile.md) for the grammar and validation rules.

## Tier table

| Tier | Use for | Preferred target | Default options | Fallback |
|---|---|---|---|---|
| `ui` | UI, visual design, frontend layout, interaction polish | provider `codex`, model `gpt-6.1-sol` (`sol6.1`) | `reasoningEffort: high` | Closest eligible design or vision target; report the substitution. |
| `code` | Pure code, refactor, bugfix, backend, tests | provider `magpie` (`driverKind: claudeAgent`), model `dumate/deepseek-v41-flash[1m]` | `effort: high` | Closest eligible code target; report the substitution. |
| `fast` | Mechanical edits, small test-only changes, low-risk cleanup | same as `code` | `effort: low` | Fast eligible code target; report the substitution. |
| `review` | Review of every item | parent thread by default | none | If the profile names a review target, use a fresh `delegate_task` per review round; otherwise no delegate. |

The `review` tier also supplies the reviewer target for the `review-loop` preset, which resolves the same profile; see [review-loop.md](review-loop.md).

Tier is a routing profile, not a global quality ranking. `ui` is the high-capability visual/design tier; `code` is the standard code tier; `fast` is optional and is only for mechanical or explicitly token-sensitive work. Honor an explicit natural-language override such as "use max", "use fast", or "use default"; otherwise use the tier default.

Classify each item by its dominant capability:

- `ui` when the deliverable is primarily visual, layout, interaction, or design-system work;
- `code` when it is primarily logic, API, data, backend, refactor, or test work;
- split mixed items into a `ui` part and a `code` part when both are material;
- use the generic routing heuristic for research, docs, infra, or other work not covered by a tier.

### Alias rules

- `sol6.1`, `sol-6.1`, `sol 6.1`, and `Sol 6.1` resolve to `gpt-6.1-sol`. Do not resolve them to `gpt-6.1-terra` or another model merely because it contains `6.1`.
- `magpie DeepSeek-Flash (claude)` resolves to provider `magpie` with `driverKind: claudeAgent` and model `dumate/deepseek-v41-flash[1m]`.
- `magpie-codex` with `dumate/deepseek-v41-flash` is a different driver. Do not use it silently for the Claude tier. If it is used as a fallback, report the driver change.
- `DeepSeek-Flash` without a provider qualifier prefers `magpie` Claude, then a reported fallback.

## Resolution algorithm

1. Call `orchestrator_capabilities` once for the thread. Resolve the tier profile: inline `tiers:`, then project `.t3-orca/tiers.yaml`. If neither is present, open the Tier Profile window once as described in [tier-profile.md](tier-profile.md), prefilled with the default table, and save the result to the project. Do not ask per item.
2. Find the exact preferred target by `providerInstanceId` and model `id`.
3. Reject the provider/model if `canRunChildTask` is false, `constraints` is non-empty, or the model is absent. If only a preferred option value is invalid, keep the model and handle it in step 5.
4. If the exact target is unavailable, score eligible fallbacks:
   - `ui`: prefer models with strong design, frontend, or vision signals; prefer the same provider before switching.
   - `code`: prefer a Claude-driver provider with a code-capable model; prefer the same provider before switching drivers.
   - `fast`: prefer the lowest-cost eligible code model with an explicit fast or low-effort option.
   Use the broader scoring heuristic in [routing.md](routing.md).
5. Use only option IDs and values advertised by the chosen model. If a preferred value is missing, use the model default and report it.
6. Record `requested tier`, `resolved provider`, `resolved model`, `options`, and `substituted: true/false`.
7. If no eligible target exists, stop and report. Do not invent a target.

`sol6.1` and the magpie Claude DeepSeek target are examples of tier resolution, not permission to ignore the live capability payload.

## Workflow

### 1. Plan items

Split the request into items with:

- a clear deliverable;
- owned files;
- dependencies;
- tier;
- test command;
- review criteria.

Independent items may run in parallel. Dependent items must be sequenced. If two items touch the same files, sequence them or isolate them.

### 2. Delegate

Use `delegate_task` with `mode: "async"`. For each item record:

`item | tier | taskId | childThreadId | link | worktreePath | rounds`

- `ui` uses `role: "design"`.
- `code` and `fast` use `role: "implementation"`.
- `review: parent` is not delegated. If the profile names a review target, that target is delegated with role `review` for each review round.
- Custom tier names use the `role` from the profile; without one, infer it from the name or default to `implementation`.
- Use `isolation: "shared"` for sequential items and parallel items with strictly disjoint files.
- Use `isolation: "worktree"` when parallel items need separate checkouts.
- Tell every child: do not commit or push; leave the changes for parent review.
- End the turn after starting the delegates.

### 3. Review each item

When an item completes, read `task_status` with its `taskId`. Then:

1. Read the child's summary and changed files.
2. Run the item's tests, or verify the child's captured test results.
3. Review the diff:
   - shared checkout: `git diff -- <item files>`;
   - worktree: `git -C <worktreePath> diff`.
4. Check the item against the requirements and the review checklist below.
5. Decide pass or fix.

If the profile is `review: parent` (the default), the parent is the reviewer. If the profile names a review target, use a fresh `delegate_task` for each review or re-check and keep fix instructions in the original implementation thread.

For a high-risk or security-critical item, ask the user whether to add an independent review delegate. Do not add one silently; the preset is optimized for parent review and token efficiency.

### 4. Fix loop

If there are substantive findings:

1. Compose a delta brief with only the findings and required changes.
2. Send it to the original child thread with `t3_thread_send` and `mode: "auto"`.
3. Capture the returned `runId` and, when present, the new `taskId`.
4. End the turn and wait for the follow-up task's completion wake.
5. On wake, call `task_status` with the new `taskId`, or read the child thread.
6. Re-review.
7. Increment the round counter.

A send to a finished child thread starts a fresh task in that same thread and returns its `taskId`; the child keeps its thread context. Do not create a new `delegate_task` for fixes in this preset.

If the original child thread is archived, deleted, or otherwise unavailable, report it. Do not silently create a replacement agent for that item.

Fix brief template:

```text
Item: <name>
Round: <n>/5

Findings
1. [severity] <file:line> - <what is wrong>
   Required: <behavior or invariant>
   Test: <test to add or run>

Constraints
- Fix only these findings.
- Do not commit; the parent commits after review.
- Run: <exact commands>
- Report: summary, files changed, test results, remaining risks.
```

### 5. Review checklist

Block the item for any substantive issue:

- requirement or behavior mismatch;
- correctness bug or unhandled edge case;
- missing or incorrect test for changed behavior;
- build or test failure;
- security, privacy, or data-loss risk;
- API or contract break;
- unrelated scope or files;
- secrets or credentials in the diff.

Non-substantive nits do not trigger a fix round:

- formatting and naming preferences;
- comment wording;
- optional refactors that do not affect behavior.

The parent may fix a non-substantive nit directly or note it. Do not spend a child round on it.

### 6. Commit per item

Commit only when all are true:

- the item's tests pass;
- the parent review has no substantive findings;
- the diff contains only that item's files;
- fewer than or equal to 5 review rounds were used.

Then:

```bash
git status --short
git diff --name-only -- <item paths>
git add <item files>
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "<type>(<scope>): <item>"
```

- Do not `git add -A` when another item's changes are present.
- Do not commit another item's files.
- Use `git add -A -- <item paths>` when the item deletes or renames files.
- Do not create an empty commit.
- Do not push, open a PR, or run a push command.
- Record the commit SHA in the item status.

For parallel items in one checkout, stage and commit the passed item while leaving other items' changes unstaged. For worktree items, integrate the item into the parent checkout first, then stage only its files.

### 7. Round limit

- Round 1 is the initial implementation review.
- Each fix plus re-review increments the round.
- At round 5, if substantive findings remain, stop and mark the item blocked.
- Do not commit a blocked item.
- Report the unresolved findings and the recommended next action. Continue beyond 5 only if the user explicitly authorizes it.
- Do not silently raise the limit.

## Token efficiency

- Call `orchestrator_capabilities` once per thread.
- Do not restate the full original brief in fix messages; send only the delta.
- Use `t3_thread_read` with `messages` and small `limit`/`maxCharsPerItem` values.
- Do not spawn a separate review or test agent in this preset unless the user asks.
- Let the implementation child run its tests; the parent verifies the command and result.
- Commit each item as soon as it passes to avoid reworking passed work.
- Do not poll a running child. Use completion wakes and `task_status`.

## Autonomy

Proceed without asking for permission for each item. Make reasonable assumptions and report them.

Stop or ask only when:

- no tier target or fallback is eligible;
- a finding requires a product decision the parent cannot make;
- the child asks a question the parent cannot answer;
- a worktree integration conflict cannot be resolved safely;
- the 5-round limit is reached: mark blocked, report, and do not continue without explicit authorization;
- the requested action would push, publish, or destroy data.

If scope changes and an item is no longer needed, `task_cancel` its task instead of letting it finish. Do not commit a cancelled item. Continue with the remaining items.

## Per-item report

Keep a compact status table and update it as items pass or block:

```text
Item | Tier | Resolved target | Rounds | Tests | Review | Commit
```

Final report:

- items completed and committed, with SHAs;
- items blocked, with findings and round count;
- items cancelled and why;
- tier substitutions and why;
- tests run;
- confirmation that nothing was pushed.

## Example

```text
$t3-orca 逐项开发 <feature request>
```

The skill should infer the tiers, parallelize independent items, review in the parent, send fixes back to each original thread, stop after 5 rounds, and commit each passing item without pushing.
