# Orchestrator V2 contract

Practical reference for the T3 Code Orchestrator MCP tools used by this skill. Tool names are shown without the MCP namespace. Confirm field names against the live schema if the T3 Code version changes.

Derived from T3 Code Beta's Orchestrator MCP tool schemas and orchestration instructions (observed 2026-11-16).

## Tool map

| Tool | Purpose |
|---|---|
| `orchestrator_capabilities` | List providers, models, options, modes, and child-task eligibility. |
| `delegate_task` | Start one app-owned child agent with a self-contained task. |
| `task_status` | Read a delegated task after its completion wake. |
| `task_cancel` | Stop a delegated task and the work it started. |
| `t3_thread_read` | Read a child thread's messages, plans, or activity. |
| `t3_thread_send` | Send a follow-up to a thread. Not a replacement for a new review delegate. |
| `t3_thread_wait` | Block on a thread run when the current turn truly needs the result. |
| `t3_thread_interrupt` | Interrupt a top-level thread. Not for delegated children. |
| `request_secret` | Ask the user for one secret without placing it in a task brief. |
| `t3_environment_links` | List linked machines for cross-environment delegation. |
| `t3_environment_link` | Ask the user to link another machine when it is not listed. |

Do not use `create_threads` or `t3_thread_launch` for subagents. Those create top-level threads.

## `orchestrator_capabilities`

### Input

```json
{
  "environmentId": "<optional linked machine>",
  "search": "<optional model id or label match>"
}
```

- `search` matches model IDs and labels and replaces the short model list. Use it when `omittedModels` is non-zero or the user names a family.
- `environmentId` asks for another linked machine's catalog. IDs in the response are then that machine's.

### Response shape

```json
{
  "parentThreadId": "...",
  "inheritedProviderInstanceId": "...",
  "inheritedModel": "...",
  "inheritedOptions": [{ "id": "reasoningEffort", "value": "high" }],
  "runtimeMode": "full-access",
  "interactionMode": "default",
  "providers": [
    {
      "providerInstanceId": "...",
      "driverKind": "...",
      "displayName": "...",
      "models": [
        {
          "id": "...",
          "label": "...",
          "options": [
            {
              "id": "reasoningEffort",
              "values": ["low", "medium", "high"],
              "default": "medium"
            }
          ]
        }
      ],
      "omittedModels": 4,
      "runtimeModes": ["approval-required", "auto", "full-access"],
      "canRunChildTask": true,
      "canRunCrossProviderChildTask": true,
      "constraints": []
    }
  ],
  "features": {
    "appOwnedSubagents": true,
    "asyncPolling": true,
    "cancellation": true,
    "batchThreadCreation": true,
    "threadManagement": true,
    "incrementalThreadRead": true,
    "scheduledTasks": true,
    "maxBatchThreads": 20
  }
}
```

### How to read it

- Treat `canRunChildTask: false` or a non-empty `constraints` array as a hard no.
- Use `models[].id` exactly. `label` is display text, not an ID.
- Use only option IDs and values from `models[].options`. Option values may be strings, booleans, or numbers.
- `omittedModels` means the short list was truncated. Use `search` to find other models.
- `runtimeModes` lists what the provider accepts. A child may still be narrower than the parent but never broader.
- `inheritedOptions` is the option set the child inherits when `target.options` is omitted.
- `canRunCrossProviderChildTask` is the provider's own eligibility signal. When in doubt, use a provider with both flags true and no constraints.

## `delegate_task`

### Input

```json
{
  "task": "<required, self-contained brief>",
  "target": {
    "providerInstanceId": "<preferred selector>",
    "driverKind": "<fallback selector>",
    "model": "<model id>",
    "options": { "<optionId>": "<allowed value>" },
    "environmentId": "<optional linked machine>",
    "projectId": "<optional, with environmentId>"
  },
  "title": "<optional short label>",
  "role": "implementation",
  "isolation": "shared",
  "mode": "async",
  "timeoutMs": 600000,
  "clientRequestId": "<optional retry key>"
}
```

- `task` is capped at 120,000 characters. Keep it focused and self-contained.
- `target` is optional. Without it, the child inherits the caller's provider, model, options, and environment.
- Prefer `target.providerInstanceId` over `driverKind`.
- `target.options` accepts an object or an array of `{id, value}`. Values override inherited options. `[]` or `{}` clears inherited options.
- Use `target.projectId` with `target.environmentId` to choose a project on a linked machine. A local task runs in the parent thread's project; passing a different local project is rejected.
- `role` is one of `implementation`, `research`, `review`, `design`, `test`, or `general`. Non-general roles prefix the brief with "Act as the <role> sub-agent for this task." They do not change tools or permissions.
- `isolation: "shared"` (default) runs in the parent checkout. `"worktree"` creates a prepared checkout from the parent HEAD; uncommitted edits stay out.
- `mode: "async"` (default) returns immediately and wakes the parent when the task completes. `"wait"` blocks this call for the result.
- `timeoutMs` applies only to `"wait"`. The default is 10 minutes. A timeout does not cancel the child.
- `clientRequestId` makes retries idempotent. Reuse the same key when retrying the same delegation; use a new key for a new task.
- Omit `runtimeMode` and `interactionMode` unless the user asks for a supervised child. A mode above the parent's is rejected; a narrower mode can pause for human approval.

The example shows the common input shape. Omit `timeoutMs` outside wait mode.

### Async completion

An async delegate returns a `next` value that says its completion wakes this thread and that you should end your turn. Follow it:

1. Start the async delegates.
2. End the turn. Do not call `task_status` in a loop.
3. On the completion wake, call `task_status` for the task.

`mode: "wait"` ends early when the child asks a question or requests approval. The child keeps running; the wait result reports `hasPendingQuestion` or `pendingApproval`.

### Result shape

```json
{
  "taskId": "...",
  "childThreadId": "...",
  "remoteChild": {
    "environmentId": "...",
    "threadId": "...",
    "label": "..."
  },
  "link": "...",
  "childRunId": "...",
  "childNodeId": "...",
  "status": "running",
  "workState": "working",
  "hasPendingChildRuns": false,
  "latestTerminalRunId": null,
  "latestTerminalStatus": null,
  "latestTerminalSummary": null,
  "providerInstanceId": "...",
  "model": "...",
  "executedModel": "...",
  "options": [{ "id": "...", "value": "..." }],
  "summary": null,
  "hasPendingQuestion": false,
  "pendingApproval": null,
  "waitTimedOut": false,
  "next": "..."
}
```

- `status`: `queued`, `running`, `waiting`, `completed`, `failed`, `cancelled`, or `interrupted`.
- `workState`: `working`, `waiting_for_children`, or `result_available`. A finished turn with live child work is not done.
- `remoteChild` is present only for a task that runs in a linked environment.
- `summary` and `latestTerminalSummary` are the child's result text.
- `executedModel` is what the provider reported running. It can differ from `model`; report both when they differ.
- `link` is the user-facing thread link. Mention it verbatim in replies.
- `hasPendingQuestion` and `pendingApproval` block the child until answered or approved.
- `waitTimedOut` is true only on the timed-out wait call. The child is still running.

## `task_status`

```json
{ "taskId": "..." }
```

Reads one delegated task you started. Do not call it on a running task before its completion wake. Use it after a wake, or for a task you already know has settled. Reading a finished result marks it delivered.

## `task_cancel`

```json
{
  "taskId": "...",
  "reason": "<optional, up to 2000 chars>",
  "clientRequestId": "<optional retry key>"
}
```

Stops the task's running and queued turns, its delegates, and its PR watches. A finished task keeps its result. Use this for superseded work. Never use `t3_thread_interrupt` on a delegated child.

## Thread tools

### `t3_thread_read`

Reads a thread by ID. Use `messages` for user and assistant messages and plans, or `activity` for the full timeline. Keep reads small with `limit` and `maxCharsPerItem`; page with `afterPosition=nextPosition`; resume cut-off text with `itemId` and `textOffset=nextTextOffset`.

Reading a child's final result marks it delivered. Mention the child by its `link`, not by a bare ID or title.

### `t3_thread_send`

Sends a message to any thread. `mode: "auto"` starts an idle thread, steers a running turn, or queues. `queue`, `steer`, and `restart` are explicit alternatives.

Response fields:

```json
{
  "threadId": "...",
  "link": "...",
  "messageId": "...",
  "runId": "...",
  "taskId": "...",
  "status": "running",
  "delivery": "started"
}
```

A send to a finished child thread starts a fresh task in that same thread, returns its `taskId`, and gives it a completion wake. This is the intended mechanism for the `tiered-delivery` preset's fix loop: the parent sends only findings, the original child fixes them, and the parent reviews again.

For a new review or re-check, use a fresh `delegate_task` instead. It keeps the review independent and gives you a new task to cancel if needed.

### `t3_thread_wait`

Waits for a thread's run to finish. Omit `runId` for the latest run. On timeout, with `next` end your turn; without it, call again. Prefer completion wakes for async delegates. Use this only when the current turn truly needs the result, such as a blocking follow-up run.

### `t3_thread_interrupt`

Interrupts a top-level thread's running turn. It is not the cancellation path for delegated children. Use `task_cancel`.

## Cross-environment delegation

Use `t3_environment_links` to find a linked machine. Then pass `target.environmentId` to `delegate_task`:

```json
{
  "task": "...",
  "target": {
    "environmentId": "<linked machine>",
    "providerInstanceId": "<provider on that machine>",
    "model": "<model on that machine>"
  }
}
```

Provider, model, project, and thread IDs are that machine's. Confirm the catalog with `orchestrator_capabilities` using the same `environmentId`. If the link is expired or unreachable, report it; do not silently run locally.

If the machine the user names is not listed, call `t3_environment_link` with a hint from their words. Do not ask for a pairing code in chat. The outcome arrives as a message in this thread; do not wait or poll for it.

## Secrets

Never put a secret in `task`. Use `request_secret` and pass the returned `secretRef` or file path to the command that needs it. One secret per request card.
