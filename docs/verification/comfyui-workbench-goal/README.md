---
文档用途: 记录 ComfyUI 工作台最小 Goal 接入的验收结果和未通过项。
读取时机: 评估 Goal 接入是否可以提交，或继续处理验收未通过项时。
---

# ComfyUI 工作台 Goal 接入验收

## 1. 产物与结论

1. 产品改动位于[共享组合](../../../agent-presets/shared/agent.cordis.yml)与[工作台 persona](../../../agent-presets/harness-comfyui-cli-candidate/agent.cordis.yml)。组件、工具和状态生命周期沿用宿主实现；实施范围见[接入方案](../../plans/comfyui-workbench-goal-20261028.md)。
2. 当前候选已通过独立代码审阅、文字审计和 Goal 验收。用户已批准合入与生产 Desktop 部署，并批准第 4 节的两项失败作为门禁例外。

## 2. 开发环境与真实模型验收

1. Goal 验收使用 `lan-gpt/gpt-6.1-sol`，协议为 `openai-completions`，推理级别为 `high`。[配置记录](lan-gpt-final/configuration.json)保存了当时的模型配置、凭据来源和已安装 persona 与源码的比对结果。当前共享开发配置见第 7 节。
2. [真实模型结果](lan-gpt-final/result.json)中的 3 个场景均通过。普通请求结束后未创建 Goal。在材料清单场景中，主 Agent 等待子代理返回，再在 Goal 自动轮次中将目标标记为完成。在缺少生成输入的场景中，Agent 在用户请求触发的轮次中将目标标记为阻塞。
3. 两个 Goal 请求均省略了用户未指定的轮次上限，宿主采用默认的 256 轮。主子会话的请求记录均为 `gpt-6.1-sol`、`high`，全部会话自然结束，工具错误为 0 次。
4. [普通请求](lan-gpt-final/ordinary/trace-index.json)、[主子任务](lan-gpt-final/goal/trace-index.json)和[缺少输入请求](lan-gpt-final/blocked/trace-index.json)保留了完整持久会话事件。索引另行标明宿主未保存的原始模型请求和原始流。

## 3. 仓库与 Desktop 验收

1. [最终门禁记录](shared-development/quality.txt)使用 `VITEST_MAX_WORKERS=2 pnpm quality`：1,935 项非 Desktop 测试通过；Desktop 304 项通过、2 项失败。
2. [Goal 受控记录](lan-gpt-final/controlled-desktop/official-business-goal.json)验证 GoalBar、子任务等待、自动完成、暂停与恢复，以及轮次耗尽。
3. [暂停与生成记录](lan-gpt-final/controlled-desktop/official-business-goal-pause-run.json)显示：Goal 暂停后，已接纳的 Run 从 `remote_pending` 转为 `succeeded`，并产生媒体。
4. [重启前记录](lan-gpt-final/controlled-desktop/official-business-goal-before-restart.json)与[重启后记录](lan-gpt-final/controlled-desktop/official-business-goal-after-restart.json)验证重启后目标 ID、修订号和轮次计数保持一致。恢复前目标为 `disarmed`；用户恢复后，Agent 读取原 Run 参数和媒体，并完成目标。

## 4. 提交未通过项

1. [Desktop 失败记录](lan-gpt-final/controlled-desktop/official-business-failure.json)显示：已结束子会话的 Skill 列表返回 Office Skill，测试预期为工作台 Skill。
2. [未改动基准的结果](baseline-failure.json)在同一宿主版本上复现了该失败，基准提交为 `d50af91b4205809e2dc307edcc59b8f3ecfde469`。
3. 生命周期测试在停止重启后的应用时报告 [`PROCESS_IDENTITY_CHANGED`](shared-development/lifecycle-stop/cleanup-failure.json)。[停止请求](shared-development/lifecycle-stop/stop-request.json)与[清理结果](shared-development/lifecycle-stop/stop-result.json)显示：后续清理已确认应用停止、端口释放。身份变化的原因尚未确定。

## 5. 对照证据

1. [OpenRouter 模型记录](real-model-result.json)显示，当时的测试使用了 `thinkingmachines/inkling:free`。模型填写了用户未指定的轮次上限。第 2 个 Goal 自动轮次中的阻塞调用未达到连续 3 轮门槛，宿主拒绝了该调用。
2. [`gpt-6.1-sol` 的 Responses 协议记录](lan-gpt-responses/result.json)出现未请求的轮次上限和多余状态参数。[独立参数测试](lan-gpt-responses/protocol-contract.json)显示，两种协议都接受省略可选轮次字段的调用。现有证据尚未确定完整场景中参数差异的原因。
3. [权限规则补齐前的 Chat Completions 记录](lan-gpt-completions/result.json)显示：子代理通知轮尝试完成 Goal，宿主拒绝该调用；后续自动轮次完成目标。

## 6. 环境清理

1. [真实模型实例清理结果](lan-gpt-final/cleanup.json)确认测试实例已停止，3 个端口均无监听进程。
2. [门禁结束后的核对结果](shared-development/quality-cleanup.json)记录了本轮进程组和端口的释放情况。独立开发环境保留模型配置、会话和插件数据。

## 7. 跨 worktree 开发配置

1. [开发配置](../../../config/desktop-e2e.json)定义持久环境首次启动时的模型默认值。[凭据示例](../../../.env.example)声明共享密钥名称。已有 Profile 保留用户保存的模型设置。
2. 主 checkout `.env` 已保存 `LAN_GPT_API_KEY`，文件权限为 `0600`。当前开发 worktree 已移除同名宿主凭据记录；凭据读取规则见[交互调试规范](../../agents/worktree-development.md#交互调试)。
3. [配置核对结果](shared-development/configuration.json)记录了两个 worktree 的模型设置与凭据来源。第二个 worktree 从空白 Profile 启动，重启后保留模型选择和会话。
4. [当前 worktree 请求](shared-development/current-worktree/trace-index.json)与[第二个 worktree 请求](shared-development/new-worktree/trace-index.json)均完成真实模型调用。两个请求都使用 `gpt-6.1-sol`、`high`，并返回“共享开发模型可用”。
5. [定向测试记录](shared-development/focused-tests.txt)包含 81 项通过的测试。[清理记录](shared-development/cleanup.json)记录了本轮应用进程和端口的释放结果。
