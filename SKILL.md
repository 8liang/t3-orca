---
name: t3-orca
description: "Orchestrate T3 Code sub-agents on Orchestrator V2 with capability-matched provider/model routing. Includes a tiered-delivery preset for 逐项开发 with an interactive per-session Tier Profile window: UI/design routes to sol6.1, pure code to magpie DeepSeek-Flash (Claude), the parent reviews, fixes go back to the original thread, up to 5 rounds, per-item commit, no push. Also includes a review-loop preset: an independent read-only reviewer (the profile's `review` tier, default sol6.1 low) checks each round, the parent fixes and verifies, max 5 rounds, ignore false positives and style, report blockers. Use for parallel or cross-provider delegation and worktree-isolated child tasks. Do not use when one agent can finish ordinary work without delegation."
metadata:
  short-description: Tiered delivery, parent review, and read-only review loops
---

# T3 ORCA

ORCA = Orchestrator Routing & Capability Assignment. Use T3 Code's Orchestrator V2 to split work across child agents and choose each child's `providerInstanceId` and `model` from live capabilities, not from brand memory.

Short invocation: `$t3-orca 逐项开发 <request>` applies the tiered-delivery preset below. `$t3-orca review 循环 <scope>` applies the review-loop preset.

## When to use

Use this skill when the user asks to:

- delegate to a different provider or a specific model;
- run independent work in parallel with specialized children;
- get cross-provider review or a second opinion;
- run a delegated review-and-fix loop, where an independent read-only reviewer checks each round and the parent fixes and verifies;
- isolate child work in a separate checkout or worktree;
- route by capability such as reasoning depth, speed, context, vision, cost, or tool use.

Do not delegate trivial work, tightly coupled edits, or tasks where coordination costs more than doing the work directly.

## Choose the delegation mechanism

| Situation | Use |
|---|---|
| Same provider, no settings beyond yours, and no need for a T3-visible child | Native subagent tool |
| Different provider, explicit model, or explicit options | `delegate_task` |
| Need a `taskId`, cancellation, completion wake, or a child link | `delegate_task` |
| Need a separate checkout or PR workspace | `delegate_task` with `isolation: "worktree"` |
| Need a new top-level thread | `t3_thread_launch` or `create_threads` |

`delegate_task` creates an app-owned child: it has a `taskId`, appears as a T3 subagent, can be cancelled, and wakes the parent on completion.

## Presets at a glance

| Preset | Trigger | Reviewer | Fixer | Limit | Commit |
|---|---|---|---|---|---|
| `tiered-delivery` | `逐项开发`, multi-item autonomous delivery | parent, or a fresh profile review target | original child thread | 5 rounds per item | per item after pass; no push |
| `review-loop` | `review 循环`, delegated read-only review until clean | `review` tier from the same tier profile (preset default `sol6.1 @ low`); fresh read-only delegate every round | parent | 5 review rounds total | only if asked; no push |

## Preset: tiered delivery

When the user says `逐项开发`, `tiered delivery`, `按 ORCA 默认开发流程`, or gives a multi-item implementation request that also asks for autonomous review/commit handling (for example, `逐项提交`, `review 后 commit`, `不 push`), apply [references/tiered-delivery.md](references/tiered-delivery.md).

Short form:

- **UI/design** routes to `sol6.1`: provider `codex`, model `gpt-6.1-sol`, `reasoningEffort: high`.
- **Pure code** routes to magpie DeepSeek-Flash (Claude): provider `magpie`, model `dumate/deepseek-v41-flash[1m]`, `effort: high`.
- Defaults are `reasoningEffort: high` for UI and `effort: high` for code. A user override such as `use max` or `use fast` wins.
- The **parent reviews every item by default**. Fix instructions go back to the original child thread; a re-check is a new review round.
- Max **5 review rounds** per item. If substantive issues remain, do not commit.
- Tests and review pass, then **commit only that item**; never push.
- Independent items may run in parallel; review and commit are per item.
- Resolve tiers from live capabilities. Do not ask the user to type provider, model, or effort when a tier is known.
- If a tier target is unavailable, the preset authorizes a reported fallback; never substitute silently.

### Tier profile window

The short form above is the default profile. Tiers change between sessions, so resolve a profile before delegating:

1. an inline `tiers:` block in the current message;
2. the nearest `.t3-orca/tiers.yaml` from the working directory up to the git root;
3. `~/.config/t3-orca/tiers.yaml`;
4. otherwise open the Tier Profile window once.

The window is [assets/tier-profile.html](assets/tier-profile.html). It is a self-contained, offline configurator: provider and model pickers, effort options, aliases, parent/inherit/reuse modes, optional live-capabilities validation, saved presets, and a generated `tiers:` block.

Show it in T3 Code:

- Call `html_preview` with the absolute path to `assets/tier-profile.html` and `width: 1180`, then `html_render` with the same `path`, `title: "Tier Profile"`, and the returned `contentHeight` as `height` (cap 2000). Do not inline the HTML.
- Say one line: edit the tiers in the window, then copy the generated YAML back (or save it to `.t3-orca/tiers.yaml`).
- If those tools are unavailable, or the user says the frame is not interactive, give them the absolute file path to open in a browser.
- When they return the YAML, validate every target against `orchestrator_capabilities`, restate it once in compact form, and use it for the thread. Do not ask again per item.

Chat fallback when no window is available:

```yaml
tiers:
  ui: sol6.1 @ high
  code: deepseek-flash-claude @ high
  fast: code @ low
  review: parent
```

Say only changed lines are required; tiers can be added or removed. Then validate against capabilities and use it. See [references/tier-profile.md](references/tier-profile.md).

The `review-loop` preset reuses this profile's `review` tier; it does not maintain a separate reviewer setting.

## Preset: independent review loop

When the user says `review 循环`, `review-loop`, `只读 Review 循环`, says `直接 review` together with a request to fix until clean, or asks for `派 <target> 子代理只读 Review，你负责修复问题并验证，再次 Review，循环直到无实质性问题`, apply [references/review-loop.md](references/review-loop.md). A plain request to review and report findings is a one-shot review delegate, not this preset.

Short form:

- The reviewer is the **`review` tier from the same tier profile the development flow uses**, started fresh every round. Resolve it exactly like `逐项开发`: inline `tiers:` → nearest `.t3-orca/tiers.yaml` → `~/.config/t3-orca/tiers.yaml` → this preset's default profile. An explicit target in the current message wins over the profile. Never the parent alone, and never `t3_thread_send` to an earlier reviewer.
- The review-loop default for the `review` tier is `sol6.1 @ low` (provider `codex`, model `gpt-6.1-sol`, `reasoningEffort: low`). `review: parent` is a tiered-delivery value; here it means unset, so use this default. Do not maintain a separate reviewer setting.
- The **parent fixes and verifies**. Fix only substantive findings yourself, run tests, then start the next round.
- **Ignore false positives and style-only suggestions.** Record them; do not change code for them and never spend a round on them.
- Max **5 review rounds**. Pass only when a round has no substantive findings and verification passes. If round 5 still fails, stop, report the blocking reasons, and do not commit.
- Use `role: "review"`, `isolation: "shared"`, and `mode: "wait"`.
- Commit only if the user asked; never push.
- If the reviewer target is unavailable, use a reported fallback. Never fall back to parent-only review.

## Non-negotiable rules

1. **Discover before routing.** Call `orchestrator_capabilities` once in the thread before the first `delegate_task`. Call it again only after an error or a user-named provider change. Never invent model IDs or option values.
2. **Use `delegate_task` for capability routing.** Native subagent tools such as `Agent` or `spawn_agent` are for same-provider work with no settings beyond yours. Any cross-provider target, explicit model or options, worktree isolation, or app-owned child must use `delegate_task`.
3. **The child starts with no parent history.** Every brief must be self-contained.
4. **Do not poll.** Async completion wakes this thread; after starting async delegates or sending a fix follow-up, end the turn. No sleep loops, `task_status` polling, or watchers. Use `t3_thread_wait` only when the current turn truly needs the result.
5. **Never silently substitute.** If a requested provider or model is unavailable, or `canRunChildTask` is false, report it. Choose an explicit alternative only when the user already authorized a fallback.
6. **Default: each independent review or re-check is a new `delegate_task`.** Do not send new review work to an old child with `t3_thread_send`. The `review-loop` preset always uses a fresh read-only review delegate per round. Exception: the `tiered-delivery` preset can make the parent the reviewer and sends only fix instructions back to the original child thread. If its tier profile names a review target, use a fresh review delegate per round.
7. **`role` only labels the brief.** It prefixes "Act as the ... sub-agent"; it does not grant tools, change permissions, or restrict behavior. Put actual responsibilities in the brief.
8. **No secrets in `task`.** Use `request_secret`. Never put tokens, passwords, or private keys in a child brief.
9. **A delegated child does not re-delegate.** If you are the child, do the work yourself. Start no subagents unless your brief explicitly authorizes it.
10. **Apply a preset only when it fits.** Use `tiered-delivery` when the user invokes it by name or gives a multi-item implementation request that also asks for autonomous review/commit handling. Use `review-loop` when the user asks for a delegated review-and-fix loop. Do not apply either preset's review, fix, round-limit, or commit rules to ordinary one-off delegation.
11. **Resolve the tier profile once per thread.** Check the inline `tiers:` block, the nearest `.t3-orca/tiers.yaml`, then `~/.config/t3-orca/tiers.yaml`. For `tiered-delivery`, if none exists, open the Tier Profile window once (or use the chat fallback). For `review-loop`, use the configured `review` tier or the preset default; open the window only if the user asks to configure tiers. Do not ask for tier settings per item, and do not assume another session's profile still applies.
12. **The review-loop reviewer stays read-only.** The reviewer never edits, stages, commits, or pushes; the parent owns fixes and verification. Never send fixes to the reviewer, never let style or false positives extend the loop, and never exceed 5 rounds without explicit authorization.

## Core workflow

### 1. Plan the units

Split by ownership and dependency. Units are parallel only when they can run without each other's output. Sequence dependent work. Give parallel writers disjoint files or modules.

For each unit record:

`unit | role | required capability | candidate target | isolation | mode | verification`

### 2. Discover capabilities

Call `orchestrator_capabilities`, optionally with `search` when the catalog is truncated or the user names a model family. Read:

- `providers[].canRunChildTask` - must be true.
- `providers[].constraints` - non-empty means the provider is disabled or unusable.
- `models[].id`, optional `label`, and `options[]` with the allowed `values`.
- `omittedModels` - call again with `search` to see more.
- `runtimeModes` - only relevant if the user asks for a supervised child.
- inherited provider, model, and options - the defaults when `target` is omitted.

Build a short candidate list. Read [references/routing.md](references/routing.md) for the scoring heuristic.

### 3. Write the brief

Use the template in [references/patterns.md](references/patterns.md). State the goal, context, scope, constraints, deliverable, verification, and report format. Include exact paths and commands. Do not assume the child can see this thread.

### 4. Delegate

```json
{
  "task": "<self-contained brief>",
  "target": {
    "providerInstanceId": "<from capabilities>",
    "model": "<from capabilities>",
    "options": { "<optionId>": "<allowed value>" }
  },
  "title": "<short label>",
  "role": "implementation",
  "isolation": "shared",
  "mode": "async"
}
```

- Omit `target` to inherit the parent's provider, model, and options.
- `options` override inherited values; `[]` or `{}` clears them.
- `isolation: "worktree"` creates a separate checkout or PR workspace. Its base is the parent HEAD and uncommitted edits are excluded.
- `mode: "async"` is the default. Use `"wait"` only when this turn needs the result. The default wait timeout is 10 minutes, and a timeout does not cancel the child.
- Omit `runtimeMode` and `interactionMode` unless the user asks for a supervised child. A child cannot run with broader modes than the parent.
- Add `target.environmentId` for a linked machine. Provider, model, project, and thread IDs are that machine's.

### 5. Reconcile

After an async completion wake, call `task_status` for the `taskId`, or `t3_thread_read` for detail. Check:

- `status`, `workState`, and `latestTerminalStatus`;
- `summary` and `latestTerminalSummary`;
- `executedModel` - it may differ from the requested `model`; report what actually ran;
- `hasPendingQuestion` and `pendingApproval` - answer in the child thread or surface to the user;
- `link` - cite it verbatim in the final reply.

Integrate results yourself. Do not ask one child to merge another child's work unless the brief explicitly makes it the integrator.

### 6. Review and close

For review, start a fresh delegate with the findings and the patch or PR to inspect. Prefer a different provider or model family from the author for high-risk work. Use `task_cancel` to stop superseded work; never `t3_thread_interrupt` on a child thread. Report cancelled tasks.

Exception: in the `tiered-delivery` preset, the parent reviews and fix instructions go back to the original child thread. Follow [references/tiered-delivery.md](references/tiered-delivery.md). For a review-and-fix loop with an independent read-only reviewer, follow [references/review-loop.md](references/review-loop.md).

## Routing defaults

| Work | Role | Capability to optimize | Default isolation | Mode |
|---|---|---|---|---|
| Well-scoped implementation | `implementation` | coding, tool use, test execution, enough context | `worktree` if parallel, else `shared` | async |
| Ambiguous design or architecture | `design` | deep reasoning, long context | `shared` | wait if blocking |
| Codebase research | `research` | long context, fast reads, web if needed | `shared` | async |
| Review or audit | `review` | reasoning, skepticism, different family from author | `shared` | wait if gating |
| Tests and QA | `test` | shell and test tools, speed, low cost | `shared` or `worktree` | async |
| UI or visual work | `design` | vision, frontend strength | `worktree` if parallel | async |
| General fallback | `general` | inherit parent unless a constraint exists | `shared` | async |

These are starting points, not model IDs. Use the discovered `models` and `options` to pick exact targets. See [references/routing.md](references/routing.md).

In the `tiered-delivery` preset, the `review` row is the parent thread by default. A tier profile can name a review target, which switches to a fresh review delegate per round. In the `review-loop` preset, the review row is always a fresh independent delegate resolved from the profile's `review` tier (preset default `sol6.1 @ low`), and the parent fixes and verifies.

## Failure handling

| Symptom | Action |
|---|---|
| `canRunChildTask: false` or non-empty `constraints` | Exclude the provider. Do not try it. |
| Model not listed | Call capabilities with `search`; if still absent, report it. |
| `parent_not_active` | The thread has no active run owned by this MCP provider session. Do not retry blindly; start from a thread and run owned by this session, or ask the user to retry. |
| `runtime_mode_escalation_denied` or `interaction_mode_escalation_denied` | The child cannot exceed the parent's modes. Omit the mode or ask the user to change the parent. |
| Worktree base error | The parent HEAD is not reachable from the project root. Use `shared`, or ask the user to make the base reachable. |
| `waitTimedOut: true` | The child is still running. Do not assume failure. End the turn or cancel explicitly. |
| Orchestrator tools absent | Try the tool name once; T3 tools may load late. If it is still absent, report that Orchestrator V2 is unavailable. Do not fake delegation with shell commands, native agents, or a CLI. |
| Provider or model unavailable | Report the exact target and the error. Do not fall back to native tools, workflows, or CLIs unless the user approves. |
| Child asks a question or needs approval | Surface it, or answer in the child thread if authorized. Do not guess. |
| Substantive findings remain after round 5 | Mark the item or work blocked; do not commit. In `review-loop`, report the blocking reasons and recommended next options. Continue only with explicit authorization. |
| Review reports only style, nits, or false positives | Treat the round as clean after triage; record the dismissed items; do not fix them to please the reviewer. |
| Reviewer leaves unexpected working-tree changes | Stop and report. The review was not read-only; do not reset the tree blindly. |

## References

- [references/orchestrator-v2.md](references/orchestrator-v2.md) - tool contracts, fields, statuses, and exact semantics.
- [references/routing.md](references/routing.md) - capability signals, candidate scoring, and worked routing examples.
- [references/tiered-delivery.md](references/tiered-delivery.md) - tier aliases, parent-review loop, 5-round limit, and per-item commit rules.
- [references/review-loop.md](references/review-loop.md) - independent read-only review rounds, parent fix-and-verify loop, triage, 5-round limit, and blocking report.
- [references/tier-profile.md](references/tier-profile.md) - per-session `tiers:` overrides, the HTML window, resolution order, and validation.
- [references/patterns.md](references/patterns.md) - fan-out, pipeline, review loop, worktree, escalation, and brief templates.

## Anti-patterns

- Hardcoding model IDs or option values from memory.
- Delegating without a self-contained brief.
- Starting async children and then polling or sleeping in the same turn.
- Sending a new *review* to a finished child instead of a new `delegate_task` (outside the `tiered-delivery` fix loop).
- Sending a re-check or fix to the previous reviewer in the `review-loop` preset.
- Letting a read-only reviewer edit files, run stateful commands, or commit.
- Fixing style nits or false positives to make a review pass, or spending a round on them.
- Declaring the review-loop done or committing while substantive findings remain.
- Giving a `review-loop` reviewer `worktree` isolation that cannot see the parent's uncommitted fixes.
- Using `create_threads` or `t3_thread_launch` as if they were subagents.
- Running parallel writers in one shared checkout without disjoint ownership.
- Using `worktree` for dependent work that needs the parent's uncommitted state.
- Assuming `role` changes the model's tools or capabilities.
- Asking the user for provider, model, or effort when the `tiered-delivery` tier is known.
- Pasting a long provider/model/effort template instead of opening the Tier Profile window.
- Asking for tier settings per item instead of once per thread.
- Assuming the last session's tier profile without checking.
- Committing an item before tests and review pass, or pushing without being asked.
