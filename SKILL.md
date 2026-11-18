---
name: t3-orca
description: "Orchestrate T3 Code sub-agents on Orchestrator V2 with capability-matched provider/model routing, plus project-scoped Tier Profile setup (`配置`, `设置`, `setup`). At conversation start in a project, `.t3-orca/tiers.yaml` is read as the conversation's default profile. Expressing `setup` intent can create or modify `.t3-orca/tiers.yaml` (via the configurator's loopback bridge one-click save when `preview_open` is available, copy/download fallback, or explicit setup confirmation). In-conversation tier/model assignments (saying which model to use for a tier without `setup` intent) NEVER modify `.t3-orca/tiers.yaml` and apply only to the current conversation and its sub-conversations, leaving other sessions in the same project unaffected. Includes `tiered-delivery` (`逐项开发`) and `review-loop` (`review 循环`) presets. Use for parallel or cross-provider delegation, worktree-isolated child tasks, or Tier Profile setup. Do not use when one agent can finish ordinary work without delegation."
metadata:
  short-description: Tiered delivery, read-only review loops, and Tier Profile setup
---

# T3 ORCA

ORCA = Orchestrator Routing & Capability Assignment. Use T3 Code's Orchestrator V2 to split work across child agents and choose each child's `providerInstanceId` and `model` from live capabilities, not from brand memory.

Short invocation: `$t3-orca 逐项开发 <request>` applies the tiered-delivery preset below. `$t3-orca review 循环 <scope>` applies the review-loop preset. `$t3-orca 配置`, `$t3-orca 设置`, `$t3-orca setup` (or `/t3-orca 配置`, `/t3-orca 设置`, `/t3-orca setup` when delivered to this skill) open the Tier Profile configurator directly.

## Configuration and setup intent routing

Distinguish **project setup intent** (may modify `.t3-orca/tiers.yaml`) from **in-conversation tier assignment** (never modifies `.t3-orca/tiers.yaml`):

- **Setup intent** — when the user asks to configure, setup, or modify the project's `tiers.yaml` — including `/t3-orca 配置`, `/t3-orca 设置`, `/t3-orca setup`, `$t3-orca 配置`, `$t3-orca 设置`, `$t3-orca setup`, `打开 tier 窗口`, `刷新 tier 窗口`, or mid-conversation requests such as "setup tier", "修改项目默认 tiers.yaml", or "把这个配置保存到 tiers.yaml":
  - **Window/configurator commands** take precedence over presets: do not start `tiered-delivery`, `review-loop`, or any delegation, and do not require an existing config or task selection merely to open the page.
  - **Existing config must not suppress explicit setup.** Even when a project `.t3-orca/tiers.yaml` already exists, still build and open the window (passing `--profile <config>` to preload it) or, when the user explicitly requests updating `.t3-orca/tiers.yaml` directly in chat, validate and save via `save-tier-profile.mjs`.
  - **Follow the Tier Profile window steps below** (`orchestrator_capabilities` -> absolute `node <skill-dir>/scripts/build-tier-profile.mjs [--profile <config>]` -> `tier-profile-bridge.mjs` -> `preview_open`; fallback `html_preview` -> `html_render` with `height` capped at `2000`), keeping the target project's working tree untouched until the user saves.
  - **The page itself never writes files directly.** Prefer the bridge-served page via `preview_open` so the **保存到项目** button writes through the local bridge. If the bridge is unavailable, the inline iframe only generates YAML; ask the user to copy or download it, then write it with `node <skill-dir>/scripts/save-tier-profile.mjs --project <project-root>`. Do not claim the inline iframe saves the file.
- **In-conversation tier assignment (no setup intent)** — when the user says in conversation which model/options to use for a tier (for example, "code 用 opus max", "用 sol6.1 做 review", or pastes an inline `tiers:` block without expressing `setup` intent):
  - **Do NOT modify `.t3-orca/tiers.yaml`** and do not open the setup window to persist it.
  - Overlay the assignment in memory onto the conversation's defaults (loaded from `.t3-orca/tiers.yaml`) for **this conversation and its sub-conversations/child tasks only**, so other sessions in the same project are unaffected.

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

The short form above is the default profile used to prefill the setup page. Configuration is project-scoped only: there is no global profile. At conversation start (or before delegating in a thread), resolve the project root (the git root of the working directory, or the working directory outside a repo) and check `<project>/.t3-orca/tiers.yaml`:

1. **Read project defaults at conversation start:** Look for the nearest `<project>/.t3-orca/tiers.yaml` from the working directory up to the project root. When it exists, load it as this conversation's default tier profile (missing tiers fall back to the preset default table).
2. **Apply conversation-scoped overrides without touching `tiers.yaml`:** If the user pastes an inline `tiers:` block or states in conversation which model/options to use for a tier (without expressing `setup` intent), overlay those changes in memory onto the conversation's loaded defaults. This override applies **only to the current conversation and its sub-conversations/child tasks**; never modify `.t3-orca/tiers.yaml` and never affect other sessions in the same project.
3. **Modify `tiers.yaml` only on `setup` intent or missing-profile setup:** If no `.t3-orca/tiers.yaml` exists and no session override covers the needed tiers (or the user explicitly expresses `setup` intent at any point), open the Tier Profile window once (or save the confirmed setup profile) to `<project>/.t3-orca/tiers.yaml`.

Do not read or write `~/.config/t3-orca/tiers.yaml`, and do not silently run on the default table when the project has no profile and no explicit session override was given.

The window is built from [assets/tier-profile.html](assets/tier-profile.html) by [scripts/build-tier-profile.mjs](scripts/build-tier-profile.mjs). It is a self-contained configurator: provider and model pickers, effort options, aliases, parent/inherit/reuse modes, live-catalog validation, saved presets, and a generated `tiers:` block. [scripts/tier-profile-bridge.mjs](scripts/tier-profile-bridge.mjs) adds a short-lived loopback save bridge so the page can write the project config with one click.

Show it in T3 Code:

```bash
project=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
config="$project/.t3-orca/tiers.yaml"
d="$PWD"
while :; do
  if [ -f "$d/.t3-orca/tiers.yaml" ]; then config="$d/.t3-orca/tiers.yaml"; break; fi
  [ "$d" = "$project" ] && break
  d=$(dirname "$d")
done
test -f "$config" && echo "exists: $config" || echo "missing: $config"
```

1. Run the discovery command above and note whether the file already exists.
2. Call `orchestrator_capabilities` and save the exact JSON result to a temp file, for example `/tmp/t3-orca-capabilities.json`.
3. Resolve `<skill-dir>` to the directory containing this `SKILL.md`, then run `node <skill-dir>/scripts/build-tier-profile.mjs --profile <config> /tmp/t3-orca-capabilities.json` when the config exists, or omit `--profile` when it does not. Run from any working directory; passing an explicit temp output path such as `/tmp/t3-orca-tier-profile.html` is optional (omitting it writes to a safe unique temp file and prints its absolute path). Target project files stay untouched.
4. Start the direct-save bridge as a long-running PTY session (do not background it with `&`; this harness reaps detached children). `<config-base>` is the directory containing the resolved `.t3-orca` (usually the project root):

   ```bash
   node <skill-dir>/scripts/tier-profile-bridge.mjs \
     --project <config-base> \
     --page <built.html> \
     --ready-file /tmp/t3-orca-bridge-ready.json \
     --idle-minutes 60
   ```

   It prints `{ page, pageUrl, pageRoute, port, target, pid }` and also writes that JSON to the ready file. The server binds `127.0.0.1` only, requires a random token, writes only `<config-base>/.t3-orca/tiers.yaml`, and idles out after the given minutes.
5. If `preview_open` is available, open the bridge-served page in the T3 preview browser:

   ```json
   { "target": { "kind": "environment-port", "port": <port>, "path": "<pageRoute>" }, "open": true }
   ```

   This is the preferred path in T3 Code. Do **not** use `html_render` for the bridge page: T3's HTML renderer runs through a SOCKS proxy that blocks loopback, so the save button would show `本地桥接不可用`. With `--profile`, the page shows `已载入项目配置`; without it, it starts from the default table.

   **Phone viewport:** The preview is a streamed remote browser; the phone's screen width does not automatically become the page's CSS viewport. After `preview_open`, use its returned `tabId` with `preview_resize` before telling the user the page is ready. When the user is on a phone, reports a tiny desktop page, or the client size is unknown, use this compact default:

   ```json
   { "tabId": "<returned tabId>", "mode": "freeform", "width": 390, "height": 844 }
   ```

   If the user explicitly uses desktop, use `mode: "fill"` instead. Verify the resize result's `viewport.width` is at most 560 for phone setup (use `preview_status` if omitted). If resizing fails, report it and offer the copy/download or chat fallback; do not claim mobile adaptation succeeded. Keep the setup tab open for the user. CSS media queries and `<meta name="viewport">` alone cannot fix a desktop-sized streamed viewport.

   **Phone interaction failure:** A successful resize proves layout size only, not that the user's client can operate the streamed browser. If the user reports “像截图”, “点不了”, or “不能操作”, use the [chat fallback](references/tier-profile.md#chat-fallback) immediately: show the current project's compact `tiers:` block and accept either the full YAML or changed lines. If there is no project profile, show the preset defaults as editable suggestions. Check `preview_status` only to report observed state; `owner: agent` does not prove why touch input fails. Offer a control handoff only when an available tool explicitly supports it. Do not invent a handoff API or claim control was transferred. Do not repeatedly resize, reopen, or switch to `html_render` as a presumed interaction fix. An inline form may be tried once if the user requests it, but chat remains available without operating any page.

   Do not send a phone a `localhost`, `127.0.0.1`, or local filesystem URL as a working remote-browser link. Do not expose the save bridge on a public or LAN interface to work around this. The existing loopback bridge remains local.

6. Say one line: edit the tiers, then click **保存到项目**. The page writes the YAML through the bridge (which also automatically ensures `.t3-orca/` is listed in the project's `.gitignore`) and shows `已保存到 <path>`. Ask the user to reply when it is saved. If the user asks to refresh the catalog, stop the bridge, call `orchestrator_capabilities` again, rebuild, and restart the bridge.
7. When the user confirms, read `<config-base>/.t3-orca/tiers.yaml`, validate every target against `orchestrator_capabilities`, stop the bridge (`kill <pid>`), restate the profile once in compact form, and use it for the project. Do not ask again per item.
8. Fallback if the bridge cannot start, `preview_open` is unavailable, or the page shows `本地桥接不可用`: call `html_preview` with the file `page` path and `width: 390` for phone/unknown clients (`1180` only for explicit desktop use), then `html_render` with the same `path`, `title: "Tier Profile"`, and `Math.min(contentHeight, 2000)` as `height`. Ask the user to copy the YAML back or download it, then save it with `node <skill-dir>/scripts/save-tier-profile.mjs --project <config-base>` (YAML on stdin, which also ensures `.t3-orca/` is added to `.gitignore`). If they downloaded `tiers.yaml`, move or copy it to `<config-base>/.t3-orca/tiers.yaml` after confirming the path and ensure `.t3-orca/` is in `.gitignore`.

If `orchestrator_capabilities` or Node is unavailable, open the raw `<skill-dir>/assets/tier-profile.html` and use its manual `Capabilities` panel. If `html_preview` or `html_render` is unavailable, give desktop users the absolute file path to open locally. For a non-interactive frame or a phone without access to that filesystem, use the chat fallback.

Chat fallback when no usable window is available (including a phone showing only a non-interactive preview):

```yaml
tiers:
  ui: sol6.1 @ high
  code: deepseek-flash-claude @ high
  fast: code @ low
  review: parent
```

Say only changed lines are required; tiers can be added or removed. Then validate against capabilities, save it to `<project>/.t3-orca/tiers.yaml` with `scripts/save-tier-profile.mjs`, and use it. See [references/tier-profile.md](references/tier-profile.md).

**Setup reply routing:** ONLY while an explicit setup prompt or configurator session is pending, YAML or natural-language tier edits are the user's confirmation to save the project profile (even if the pasted block also contains `$t3-orca 逐项开发`). Validate targets against live capabilities, overlay partial edits on the preloaded project profile, save via `save-tier-profile.mjs`, and read the file back. Stop the setup bridge after saving or abandoning the page; if its PTY/session already exited, confirm that the recorded process is gone and continue without turning cleanup into a save failure. Restate the accepted profile once. If no development task accompanies the configuration, ask for the task and do not start delegates or repeat previously completed work. Outside a pending setup flow (or explicit `setup` intent), tier/model assignments stay scoped to the current conversation and its sub-conversations and never write `.t3-orca/tiers.yaml`.

The `review-loop` preset reuses this profile's `review` tier; it does not maintain a separate reviewer setting.

## Preset: independent review loop

When the user says `review 循环`, `review-loop`, `只读 Review 循环`, says `直接 review` together with a request to fix until clean, or asks for `派 <target> 子代理只读 Review，你负责修复问题并验证，再次 Review，循环直到无实质性问题`, apply [references/review-loop.md](references/review-loop.md). A plain request to review and report findings is a one-shot review delegate, not this preset.

Short form:

- The reviewer is the **`review` tier from the same conversation tier profile** (loaded from nearest `<project>/.t3-orca/tiers.yaml` at conversation start, with any in-conversation `review` override applied for this conversation and its children without modifying `tiers.yaml`; if no project file exists and no explicit target is given, open project setup once with the preset default prefilled). An explicit target in the current conversation wins over `.t3-orca/tiers.yaml` without writing to disk. Never use a global config, never the parent alone, and never `t3_thread_send` to an earlier reviewer.
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
11. **Project defaults at start; session-scoped overrides in conversation; write `tiers.yaml` only on setup.** At conversation start in a project, read the nearest `<project>/.t3-orca/tiers.yaml` as the conversation's default profile. There is no global profile. Any in-conversation tier/model assignment (or inline `tiers:`) without `setup` intent overlays in memory **for the current conversation and its sub-conversations/child tasks only** — never modify `.t3-orca/tiers.yaml` and never affect other sessions in the same project. Pass resolved targets (and effective `tiers:` in the brief when a child is authorized to sub-delegate) down to children so sub-conversations inherit the conversation's overrides without touching disk. Only modify `.t3-orca/tiers.yaml` when the user expresses `setup` intent or completes first-time project setup (when neither `.t3-orca/tiers.yaml` nor a covering session override exists; for `review-loop`, prefill `sol6.1 @ low` unless the user says to use the preset default for this run). Do not ask for tier settings per item, and do not assume another project's profile applies.
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
| No project `.t3-orca/tiers.yaml` | Open the Tier Profile window once and save the result. Do not run on an unsaved default or a global config. |
| Bridge page shows `本地桥接不可用` in `html_render` | T3's HTML renderer uses a SOCKS proxy that blocks loopback. Open the same bridge page with `preview_open` (`environment-port`), or fall back to copy/download. |
| Phone preview looks like a screenshot or cannot be operated | Use chat fallback with the existing profile; validate and save the returned YAML. Resizing does not establish touch support; do not infer the cause from ownership alone. |
| Bridge process exited or `preview_open` unavailable | Restart the bridge once; if it still fails, use the copy/download fallback. Do not leave the user with an unsaved profile. |
| Substantive findings remain after round 5 | Mark the item or work blocked; do not commit. In `review-loop`, report the blocking reasons and recommended next options. Continue only with explicit authorization. |
| Review reports only style, nits, or false positives | Treat the round as clean after triage; record the dismissed items; do not fix them to please the reviewer. |
| Reviewer leaves unexpected working-tree changes | Stop and report. The review was not read-only; do not reset the tree blindly. |

## References

- [references/orchestrator-v2.md](references/orchestrator-v2.md) - tool contracts, fields, statuses, and exact semantics.
- [references/routing.md](references/routing.md) - capability signals, candidate scoring, and worked routing examples.
- [references/tiered-delivery.md](references/tiered-delivery.md) - tier aliases, parent-review loop, 5-round limit, and per-item commit rules.
- [references/review-loop.md](references/review-loop.md) - independent read-only review rounds, parent fix-and-verify loop, triage, 5-round limit, and blocking report.
- [references/tier-profile.md](references/tier-profile.md) - project-scoped `tiers:` profiles, the HTML window, preloading, saving, and validation.
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
- Reading or writing a global `~/.config/t3-orca/tiers.yaml`.
- Modifying `.t3-orca/tiers.yaml` when the user assigns a model to a tier in conversation without expressing `setup` intent.
- Letting an in-conversation tier assignment affect other sessions in the same project, or omitting it from the current conversation's sub-conversations/children.
- Discarding `.t3-orca/tiers.yaml` defaults for unmentioned tiers when applying an in-conversation override.
- Silently using the default table when the project has no `.t3-orca/tiers.yaml` and no session override was given.
- Assuming another project's tier profile applies without checking.
- Claiming the iframe writes `.t3-orca/tiers.yaml`; it only generates YAML.
- Using `html_render` for the bridge page when `preview_open` is available; the inline renderer's SOCKS proxy blocks loopback.
- Starting the bridge with `&` or `nohup` in this harness instead of a long-running PTY session.
- Committing an item before tests and review pass, or pushing without being asked.
