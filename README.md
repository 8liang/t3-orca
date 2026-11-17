# T3 ORCA

T3 Code 的 **Orchestrator V2 能力路由 skill**。它把任务拆成子任务，先用 `orchestrator_capabilities` 读取当前环境真实可用的 provider、model 和选项，再用 `delegate_task` 把每个子任务交给最匹配的子 agent。

ORCA = **Orchestrator Routing & Capability Assignment**。

内置两个预设：`逐项开发`（父线程 Review + 逐项提交）和 `review 循环`（独立只读 reviewer + 父线程修复）。

## 解决什么问题

- 同一个任务里，不同子任务需要不同能力：实现、研究、审查、测试、设计。
- 不同 provider/model 在推理深度、上下文、速度、成本、工具调用上差异很大。
- 子 agent 需要独立的模型、选项、worktree 或远端环境，而不是继承父 agent。
- 需要一个可审计、可取消、完成后能唤醒父线程的编排流程。

## 安装

```bash
# Codex
ln -s "$(pwd)" "${CODEX_HOME:-$HOME/.codex}/skills/t3-orca"

# 其他兼容 ~/.agents/skills 的 agent
ln -s "$(pwd)" "$HOME/.agents/skills/t3-orca"
```

安装后在 T3 Code 中通过 `$t3-orca` 调用，或直接提出需要多 provider 子 agent 编排的任务。

## 依赖

- T3 Code 已启用 Orchestrator V2。
- 会话中可用 `orchestrator_capabilities`、`delegate_task`、`task_status`、`task_cancel` 等 T3 工具。
- 至少一个 `canRunChildTask: true` 且 `constraints` 为空的 provider；跨 provider 编排需要两个以上。

## 使用示例

```text
Use $t3-orca to implement this feature with two parallel sub-agents in separate
worktrees, then have a different provider review the combined diff before I merge.
```

```text
用 $t3-orca 先发现当前可用的 provider/model，然后：
1. 用擅长实现的模型并行完成 A、B 两个模块；
2. 用另一个 provider 的强推理模型做交叉审查；
3. 用快速模型跑测试并汇总失败原因。
```

## 逐项开发预设

当你说 `逐项开发`、`tiered delivery` 或 `按 ORCA 默认开发流程` 时，skill 自动套用以下预设，不需要再手写 provider、model、强度：

```text
$t3-orca 逐项开发 <需求>
```

### Tier Profile 窗口

配置按项目保存：每个项目一份 `.t3-orca/tiers.yaml`，不读也不写全局配置。首次执行时打开交互式
Tier Profile 窗口；保存后，后续执行直接复用项目配置，不再询问。也可以随时通过 `$t3-orca 配置`、`$t3-orca 设置`、`$t3-orca setup`（或当宿主将其路由到本 skill 时的 `/t3-orca 配置` / `/t3-orca 设置` / `/t3-orca setup`）以及 `打开 tier 窗口` 直接打开配置页；已存在的项目配置会被预载：

[assets/tier-profile.html](assets/tier-profile.html)

窗口由模板生成。T3 Code 里优先用 `preview_open` 打开桥接页面，用户点一次 **保存到项目** 就能直接写入 `.t3-orca/tiers.yaml`；`html_preview` / `html_render` 作为复制/下载回退路径。生成时会自动注入 `orchestrator_capabilities` 的 live 目录，所以 provider / model 下拉直接来自当前 T3 Code 环境，不需要手动粘贴。功能：

- 四个默认 tier（`ui`、`code`、`fast`、`review`），可增删、改名、改 role。
- 每个 tier 可选：指定模型、复用另一个 tier、父线程 Review、继承父线程。
- provider / model / 强度下拉；支持 `sol6.1`、`deepseek-flash-claude`、`opus` 等别名一键填充。
- 自动载入 T3 Code live capabilities，并按 live 目录校验 provider、model 和选项值；右上角显示 `T3 Code · N providers`。
- 有项目配置时自动预载，右上角显示 `已载入项目配置`；没有配置时从默认表新建。
- 通过可选的本地桥接直接保存到项目；桥接不可达时显示 `本地桥接不可用`，改用复制或下载。
- 需要手动覆盖时，可在窗口内粘贴 JSON 或选择 capabilities 文件。
- 实时生成可复制的 `tiers:` 块；`仅输出改动` 模式只写与默认不同的 tier。
- 保存常用预设（浏览器 localStorage）；T3 inline 预览是沙箱 iframe，localStorage 通常不可用。桥接页面（`preview_open`）可直接保存；inline 回退需复制或下载。

打开流程：Skill 先调用 `orchestrator_capabilities`，把结果写入临时 JSON，在任意目录运行绝对路径脚本
`node <skill-dir>/scripts/build-tier-profile.mjs [--profile <project>/.t3-orca/tiers.yaml] <capabilities.json> [out.html]`（有项目配置时加 `--profile` 预载；省略 `out.html` 时默认写入安全的临时目录并输出路径，不改动目标项目文件）。
然后启动 `node <skill-dir>/scripts/tier-profile-bridge.mjs --project <config-base> --page <out.html> --ready-file <tmp>/ready.json`，保持长会话；用 `preview_open` 的 `environment-port` 打开返回的 `pageRoute`。**不要用 `html_render` 打开桥接页面**：T3 的 HTML 渲染器走 SOCKS 代理并拒绝 loopback，会显示 `本地桥接不可用`。
如果窗口右上角显示 `内置预填目录` 而不是 `T3 Code · N providers`，说明注入失败，可在
Capabilities 面板手动导入。`orchestrator_capabilities` 或 Node 不可用时，直接打开原始模板 `assets/tier-profile.html`；预览工具不可用时，给出文件绝对路径用浏览器打开。
说 `刷新 tier 窗口` 时会重新调用 `orchestrator_capabilities` 并重建窗口。

保存方式：

- 首选：在 `preview_open` 页面点 **保存到项目**，桥接直接写入项目配置；
- 回退：复制生成的 YAML 粘贴回聊天，或下载 `tiers.yaml`，由 agent 用 `save-tier-profile.mjs` 落盘。

桥接保存后 Skill 直接读取并校验；如果收到 YAML 或下载文件，则通过
`node <skill-dir>/scripts/save-tier-profile.mjs --project <config-base>` 写入 `.t3-orca/tiers.yaml`，并只复述一次最终 profile。也支持直接说
“code 用 cursor opus max”，或直接在消息开头贴简写：

```yaml
tiers:
  ui: sol6.1 @ high
  code: deepseek-flash-claude @ high
  fast: code @ low
  review: parent
```

- 没有全局配置；执行时只查项目配置。没贴 profile 且项目没有 `.t3-orca/tiers.yaml` 时才打开窗口；保存后不再追问，也不会每个 item 追问。
- 格式支持 `sol6.1 @ high`、`provider:model @ key=value`、`fast: code @ low` 复用、`inherit`、`default` 和展开写法。
- 模板在 [assets/tier-profile.template.yaml](assets/tier-profile.template.yaml)。

| Tier | 用途 | 自动解析目标 | 默认强度 |
|---|---|---|---|
| `ui` | UI、设计、视觉、交互 | `codex` / `gpt-6.1-sol`（sol6.1） | `reasoningEffort: high` |
| `code` | 纯代码、重构、bugfix、测试 | `magpie` / `dumate/deepseek-v41-flash[1m]`（Claude driver） | `effort: high` |
| `fast` | 机械修改、小测试改动 | 同上 | `effort: low` |
| `review` | 所有 Review | 父线程自己审，不委派（默认） | 无 |

以上是当前环境的默认目标；实际执行时仍会先读 `orchestrator_capabilities` 校验，ID 变化则按 `driverKind`/label 匹配并报告 substitution。

`review 循环` 预设的 reviewer 复用 `逐项开发` 的同一份 tier profile，读取其中的 `review` tier；不额外维护 reviewer 配置。profile 里指定了具体模型时使用该目标；值为 `parent` 时视为未设置，使用该预设默认的 `sol6.1 @ low`。

要调整默认 tier 映射，改 `references/tiered-delivery.md` 的 Tier table 即可；skill 仍会在运行时校验目标是否可用。

预设流程：

- 独立任务尽量并行；依赖任务串行。
- 默认父线程负责每个 item 的 Review；如果 tier profile 指定了 review target，则每轮用新的 review delegate。发现问题后用 `t3_thread_send` 交回原 child thread 修复。
- 修复后再次 Review；每个 item 最多 5 轮。仍有实质性问题则不提交。
- 单 item 通过测试和 Review 后，只提交该 item 的文件；不 Push、不建 PR。
- 默认父线程只发增量 findings，不重复整份 brief；不额外启动 review/test agent，减少 token。
- 目标从 `orchestrator_capabilities` 实时解析；不可用时报告 substitution，不静默换模型。

## 只读 Review 循环预设

当你说 `review 循环`、`review-loop`、`只读 Review 循环`，或者提出下面这类需求时，skill 套用这个预设：

> 派 sol-6.1 low 子代理只读 Review，你负责修复问题并验证，再次 Review，循环直到无实质性问题。忽略误报和纯风格建议，最多 5 轮，未通过则汇报阻塞原因。

等价于在 tier profile 里设置：

```yaml
tiers:
  review: sol6.1 @ low
```

`review 循环` 每轮都用这个 reviewer；profile 没设 `review` 时使用预设默认。

```text
$t3-orca review 循环 <scope>
```

流程：

1. 父线程先实现（如果改动还不存在），并跑一遍测试 / 构建确认基线。
2. 每轮新起一个只读 review 子代理，目标来自和 `逐项开发` 同一份 tier profile 的 `review` tier，解析顺序也相同（inline `tiers:` > 项目 `.t3-orca/tiers.yaml` > 没有项目配置时打开窗口并预填预设默认）。review 循环的预设默认是 `sol6.1 @ low`（`codex` / `gpt-6.1-sol`，`reasoningEffort: low`）。Brief 包含 repo 路径、base SHA、diff 命令、验收标准、测试结果和上一轮 findings。
3. 父线程 triage：实质问题自己修复并验证；误报用代码证据驳回；纯风格建议忽略，不改代码、不占轮次。
4. 修复后重跑测试，再新起一轮 review。不复用上一轮 reviewer，也不把修复交给 reviewer。
5. 某一轮没有实质问题且验证通过即完成。第 5 轮仍有实质问题就停下，汇报阻塞原因，不提交。
6. 只有你明确要求时才 commit；任何时候都不 push。

要点：

- reviewer 只读：不改文件、不 stage/commit/push、不跑有状态命令、不起子代理；父线程负责修复和验证。
- reviewer 用 `isolation: "shared"`，必须看到父线程未提交的修复；`worktree` 会漏掉这些改动。
- reviewer 目标就是项目 profile 的 `review` tier，和 `逐项开发` 用同一套解析；优先级：当前消息显式指定 > 项目 `.t3-orca/tiers.yaml` 的 `review` > 没有项目配置时打开窗口（预填 `sol6.1 @ low`）。`review: parent` 是逐项开发的值，在 review 循环里视为未设置，绝不改成父线程自审。
- 5 轮未通过时报告：未解决的 findings、每轮做了什么、为什么卡住、下一步选项；不静默加轮次。
- reviewer 目标不可用时报告 substitution，不静默换模型。

## 设计原则

- **运行时发现**：不在 skill 里写死 model ID，所有目标来自 `orchestrator_capabilities`。
- **能力优先**：按任务需要的推理、上下文、速度、成本、工具能力选模型，不按品牌猜。
- **子任务自包含**：子 agent 没有父线程历史，brief 必须包含目标、上下文、约束、交付物和验证方式。
- **异步不轮询**：异步子任务完成后会唤醒父线程；启动后结束当前回合，不 sleep、不轮询。
- **显式失败**：provider/model 不可用就报告，不静默降级到 native subagent、workflow 或 CLI。
- **审查隔离**：默认 review/re-check 新建 `delegate_task`，高风险审查尽量换 provider 或模型家族；`逐项开发` 默认父线程自审并回原 Thread 修复，也可在 tier profile 指定 review delegate；`review 循环` 始终用独立只读 reviewer，父线程负责修复和验证，每轮新建 reviewer。

## 结构

```text
t3-orca/
|-- SKILL.md
|-- agents/openai.yaml
|-- assets/
|   |-- tier-profile.html
|   `-- tier-profile.template.yaml
|-- scripts/
|   |-- build-tier-profile.mjs
|   |-- save-tier-profile.mjs
|   `-- tier-profile-bridge.mjs
|-- references/
|   |-- orchestrator-v2.md
|   |-- routing.md
|   |-- tiered-delivery.md
|   |-- review-loop.md
|   |-- tier-profile.md
|   `-- patterns.md
`-- README.md
```

## 参考

- `references/orchestrator-v2.md`：Orchestrator V2 工具契约与字段语义。
- `references/routing.md`：能力信号、候选评分和路由示例。
- `references/tiered-delivery.md`：逐项开发预设的 tier 解析、Review 循环、5 轮上限和逐项提交规则。
- `references/review-loop.md`：只读 Review 循环预设的 reviewer 解析、read-only 契约、父线程修复验证、triage、5 轮上限和阻塞报告。
- `references/tier-profile.md`：项目级 `.t3-orca/tiers.yaml`、Tier Profile 窗口预载、保存和校验规则。
- `scripts/build-tier-profile.mjs`：把 `orchestrator_capabilities` 注入 Tier Profile 窗口，生成临时 HTML。
- `scripts/save-tier-profile.mjs`：把窗口生成的 YAML 原子写入 `<project>/.t3-orca/tiers.yaml`。
- `scripts/tier-profile-bridge.mjs`：临时 loopback 桥接，服务配置页并让 **保存到项目** 直接原子写入项目配置。
- `references/patterns.md`：fan-out、pipeline、review loop、worktree、escalation 和 brief 模板。
