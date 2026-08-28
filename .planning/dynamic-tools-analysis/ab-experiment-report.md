# B 实现与 A/B 真实模型调用对比报告

## 对比结论

B=`harness-comfyui-tool-canary` 已在当前独立 worktree 中实现并通过真实 Harness Host 装载。对于三个输入合同完整的配对运行，A 与 B 都完成任务并选择相同的必要 Tool；B 的总输入 token 从 61,012 降至 23,138，下降 62.1%，Turn 总时长从 60.576 秒降至 22.399 秒，下降 63.0%，输出 token 从 996 变为 973，下降 2.3%。实例查询的 B→A 反向重复仍得到相同方向，因此前两次 A→B 顺序不能单独解释该差异。

本次结果支持结构符合性结论：B 的 Skill catalog 与 A 相同，B 实际成功读取了全局 `comfyui-generate`，并保留 5 个项目 Tool；本次 3 组输入合同完整的配对运行中，B 的请求前缀和 total input 均小于 A。该结构符合文章关于“保持必要能力、减少无关 Tool schema”的核心原则，但 A/B 同时改变了整个 Agent Preset composition，不能据此隔离 Tool schema 的独立因果贡献。结果只支持继续保留 B canary，不支持切换生产默认，也不支持实现或发布 C。

## 实验 Interface

| 项目 | A | B |
| --- | --- | --- |
| Preset | `standard` | `harness-comfyui-tool-canary` |
| Provider | `opencode-go` | `opencode-go` |
| Model | `deepseek-v4-flash` | `deepseek-v4-flash` |
| Workspace | `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness` | 同 A |
| Skill roots | Harness 默认项目与用户全局 roots | 同 A |
| 项目 Tool | 5 个 Host 全局项目 Tool | 同 A |
| Tool presentation | `native` | `native` |

A 与 B 的实际 `skill-catalog` 都包含以下 7 个 Skill：

1. `anima-prompt-builder`
2. `character-portrait-prompt-designer`
3. `comfyui-generate`
4. `krea2-anime-prompt-skill`
5. `skill-creator`
6. `wai-sdxl-prompt-builder`
7. `writing-for-agents`

## 实际请求 Tool snapshot

| 指标 | A | B | A→B |
| --- | ---: | ---: | ---: |
| Tool 数量 | 30 | 7 | -76.7% |
| serialized Tool JSON 字节 | 30,022 | 7,458 | -75.2% |
| system prompt UTF-8 字节 | 6,436 | 1,996 | -69.0% |

B 的 7 个 Tool 是：

```text
bash
generate_with_comfyui
query_semantic_comfyui_instances
query_semantic_comfyui_templates
query_semantic_generation_models
query_semantic_loras
skill
```

B 没有注入 `standard` 的 filesystem、search、jobs、goal、plan、delegation、todo、web 和 ask-user Tool。B 仍保留用户指定的 5 个项目 Tool；本次实验没有实现 C 或把项目能力替换为 CLI。

## 真实模型运行记录

`total input` 定义为 Harness Session 事件中全部 `assistant/message.data.usage.inputTokens + cacheReadTokens`。`duration` 使用同一 Session 的 `turn/start.time` 到 `turn/end.time`。全部 8 个 Session 都记录 `provider=opencode-go`、`model=deepseek-v4-flash` 和 `turnEnd=completed`。

| 任务 | Arm | Session | Tool calls | Steps | uncached input | cache read | total input | output | duration |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| T1 全局 Skill 读取 | A | `session-114a557a-e67d-482d-892c-dee3feb5c966` | `skill` | 2 | 11,926 | 9,728 | 21,654 | 576 | 13.641s |
| T1 全局 Skill 读取 | B | `session-984229e9-e1a3-4495-b6e7-f03a03f45cc9` | `skill` | 2 | 5,705 | 3,328 | 9,033 | 579 | 9.541s |
| T2 实例查询，A→B | A | `session-3cb71cc1-50d7-492c-a7c1-21ef36b2c2cd` | `query_semantic_comfyui_instances` | 2 | 9,918 | 9,728 | 19,646 | 166 | 33.912s |
| T2 实例查询，A→B | B | `session-6a072fbd-4e5a-4e26-a743-e93f6e405625` | `query_semantic_comfyui_instances` | 2 | 1,169 | 5,888 | 7,057 | 202 | 5.963s |
| T3 缺少 model id 的边界输入 | A | `session-70adc1f3-8090-4738-98d4-e0a6b61753a3` | 实例 1 次、模板 2 次、模型 4 次 | 5 | 2,102 | 63,232 | 65,334 | 7,355 | 148.358s |
| T3 缺少 model id 的边界输入 | B | `session-281b8c5d-5c99-4a2e-be4c-d28c15102ca0` | 无 | 1 | 3,430 | 0 | 3,430 | 11,095 | 153.883s |
| T2 实例查询，B→A | B | `session-428818e0-de7c-49e9-a43a-ab62db3eeb52` | `query_semantic_comfyui_instances` | 2 | 3,464 | 3,584 | 7,048 | 192 | 6.895s |
| T2 实例查询，B→A | A | `session-0eeeba2d-d084-42a2-962a-eda9016d7ac2` | `query_semantic_comfyui_instances` | 2 | 256 | 19,456 | 19,712 | 254 | 13.023s |

### T1：读取全局 `comfyui-generate`

A 与 B 都只调用一次 `skill`，都正确给出以下 5 个项目 Tool 的同一顺序：模板、生成模型、LoRA、实例、生成。本次运行证明 B 能发现并读取全局 `comfyui-generate`；本次运行没有逐一执行 catalog 中其他 6 个全局 Skill。

### T2：查询 ComfyUI 实例

A 与 B 的三次运行都只调用一次 `query_semantic_comfyui_instances`，都返回实例总数 1 和 instance id `2`。首次 A→B 与反向 B→A 都显示 B 使用约 7K total input，A 使用约 19.7K total input。

### T3：缺少 generation-model id 的边界输入

`query_semantic_generation_models.id` 的 Tool schema 明确要求 id 来自当前消息上下文；T3 没有提供任何候选 id。因此 T3 不能与 T1/T2 一起计算任务成功率。

A 先调用实例查询，又猜测模板 id 和模型 id。A 最终返回 3 个可用模型，但执行了 7 次 Tool call，其中 3 次 Catalog 查询失败，并违反“只调用必要 Tool”和“id 来自当前消息上下文”的约束。

B 没有调用 Tool，并明确指出输入缺少候选 model id，拒绝编造 id。B 遵守 Tool schema 与调用约束，但没有返回用户要求的模型列表；长 reasoning 使 B 的 output token 达到 11,095，Turn 时长也没有优于 A。A/B 同时改变了通用 Tool 定义集合、system instruction 和 Agent Preset composition，因此本实验只能确认 B 的整体 composition 在本次 T1/T2 运行中记录到更少输入，不能把 token 或时延差异单独归因于 Tool schema 数量。该 composition 也不能独自解决业务输入不完整、reasoning 失控或输出 token 上升问题。

## 实现与运行门禁

- worktree Host 的 `pnpm worktree:status` 返回 `running`。
- `pnpm worktree:health` 返回 `passed`，包含 process、source runtime、Harness Web、Client bundle、Run Repository、API Workflow cache 与 saved media。
- 实际 Preset roster 显示 `ComfyUI Tool 对照模式`，且 Preset 能建立真实 Session。
- B Session 的 durable `agent-preset/selected` 事件记录 `harness-comfyui-tool-canary`。
- 实验结束后执行 `pnpm worktree:stop`，随后 `pnpm worktree:status` 返回 `stopped`。

## 晋级判断

当前判断是：**B canary 实现 GO；生产默认切换 NO-GO。**

B 已证明以下能力：

- 项目自有 Preset 能在 rc.2 Host 中真实装载；
- B 与 A 的 Skill catalog 相同，B 实际成功读取了全局 `comfyui-generate`，并实际调用了项目实例查询 Tool；
- B 的模型 Tool Interface 从 30 个缩到 7 个；
- 输入合同完整的 3 次配对运行全部与 A 得到等价业务结果；
- 这 3 次运行的 total input 与 Turn 时长分别下降 62.1% 和 63.0%。

本次实验没有证明以下事项：

- 多轮 Session、compaction 后和 Skill catalog 变化后的 Tool snapshot 稳定性；
- 真实 `generate_with_comfyui` 提交、Run link、媒体展示和错误恢复；
- 大样本任务成功率与统计显著性；
- KV-cache 命中率、cache write、模型计费成本或缓存收益的独立因果变化；
- 其他 Provider、Model、Workspace 或 Catalog 数据下的效果；
- C=`项目 Preset + CLI + 0 个项目 Tool` 的可行性或效果；
- B 可以替换 production default。

## 已获得的授权

- 用户授权在当前独立 worktree 中实现 B。
- 用户授权使用 worktree `.env` 已配置的 `opencode-go` Provider 和 `deepseek-v4-flash` Model 发起真实模型调用。
- 用户指定默认 Workspace 与 Harness 全局 Skill 目录作为 A/B 共同输入。

## 非本次目标

- 不实现 C、项目 CLI 或零项目 Tool Interface。
- 不删除、重命名或修改 5 个项目 Tool。
- 不修改 `.agents/skills/` 中的现有 Skill。
- 不修改 production default、production DSH home 或生产源码 checkout。
- 不发布版本或部署生产环境。
