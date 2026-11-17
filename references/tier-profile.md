# Tier profile

A project-scoped routing profile for the `tiered-delivery` and `review-loop` presets. The tier table in [tiered-delivery.md](tiered-delivery.md) is the starting point used to prefill the setup page; the saved profile is what runs use.

There is no global profile. A profile belongs to the project that contains it, so switching projects does not reuse another project's tiers.

## Resolution order

1. Inline `tiers:` block in the current message.
2. Nearest `.t3-orca/tiers.yaml` from the current directory up to the project root.
3. No project profile: open the Tier Profile window once (or use the chat fallback below), then save the result to the project.

The project root is the git root of the working directory, or the working directory itself outside a git repository. Do not read `~/.config/t3-orca/tiers.yaml` and do not silently fall back to the default table: a run without a project profile must configure one first.

Inline wins for that run only and is not saved automatically. Do not reuse another project's profile unless the user explicitly copies it.

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

[assets/tier-profile.html](../assets/tier-profile.html) is the template for a self-contained configurator. [scripts/build-tier-profile.mjs](../scripts/build-tier-profile.mjs) injects the live catalog, optionally injects the project's existing profile, and writes a temporary copy. The generated page still works from `file://` and inside the T3 Code preview panel with no network or dependencies.

What it does:

- edits the four default tiers and adds custom tiers;
- picks `providerInstanceId`, model `id`, role, and every advertised option;
- supports `parent`, `inherit`, and reuse-another-tier (`fast: code @ low`) modes;
- applies friendly aliases;
- loads the live `orchestrator_capabilities` catalog injected at build time;
- preloads an existing project profile when built with `--profile <path>`, and shows `已载入项目配置`;
- emits the compact or expanded `tiers:` block;
- saves directly to `<config-base>/.t3-orca/tiers.yaml` through the optional loopback bridge, with copy/download as fallback;
- keeps named presets in `localStorage` when the browser allows it.

The T3 Code HTML attachment runs in a sandboxed frame without `allow-same-origin`, so `localStorage` is usually unavailable there. The page then shows `此窗口不能本地保存；请复制或下载`. Never treat a browser draft as the saved project config.

### Opening it

When the project has no usable profile — or whenever the user explicitly asks to open/configure tiers (`/t3-orca 配置`, `/t3-orca 设置`, `/t3-orca setup`, `$t3-orca 配置`, `$t3-orca 设置`, `$t3-orca setup`, `打开 tier 窗口`, `刷新 tier 窗口`) — open the window directly. Explicit setup requests take precedence over presets, require no delegation prerequisite, and must not be suppressed by an existing `tiers.yaml`:

1. Resolve the project root and `<project>/.t3-orca/tiers.yaml`. Note whether it exists.
2. Call `orchestrator_capabilities` and save the exact JSON result to a temp file.
3. Run `node <skill-dir>/scripts/build-tier-profile.mjs [--profile <project>/.t3-orca/tiers.yaml] <capabilities.json> [out.html]` using the absolute script path from any working directory. Include `--profile` when the config exists so the page preloads it; omit it for a new profile. Omitting `out.html` writes to a safe unique temp file and prints its absolute path; target project files stay untouched. The builder injects `window.__T3_ORCA_CAPABILITIES__` and `window.__T3_ORCA_PROFILE__` and prints the generated path.
4. Start the direct-save bridge as a long-running session (`<config-base>` is the directory containing the resolved `.t3-orca`, usually the project root):

   ```bash
   node <skill-dir>/scripts/tier-profile-bridge.mjs \
     --project <config-base> \
     --page <built.html> \
     --ready-file /tmp/t3-orca-bridge-ready.json \
     --idle-minutes 60
   ```

   It prints and writes `{ page, pageUrl, pageRoute, port, target, pid }`. The bridge serves the page at `/page` and the save endpoint at `/save`.
5. Prefer `preview_open` in T3 Code:

   ```json
   { "target": { "kind": "environment-port", "port": <port>, "path": "<pageRoute>" }, "open": true }
   ```

   The page opens in the T3 preview browser with `已载入项目配置` (when built with `--profile`) or `新建配置`. The user edits the tiers and clicks **保存到项目**; the bridge writes the YAML atomically and the page shows `已保存到 <path>`.

   **Phone viewport:** The preview is a streamed remote browser; the phone's screen width does not automatically become the page's CSS viewport. After `preview_open`, use its returned `tabId` with `preview_resize` before telling the user the page is ready. When the user is on a phone, reports a tiny desktop page, or the client size is unknown, use this compact default:

   ```json
   { "tabId": "<returned tabId>", "mode": "freeform", "width": 390, "height": 844 }
   ```

   If the user explicitly uses desktop, use `mode: "fill"` instead. Verify the resize result's `viewport.width` is at most 560 for phone setup (use `preview_status` if omitted). If resizing fails, report it and offer the copy/download or chat fallback; do not claim mobile adaptation succeeded. Keep the setup tab open for the user. CSS media queries and `<meta name="viewport">` alone cannot fix a desktop-sized streamed viewport.

6. Do **not** use `html_render` for the bridge-served page. T3's HTML renderer runs headless Chrome with a SOCKS proxy (`--proxy-bypass-list=<-loopback>`) that refuses loopback/private targets, so the page shows `本地桥接不可用`. Use `html_render` only for the copy/download fallback below.
7. Tell the user to reply when the page says saved. Then read `<config-base>/.t3-orca/tiers.yaml`, validate every target against the live capabilities, stop the bridge (`kill <pid>`), and restate the profile once.

Fallback when the bridge cannot start, `preview_open` is unavailable, or the page cannot reach the bridge:

1. Call `html_preview` with the file `page` path and `width: 390` for phone/unknown clients (`1180` only for explicit desktop use).
2. Call `html_render` with the same `path`, `title: "Tier Profile"`, and `Math.min(contentHeight, 2000)` as `height` (cap 2000).
3. Ask the user to copy the generated YAML back or download `tiers.yaml`.
4. Save with [`scripts/save-tier-profile.mjs`](../scripts/save-tier-profile.mjs) (YAML on stdin), or move the downloaded file to `<config-base>/.t3-orca/tiers.yaml` after confirming the path.

### Direct-save bridge

[scripts/tier-profile-bridge.mjs](../scripts/tier-profile-bridge.mjs) is a short-lived local helper:

- binds `127.0.0.1` on a random port; never exposes a LAN interface;
- requires a 24-byte random token on `/page`, `/health`, `/save`, and `/shutdown`;
- writes only the resolved `<config-base>/.t3-orca/tiers.yaml`, atomically, with a 64 KB body limit;
- serves the configurator at `/page` with relative `/save` and `/health` URLs, so the preview browser is same-origin;
- exits after the idle timeout (default 30 minutes) or when the agent stops it with `kill <pid>`.

The bridge page is self-contained and offline apart from the bridge calls. The file `page` variant uses absolute `http://127.0.0.1:<port>/...` URLs for a regular browser; the `/page` variant uses relative URLs for `preview_open`.

Do not run the bridge with `&` or `nohup` in this harness; start it as a long-running PTY session so it survives while the user edits. Do not leave it running after the config is saved.

Do not paste the HTML source into the thread. Do not also dump a long provider/model table.

The injected catalog is live. The page badge shows `T3 Code · N providers` when injection succeeded. If it shows `内置预填目录`, injection failed or the raw template was opened; use the Capabilities panel to paste the JSON manually, or rerun the helper.

If `orchestrator_capabilities` or Node is unavailable, open the raw `<skill-dir>/assets/tier-profile.html` and use the manual Capabilities panel. If `html_preview` or `html_render` is unavailable, or the embedded frame is not interactive, give the user the absolute file path link and ask them to open it in a browser. The page works the same way.

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
targets against the live capabilities, save the result to the project's
`.t3-orca/tiers.yaml`, and use it for this project.
```

### After the window

- Validate every target against the live capabilities.
- If the user saved with **保存到项目**, the file is already written; read it and validate. If they copied or downloaded the YAML instead, save it to the resolved `<config-base>/.t3-orca/tiers.yaml` before delegating (usually the project root):

  ```bash
  node <skill-dir>/scripts/save-tier-profile.mjs --project <config-base> <<'YAML'
  tiers:
    ...
  YAML
  ```

  Feed the YAML on stdin. The helper creates `.t3-orca/`, writes atomically, and refuses a `.t3-orca` directory that resolves outside the project. It prints the target path.
- Stop the bridge after the file is saved (`kill <pid>`); do not leave the loopback server running.
- For an explicit `setup` request, the returned YAML is the user's confirmation; replacing the existing project config is expected. For a first run, create it. If the user cancels, leave the existing file unchanged.
- If the user downloaded `tiers.yaml` instead of pasting it, move or copy that file to `<project>/.t3-orca/tiers.yaml` after confirming the path.
- Restate the accepted profile once in compact form.
- If the user only changed a few rows, keep the remaining tiers from the base profile; the window's `仅输出改动` mode emits exactly that overlay.
- Do not reopen the window or ask again for the same project unless the user asks to change tiers or the file is missing.

## Partial replies

- A full `tiers:` block replaces the current profile.
- A partial block overlays the default or last accepted profile.
- A single line such as `code: cursor:claude-opus-5-5 @ effort=max` changes only that tier.
- `tier: default` resets that tier to the default profile.
- `tier: inherit` sets that tier to the parent provider/model/options.

After accepting and saving a profile, restate it once in compact form and use it for the rest of the project. Do not ask again unless the user changes it or the file is missing.

Natural-language overrides are allowed. Map them to the compact form, restate the result once, and proceed. For example, `code 用 cursor opus max` becomes `code: cursor:claude-opus-5-5 @ effort=max`.

`reset tiers` or `use default tiers` resets the in-memory profile to the default table. It does not delete the project file until the user saves the reset.

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

- Inline only: use the profile for this run; do not write a file.
- Project profile: write `<project>/.t3-orca/tiers.yaml` with [`scripts/save-tier-profile.mjs`](../scripts/save-tier-profile.mjs). The helper creates `.t3-orca/`, writes atomically, and refuses paths outside the project.
- There is no global config. Do not write `~/.config/t3-orca/tiers.yaml`.
- For a first-time setup, write the returned YAML directly. For an explicit `setup`/edit of an existing profile, the returned YAML is the confirmation to replace it. In any other case where the user did not ask to change an existing file, show the proposed content and ask before replacing.

The template is in [assets/tier-profile.template.yaml](../assets/tier-profile.template.yaml).

## Examples

Change only the UI target for this project:

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
