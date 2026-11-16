# Delegation patterns

Patterns for capability-routed T3 child agents. Adapt them; do not run every pattern in every task.

## Brief template

The child has no parent history. A good brief is self-contained and verifiable.

```text
Goal
<One sentence describing the outcome.>

Context
- Repo: <absolute path or project name>
- Branch or worktree: <name>
- Relevant files: <paths>
- Current behavior: <what happens now>
- Related decisions: <interfaces, constraints, prior attempts>

Scope
- In scope: <what to change or investigate>
- Out of scope: <what not to touch>

Constraints
- Preserve <behavior/API>.
- Do not add dependencies unless <condition>.
- Follow <style or local conventions>.
- Do not edit <files owned by another child>.

Deliverable
- <Patch, files, report, test results, or PR.>
- <Exact output format.>

Verification
- Run: <exact commands>
- Expected: <pass/fail signal>
- If it fails: <what to report>

Report back
- Summary of changes
- Files changed
- Commands run and results
- Risks, assumptions, unresolved questions
```

Rules:

- Use absolute paths when the child may run in a worktree.
- State file ownership explicitly for parallel work.
- Include the exact test command. Do not say "run the tests" if the repo has several suites.
- Never include secrets.

## Review brief template

```text
Act as an independent reviewer. Do not edit code unless explicitly asked.

Goal
Determine whether this change satisfies the requirements without regressions.

Requirements
- <Acceptance criteria>
- <Invariants that must hold>

Artifacts
- Diff or PR: <path, commit, or URL>
- Relevant files: <paths>
- Tests already run: <commands and results>

Look for
- Correctness bugs and edge cases
- Security or data-loss risks
- Concurrency, ordering, or idempotency issues
- Missing tests for changed behavior
- Unnecessary scope or unrelated changes

Report
- Findings first, ordered by severity
- Each finding: severity, file:line, why it is wrong, suggested fix
- Explicit "no findings" if the change is clean
- Residual risks and questions
```

For a re-check after fixes, start a new `delegate_task` with the previous findings, the new diff, and the fixes applied. Do not reuse the old reviewer thread.

## Pattern: capability fan-out

Use when units are independent and the parent only needs to synthesize.

```text
Parent
  |-- research A (long context) ---> summary A
  |-- research B (different source) -> summary B
  `-- implementation C (worktree) ---> patch C
```

- Start all children with `mode: "async"`.
- Give each child a distinct scope and output format.
- End the turn after starting them.
- On each completion wake, read `task_status` and integrate.

Do not fan out three children with the same brief. That produces correlated answers and wastes budget.

## Pattern: implement then review

Use when correctness matters and a second provider adds real independence.

1. Implement with provider A in a worktree or shared checkout.
2. Wait for completion if the review is gating (`mode: "wait"` on the implementation, or end the turn and resume on wake).
3. Start a fresh review delegate with provider B. Include the diff, requirements, and tests.
4. Fix small findings yourself. For larger findings, start another implementation delegate with the findings.
5. Re-check with a new review delegate, not `t3_thread_send`.

```json
{
  "task": "<review brief>",
  "target": {
    "providerInstanceId": "<different provider>",
    "model": "<strong reasoning model>",
    "options": { "effort": "high" }
  },
  "role": "review",
  "isolation": "shared",
  "mode": "wait"
}
```

Use `mode: "wait"` only when you need the review before your next action. Otherwise use async and end the turn.

## Pattern: parallel worktrees

Use when two or more writers must run at the same time and their changes are separable.

```json
{
  "task": "<module A brief with absolute worktree paths and file ownership>",
  "target": {
    "providerInstanceId": "<provider A>",
    "model": "<coding model>"
  },
  "title": "Module A",
  "role": "implementation",
  "isolation": "worktree",
  "mode": "async"
}
```

- Each child gets its own worktree from the parent HEAD.
- Uncommitted parent edits are not included. If the children need them, ask the user or use `shared` so the state is reachable. Do not create commits without approval.
- Give each child a disjoint file set and a shared interface contract.
- The parent integrates after both complete. If you delegate integration, give the integrator the commit SHAs and a checkout that can reach them.
- Do not use `worktree` for work that must see another child's uncommitted changes.

## Pattern: research, synthesize, then implement

Use when the implementation depends on facts the parent does not have.

1. Run research children in parallel on different sources or subsystems.
2. Synthesize their findings in the parent.
3. Resolve contradictions explicitly.
4. Start implementation with the synthesized brief, not the raw research dumps.

Do not start implementation and research in parallel when the implementation depends on the research result. That is a false fan-out.

## Pattern: escalation ladder

Use when a cheap or fast model may be enough, but quality matters if it fails.

1. Start the task on a fast or efficient target.
2. If the result is incomplete or wrong, inspect the failure and write a specific escalation brief.
3. Start a new delegate on a stronger target with the failure context.
4. `task_cancel` the old task if it is still running or its result is no longer needed.

Do not start the strong model in parallel "just in case" unless the cost is justified and the user asked for redundancy.

## Pattern: cross-environment delegation

Use when the user names another machine or a task must run where the code or device lives.

```text
1. t3_environment_links
2. orchestrator_capabilities with target environmentId
3. delegate_task with target.environmentId, providerInstanceId, model
```

- IDs are that machine's.
- Confirm the link is reachable and the provider is child-capable there.
- Do not silently run locally if the remote environment is unavailable.

## Pattern: cancel and supersede

Use when requirements change or a delegate is no longer needed.

- Call `task_cancel` with the `taskId` and a short reason.
- Cancellation stops running and queued turns, child delegates, and PR watches.
- Do not use `t3_thread_interrupt` on a delegated child.
- Start no replacement unless the new work is actually needed.
- Report what was cancelled and why.

## Pattern: test swarm

Use when several independent verification commands can run in parallel.

- One child per suite or platform, with exact commands.
- Ask for the first failure and the minimal reproduction, not the full log.
- Use a fast, low-cost target.
- Keep destructive or stateful tests out of parallel shared checkouts.

## Anti-patterns

- Starting async children and then waiting in the same turn with sleep or polling.
- Sending a new review to a finished child.
- Using one shared checkout for parallel writers with overlapping files.
- Using `worktree` when the child needs the parent's uncommitted edits.
- Delegating a task that depends on another child's output before that output exists.
- Asking a child to "figure out the task" without a brief.
- Using `role` as a substitute for explicit responsibilities.
- Hardcoding a model that was not in the capability response.
- Falling back to a native subagent or CLI after a routing failure without telling the user.
