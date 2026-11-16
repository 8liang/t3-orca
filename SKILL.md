---
name: t3-orca
description: Orchestrate T3 Code sub-agents on Orchestrator V2 by discovering provider/model capabilities and delegating each task to a capability-matched target. Use for role-specialized or parallel delegation, cross-provider review, model routing, and worktree-isolated child tasks. Do not use when one agent can finish ordinary work without delegation.
metadata:
  short-description: Capability-routed T3 sub-agent orchestration
---

# T3 ORCA

ORCA = Orchestrator Routing & Capability Assignment. Use T3 Code's Orchestrator V2 to split work across child agents and choose each child's `providerInstanceId` and `model` from live capabilities, not from brand memory.

## When to use

Use this skill when the user asks to:

- delegate to a different provider or a specific model;
- run independent work in parallel with specialized children;
- get cross-provider review or a second opinion;
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

## Non-negotiable rules

1. **Discover before routing.** Call `orchestrator_capabilities` once in the thread before the first `delegate_task`. Call it again only after an error or a user-named provider change. Never invent model IDs or option values.
2. **Use `delegate_task` for capability routing.** Native subagent tools such as `Agent` or `spawn_agent` are for same-provider work with no settings beyond yours. Any cross-provider target, explicit model or options, worktree isolation, or app-owned child must use `delegate_task`.
3. **The child starts with no parent history.** Every brief must be self-contained.
4. **Do not poll.** Async completion wakes this thread; after starting async delegates, end the turn. No sleep loops, `task_status` polling, or watchers; do not use `t3_thread_wait` as a substitute for a delegate completion wake.
5. **Never silently substitute.** If a requested provider or model is unavailable, or `canRunChildTask` is false, report it. Choose an explicit alternative only when the user already authorized a fallback.
6. **Each review or re-check is a new `delegate_task`.** Do not send new review work to an old child with `t3_thread_send`. Fix small findings yourself.
7. **`role` only labels the brief.** It prefixes "Act as the ... sub-agent"; it does not grant tools, change permissions, or restrict behavior. Put actual responsibilities in the brief.
8. **No secrets in `task`.** Use `request_secret`. Never put tokens, passwords, or private keys in a child brief.
9. **A delegated child does not re-delegate.** If you are the child, do the work yourself. Start no subagents unless your brief explicitly authorizes it.

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

## References

- [references/orchestrator-v2.md](references/orchestrator-v2.md) - tool contracts, fields, statuses, and exact semantics.
- [references/routing.md](references/routing.md) - capability signals, candidate scoring, and worked routing examples.
- [references/patterns.md](references/patterns.md) - fan-out, pipeline, review loop, worktree, escalation, and brief templates.

## Anti-patterns

- Hardcoding model IDs or option values from memory.
- Delegating without a self-contained brief.
- Starting async children and then polling or sleeping in the same turn.
- Sending a new review to a finished child instead of a new `delegate_task`.
- Using `create_threads` or `t3_thread_launch` as if they were subagents.
- Running parallel writers in one shared checkout without disjoint ownership.
- Using `worktree` for dependent work that needs the parent's uncommitted state.
- Assuming `role` changes the model's tools or capabilities.
