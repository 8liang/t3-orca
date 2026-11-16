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

## 设计原则

- **运行时发现**：不在 skill 里写死 model ID，所有目标来自 `orchestrator_capabilities`。
- **能力优先**：按任务需要的推理、上下文、速度、成本、工具能力选模型，不按品牌猜。
- **子任务自包含**：子 agent 没有父线程历史，brief 必须包含目标、上下文、约束、交付物和验证方式。
- **异步不轮询**：异步子任务完成后会唤醒父线程；启动后结束当前回合，不 sleep、不轮询。
- **显式失败**：provider/model 不可用就报告，不静默降级到 native subagent、workflow 或 CLI。
- **审查隔离**：review/re-check 每次新建 `delegate_task`，高风险审查尽量换 provider 或模型家族。

## 结构

```text
t3-orca/
|-- SKILL.md
|-- agents/openai.yaml
|-- references/
|   |-- orchestrator-v2.md
|   |-- routing.md
|   `-- patterns.md
`-- README.md
```

## 参考

- `references/orchestrator-v2.md`：Orchestrator V2 工具契约与字段语义。
- `references/routing.md`：能力信号、候选评分和路由示例。
- `references/patterns.md`：fan-out、pipeline、review loop、worktree、escalation 和 brief 模板。
