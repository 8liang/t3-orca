# Capability routing

Route by what the task needs, not by brand. The live `orchestrator_capabilities` payload is the source of truth for IDs, options, and eligibility.

## Step 1: classify the work

For each unit, write down:

- the role: `implementation`, `research`, `review`, `design`, `test`, or `general`;
- must-have capabilities;
- nice-to-have capabilities;
- whether it can run in parallel;
- whether it needs a separate checkout;
- how the result will be verified.

Example:

`review | must: deep reasoning, skepticism, diff reading | nice: different family from author | shared | verify: file:line findings with severity`

## Step 2: apply hard filters

Exclude a provider when any of these is true:

- `canRunChildTask` is false;
- `constraints` is non-empty;
- the requested model is absent even after `search`;
- the provider is disabled or unreachable in this environment;
- the user explicitly excluded that provider or data boundary.

Do not "try anyway" on a hard filter. Report the exact constraint.

## Step 3: score candidates

Use this order. Earlier criteria dominate.

1. **Required capability**: can the model plausibly do the work? Deep reasoning for ambiguous architecture, strong code/tool execution for implementation, long context for broad research, vision for image-based UI work.
2. **Context fit**: enough context for the files or corpus. Check `contextWindow` options when the provider exposes them.
3. **Tool and execution fit**: implementation and test work need shell, test runners, and file editing. Research may need web access. Do not assume every model in a provider has the same tool surface.
4. **Independence**: for review, pick a different provider or model family from the author. Same-family review is acceptable only for low-risk checks.
5. **Cost and latency**: use a fast or efficient model for mechanical work, broad scans, and test runs. Escalate only when the task is ambiguous, high-risk, or already failed.
6. **Stability**: when two candidates are close, prefer the inherited provider/model. It has fewer unknowns and usually fewer setup failures.

Record the reason for the choice. "It is the newest" is not a capability reason.

## Step 4: choose options

Options are provider-specific. Common patterns:

| Option | Use |
|---|---|
| `reasoningEffort`, `effort`, `reasoning_effort` | Raise for ambiguous design, review, or debugging; lower for mechanical edits. |
| `thinking` | Boolean or provider-specific thinking switch. Use only when the task benefits from deliberation. |
| `fastMode` | Lower latency at a possible quality cost. Use for scans and simple test loops. |
| `contextWindow` | Raise for large-repo research or long documents. |
| `serviceTier` | Priority can reduce latency; use when the task is gating. |
| `optimize_for` | Choose intelligence, balanced, or cost when the provider exposes an auto-router. |
| `mode` | Provider-specific execution mode. Do not confuse it with T3 `runtimeMode`. |

Rules:

- Use only IDs and values from the capability response.
- Do not set an option just because it exists.
- Omitted options inherit from the parent.
- Use `[]` or `{}` to clear inherited options when a child needs provider defaults.
- If an option value is rejected, re-read capabilities and correct it; do not guess a nearby value.

## Role playbook

### Implementation

Optimize for code editing, shell execution, test running, and enough context to understand the module.

- Mechanical, well-specified change: fast or efficient model, low to medium effort.
- Ambiguous change with cross-module effects: strong reasoning model, high effort.
- Parallel writers: `isolation: "worktree"` and disjoint ownership.
- Share interfaces up front so parallel children do not invent incompatible APIs.

### Research

Optimize for long context, fast reading, and web access when the task needs external facts.

- Split by source or subsystem, not by sentence.
- Ask for citations, file paths, and uncertainty.
- Synthesize in the parent; do not ask one researcher to merge all others unless it is the explicit integrator.
- For broad questions, run two researchers with different scopes and reconcile disagreements.

### Review

Optimize for reasoning depth and independence.

- Prefer a provider or model family different from the author.
- Give the reviewer the diff, the relevant files, the requirements, and the verification already run.
- Ask for findings with severity and `file:line`, plus concrete objections.
- Do not ask for a vague "review this"; ask what must be true for the change to be correct.
- A re-check after fixes is a new `delegate_task`, not a message to the old reviewer.

Exception: the `tiered-delivery` preset makes the parent the reviewer and sends fix instructions back to the original child thread. See [tiered-delivery.md](tiered-delivery.md) for that workflow.

### Test

Optimize for shell and test-runner execution, speed, and low cost.

- Give exact commands and the expected pass/fail signal.
- Ask for the first failure, the relevant log lines, and a minimal reproduction.
- Do not ask a test child to redesign the implementation unless the brief explicitly includes that scope.

### Design

Optimize for reasoning, frontend strength, and vision when images or screenshots are involved.

- Ask for options, tradeoffs, and a recommendation, not just code.
- For visual work, provide screenshots or reference images and state the target platform.
- If vision support is not exposed by capabilities, say so and verify with a small probe before relying on it.

### General

Inherit the parent unless a hard filter or a clear capability gap forces a change. Do not spend a delegation on work the parent can finish faster.

## Diversity for review

High-risk review benefits from a different failure mode, not just a different model name. Good combinations:

- implementation on a code-focused provider, review on a reasoning-focused provider;
- implementation on one family, adversarial review on another;
- one reviewer for correctness, another for security or performance;
- tests on a fast model, final judgment on a strong model.

Avoid:

- author and reviewer on the same model with the same prompt;
- three reviewers with identical instructions and no distinct focus;
- using model labels as proof of capability.

## What capabilities do not tell you

The payload gives IDs, options, modes, and eligibility. It does not guarantee:

- actual reasoning quality on your codebase;
- vision or image support;
- tool reliability or sandbox behavior;
- structured-output fidelity;
- cost or latency;
- data residency or privacy terms.

When one of these matters and the user has not already established it, state the uncertainty. Use a small probe task, or ask before sending sensitive code to a new provider.

## Worked example

This is an example from one T3 install observed on 2026-11-16. Do not copy the IDs; re-discover them.

Observed eligible providers included:

- a Codex provider with `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6.1-terra`, and `gpt-6-luna`, all exposing `reasoningEffort` and `serviceTier`;
- a Claude provider with `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-fable-5-2`, and `claude-haiku-5-5`, exposing `effort`, `ultracode`, and sometimes `fastMode`;
- a Cursor provider with `grok-4.7`, `claude-opus-5-5`, and `composer-2.5`, exposing `contextWindow`, `fastMode`, and effort controls;
- an Antigravity provider with `gemini-3.8-flash` and `thinking_level`;
- Qoder providers with `auto`, `ultimate`, `fast`, `efficient`, and `smodel`/`cmodel` variants.

A reasonable plan for "implement two modules, then review":

| Unit | Target choice | Why |
|---|---|---|
| Module A implementation | Codex `gpt-6.1-sol`, `reasoningEffort: high`, worktree | Strong code and shell execution; isolated writer. |
| Module B implementation | Claude `claude-opus-5-5`, `effort: high`, worktree | Independent implementation and a different failure mode from A. |
| Cross-review | Claude or Cursor strong model, high effort | Reviewer family differs from the Codex author. |
| Test pass | Qoder `efficient` or Claude Haiku, low effort | Fast and cheap for running known commands. |

The point is the selection logic, not these exact IDs. Always re-run `orchestrator_capabilities` and re-check `canRunChildTask` and `constraints`.
