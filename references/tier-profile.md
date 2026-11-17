# Tier profile

A per-session override for the `tiered-delivery` preset. The tier table in [tiered-delivery.md](tiered-delivery.md) is the default; a profile changes only the tiers that differ for the current task.

Use this when the user's model tiers change between sessions. Do not edit the skill or re-type a full provider/model/effort table for every item.

## Resolution order

1. Inline `tiers:` block in the current message.
2. Nearest `.t3-orca/tiers.yaml` from the current directory up to the git root.
3. `~/.config/t3-orca/tiers.yaml`.
4. Default profile in [tiered-delivery.md](tiered-delivery.md).
5. Open the Tier Profile window once (or use the chat fallback below).

Inline wins over project config; project config wins over global config. Do not reuse a profile from another thread unless the user says to.

## Compact form

YAML or JSON with a `tiers` key is accepted. The examples below use YAML.

```yaml
tiers:
  ui: codex:gpt-6.1-sol @ reasoningEffort=high
  code: magpie:dumate/deepseek-v41-flash[1m] @ effort=high
  fast: code @ effort=low
  review: parent
```

Rules:

- `provider:model` uses a `providerInstanceId` and a model `id` or unique label match.
- `@` starts options; separate multiple options with commas and use `key=value`.
- `same_as` shorthand: `fast: code @ effort=low` reuses the `code` provider/model and overrides options.
- `same_as` resolves the referenced tier after all overlays, so `fast: code @ effort=low` follows a changed `code` target.
- `inherit` uses the parent thread's provider, model, and options.
- `review: parent` is the `tiered-delivery` default. A target such as `review: claudeAgent:claude-opus-5-5 @ effort=high` switches to an independent review delegate.
- The `review-loop` preset always needs an independent reviewer and reads the same profile: a concrete `review` target is used; `review: parent` means unset there, so that preset's default `sol6.1 @ low` applies. There is no separate reviewer setting. See [review-loop.md](review-loop.md).
- `default` resets that tier to the default profile.
- Option values are coerced to the types advertised by the live capability payload (string, boolean, or number).

An explicit target on a single item in the user's request wins over that item's tier. Record the override and validate it the same way.

## Friendly shorthand

Provider and option names can be omitted. A value without `:` is treated as a model alias; an options segment without `=` is treated as the model's primary effort value.

```yaml
tiers:
  ui: sol6.1 @ high
  code: deepseek-flash-claude @ high
  fast: code @ low
  review: parent
```

This is equivalent to the full form:

```yaml
tiers:
  ui: codex:gpt-6.1-sol @ reasoningEffort=high
  code: magpie:dumate/deepseek-v41-flash[1m] @ effort=high
  fast: code @ effort=low
  review: parent
```

Current aliases (re-discover before relying on them):

| Alias | Resolves to |
|---|---|
| `sol6.1`, `sol-6.1` | `codex:gpt-6.1-sol` |
| `deepseek-flash-claude` | `magpie:dumate/deepseek-v41-flash[1m]` |
| `deepseek-flash` | same as above; prefer `magpie` |
| `opus` | `claude-opus-5-5`; prefer `claudeAgent` |
| `sonnet` | `claude-sonnet-5-5`; prefer `claudeAgent` |
| `haiku` | `claude-haiku-5-5`; prefer `claudeAgent` |
| `gemini-flash` | `gemini-3.8-flash`; prefer Antigravity |

For a bare effort value, choose the model's primary effort option in this order: `reasoningEffort`, `effort`, `reasoning_effort`, `thinking_level`, `thinking`, `mode`. If no such option accepts the value, report the invalid shorthand and ask for `key=value`.

If an alias matches multiple eligible models, prefer the default provider, then ask or report a substitution. Never guess between two materially different models.

### Tier names and roles

The built-in names map to roles:

| Tier name | Role |
|---|---|
| `ui`, `design` | `design` |
| `code`, `fast` | `implementation` |
| `test` | `test` |
| `review` | `review` |
| `research` | `research` |

Custom tier names are allowed. Set `role:` in the expanded form when the name is not obvious. Without a role, infer it from the name or default to `implementation`.

## Expanded form

Use this when an ID contains `:`, spaces, or other characters that make the compact separator ambiguous:

```yaml
tiers:
  code:
    provider: magpie
    model: dumate/deepseek-v41-flash[1m]
    role: implementation
    options:
      effort: high
  frontend:
    provider: cursor
    model: claude-opus-5-5
    role: design
    options:
      effort: high
      contextWindow: 1m
  review: parent
```

Compact and expanded forms can be mixed.

## Tier Profile window

[assets/tier-profile.html](../assets/tier-profile.html) is the template for a self-contained configurator. [scripts/build-tier-profile.mjs](../scripts/build-tier-profile.mjs) injects the live catalog and writes a temporary copy; the generated page still works from `file://` and inside the T3 Code preview panel with no network or dependencies.

What it does:

- edits the four default tiers and adds custom tiers;
- picks `providerInstanceId`, model `id`, role, and every advertised option;
- supports `parent`, `inherit`, and reuse-another-tier (`fast: code @ low`) modes;
- applies friendly aliases;
- loads the live `orchestrator_capabilities` catalog injected at build time;
- emits the compact or expanded `tiers:` block;
- keeps named presets and the last edit in `localStorage`.

### Opening it

When a thread has no usable profile, open the window once:

1. Call `orchestrator_capabilities` and save the exact JSON result to a temp file.
2. Run `node scripts/build-tier-profile.mjs <capabilities.json> <out.html>` from the skill directory. It injects the result as `window.__T3_ORCA_CAPABILITIES__` and prints the generated path.
3. Call `html_preview` with that path and `width: 1180`.
4. Call `html_render` with the same `path`, `title: "Tier Profile"`, and the `contentHeight` returned by `html_preview` as `height` (cap 2000).
5. Send one short line: edit the tiers, then copy the generated YAML back or save it to `.t3-orca/tiers.yaml`.

Do not paste the HTML source into the thread. Do not also dump a long provider/model table.

The injected catalog is live. The page badge shows `T3 Code · N providers` when injection succeeded. If it shows `内置预填目录`, injection failed or the raw template was opened; use the Capabilities panel to paste the JSON manually, or rerun the helper.

If `orchestrator_capabilities` or Node is unavailable, open the raw `assets/tier-profile.html` and use the manual Capabilities panel. If `html_preview` or `html_render` is unavailable, or the embedded frame is not interactive, give the user the absolute path and ask them to open it in a browser. The page works the same way.

Never present the seed catalog as live truth.

### Chat fallback

If no window can be shown, ask once in one normal chat message, not as a secret card. It is configuration, not a credential.

```text
Tier profile (edit only what differs; add or remove tiers as needed):

tiers:
  ui: sol6.1 @ high
  code: deepseek-flash-claude @ high
  fast: code @ low
  review: parent

Reply with the full block or only the lines you changed. I will validate the
targets against the live capabilities and use this profile for the thread.
```

### After the window

- Treat the returned YAML as an inline `tiers:` block, whether it came from chat or a saved file.
- Validate every target against the live capabilities.
- Restate the accepted profile once in compact form.
- If the user only changed a few rows, keep the remaining tiers from the base profile; the window's `仅输出改动` mode emits exactly that overlay.
- Do not reopen the window or ask again for the same thread unless the user asks to change tiers.

## Partial replies

- A full `tiers:` block replaces the current profile.
- A partial block overlays the default or last accepted profile.
- A single line such as `code: cursor:claude-opus-5-5 @ effort=max` changes only that tier.
- `tier: default` resets that tier to the default profile.
- `tier: inherit` sets that tier to the parent provider/model/options.

After accepting a profile, restate it once in compact form and use it for the rest of the thread. Do not ask again unless the user changes it or says the tiers differ.

Natural-language overrides are allowed. Map them to the compact form, restate the result once, and proceed. For example, `code 用 cursor opus max` becomes `code: cursor:claude-opus-5-5 @ effort=max`.

`reset tiers` or `use default tiers` clears the session profile and returns to the default table.

## Validation

For each tier:

1. Resolve the provider by `providerInstanceId`, then by `displayName` or `driverKind`.
2. Resolve the model by exact `id`, then by `label` or an id substring.
3. Check `canRunChildTask` and `constraints`; exclude ineligible providers.
4. Validate option IDs and values against the model's advertised options.
5. If the exact target is unavailable, use the fallback rules in [tiered-delivery.md](tiered-delivery.md) and report `substituted: true` with the reason.
6. If no eligible target exists, stop and ask. Do not invent a target.

If the user says `strict` or `don't substitute`, stop on an unavailable target instead of falling back.

An invalid option value is a configuration error, not a reason to silently change the model. Use the model default, report the rejected value, and ask whether to keep the default or provide another value.

If the profile names a provider that was not in the last capability payload, call `orchestrator_capabilities` again before validating. A user-named provider change justifies the extra call.

## Saving

- Inline only: use the profile for this thread.
- "Save for this project": write `.t3-orca/tiers.yaml` at the project root.
- "Save globally": write `~/.config/t3-orca/tiers.yaml` only with explicit permission.
- Before overwriting an existing config file, show the proposed content and ask.

The template is in [assets/tier-profile.template.yaml](../assets/tier-profile.template.yaml).

## Examples

Change only the UI target for this session:

```yaml
tiers:
  ui: cursor:claude-opus-5-5 @ effort=max, contextWindow=1m
```

Change the code target and keep everything else:

```yaml
tiers:
  code: codex:gpt-6.1-sol @ reasoningEffort=high
```

Use a fast tier for mechanical work:

```yaml
tiers:
  fast: code @ effort=low
```

Use an independent review delegate for a high-risk item:

```yaml
tiers:
  review: claudeAgent:claude-opus-5-5 @ effort=high
```

Inherit the parent for one tier:

```yaml
tiers:
  fast: inherit
```
