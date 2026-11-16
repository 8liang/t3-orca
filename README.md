# T3 ORCA

T3 Code 的 **Orchestrator V2 能力路由 skill**。它把任务拆成子任务，先用 `orchestrator_capabilities` 读取当前环境真实可用的 provider、model 和选项，再用 `delegate_task` 把每个子任务交给最匹配的子 agent。

ORCA = **Orchestrator Routing & Capability Assignment**。

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

每次的模型 tier 不同，不用再手打 `provider:model:effort`。Skill 会在第一次需要时打开一个交互式
Tier Profile 窗口，也可以随时说 `打开 tier 窗口` 重新打开：

[assets/tier-profile.html](assets/tier-profile.html)

窗口是单文件、离线可用的 HTML，T3 Code 里由 `html_preview` / `html_render` 直接渲染，也可以双击用浏览器打开。功能：

- 四个默认 tier（`ui`、`code`、`fast`、`review`），可增删、改名、改 role。
- 每个 tier 可选：指定模型、复用另一个 tier、父线程 Review、继承父线程。
- provider / model / 强度下拉；支持 `sol6.1`、`deepseek-flash-claude`、`opus` 等别名一键填充。
- 可选导入 `orchestrator_capabilities` 的 JSON，按 live 目录校验 provider、model 和选项值。
- 实时生成可复制的 `tiers:` 块；`仅输出改动` 模式只写与默认不同的 tier。
- 保存常用预设（浏览器 localStorage），下次打开自动恢复上次编辑。

返回方式二选一：

- 复制生成的 YAML，粘贴回聊天；
- 下载 `tiers.yaml`，放到项目根目录的 `.t3-orca/tiers.yaml`（项目级复用）或 `~/.config/t3-orca/tiers.yaml`（全局复用）。

Skill 收到后仍会用 live capabilities 校验，并只复述一次最终 profile。也支持直接说
“code 用 cursor opus max”，或直接在消息开头贴简写：

```yaml
tiers:
  ui: sol6.1 @ high
  code: deepseek-flash-claude @ high
  fast: code @ low
  review: parent
```

- 没贴 profile 且没有配置文件时，才打开窗口；不会每个 item 追问。
- 格式支持 `sol6.1 @ high`、`provider:model @ key=value`、`fast: code @ low` 复用、`inherit`、`default` 和展开写法。
- 模板在 [assets/tier-profile.template.yaml](assets/tier-profile.template.yaml)。

| Tier | 用途 | 自动解析目标 | 默认强度 |
|---|---|---|---|
| `ui` | UI、设计、视觉、交互 | `codex` / `gpt-6.1-sol`（sol6.1） | `reasoningEffort: high` |
| `code` | 纯代码、重构、bugfix、测试 | `magpie` / `dumate/deepseek-v41-flash[1m]`（Claude driver） | `effort: high` |
| `fast` | 机械修改、小测试改动 | 同上 | `effort: low` |
| `review` | 所有 Review | 父线程自己审，不委派（默认） | 无 |

以上是当前环境的默认目标；实际执行时仍会先读 `orchestrator_capabilities` 校验，ID 变化则按 `driverKind`/label 匹配并报告 substitution。

要调整默认 tier 映射，改 `references/tiered-delivery.md` 的 Tier table 即可；skill 仍会在运行时校验目标是否可用。

预设流程：

- 独立任务尽量并行；依赖任务串行。
- 默认父线程负责每个 item 的 Review；如果 tier profile 指定了 review target，则每轮用新的 review delegate。发现问题后用 `t3_thread_send` 交回原 child thread 修复。
- 修复后再次 Review；每个 item 最多 5 轮。仍有实质性问题则不提交。
- 单 item 通过测试和 Review 后，只提交该 item 的文件；不 Push、不建 PR。
- 默认父线程只发增量 findings，不重复整份 brief；不额外启动 review/test agent，减少 token。
- 目标从 `orchestrator_capabilities` 实时解析；不可用时报告 substitution，不静默换模型。

## 设计原则

- **运行时发现**：不在 skill 里写死 model ID，所有目标来自 `orchestrator_capabilities`。
- **能力优先**：按任务需要的推理、上下文、速度、成本、工具能力选模型，不按品牌猜。
- **子任务自包含**：子 agent 没有父线程历史，brief 必须包含目标、上下文、约束、交付物和验证方式。
- **异步不轮询**：异步子任务完成后会唤醒父线程；启动后结束当前回合，不 sleep、不轮询。
- **显式失败**：provider/model 不可用就报告，不静默降级到 native subagent、workflow 或 CLI。
- **审查隔离**：默认 review/re-check 新建 `delegate_task`，高风险审查尽量换 provider 或模型家族；`逐项开发` 预设默认由父线程自审并回原 Thread 修复，也可在 tier profile 指定 review delegate。

## 结构

```text
t3-orca/
|-- SKILL.md
|-- agents/openai.yaml
|-- assets/
|   |-- tier-profile.html
|   `-- tier-profile.template.yaml
|-- references/
|   |-- orchestrator-v2.md
|   |-- routing.md
|   |-- tiered-delivery.md
|   |-- tier-profile.md
|   `-- patterns.md
`-- README.md
```

## 参考

- `references/orchestrator-v2.md`：Orchestrator V2 工具契约与字段语义。
- `references/routing.md`：能力信号、候选评分和路由示例。
- `references/tiered-delivery.md`：逐项开发预设的 tier 解析、Review 循环、5 轮上限和逐项提交规则。
- `references/tier-profile.md`：Tier Profile 窗口、每次会话的 `tiers:` 覆盖、配置优先级和校验规则。
- `references/patterns.md`：fan-out、pipeline、review loop、worktree、escalation 和 brief 模板。
