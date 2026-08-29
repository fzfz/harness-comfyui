# A/B 真实模型调用报告

## 对比结论

B 符合本次假设：它没有向模型请求注入 5 个 Host 项目 Tool schema，但保留了完整的全局 Skill → 参考文档 → shell → 项目 CLI 路径。3 个 A Session 与 3 个 B Session 全部正确 resolve 模板 39 和生成模型 3，全部得到 `base_model_id = "1"`，全部正确判定兼容，全部未调用 Generation submit。

本次样本支持继续保留 B 作为候选 Preset，不支持直接切换生产默认值。模型输出存在随机性，3 次配对结果只能证明本任务集未出现功能退化，并提供当前 Provider 下的成本信号。

## 固定测试条件

- Workspace：`/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness`
- Provider/Model：`opencode-go/deepseek-v4-flash`
- Skill 根目录：`/Users/fzfz/.agents/skills`
- Skill：两组使用同一 `comfyui-generate`
- Prompt：两组使用相同的兼容性核对文本、模板上下文 39 和生成模型上下文 3
- A：`harness-comfyui-schema-control`
- B：`harness-comfyui-cli-candidate`

## 兼容性任务结果

| Session | 组 | Tool schema | 总输入 token | 输出 token | 耗时 | 结果 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `ea93fa23-e676-4c76-9cf3-c5bd4b24a8d8` | B | 2 | 14,315 | 996 | 8.069 s | 正确；Catalog resolve CLI 2 次，Generation submit 0 次 |
| `72685dc3-81a0-42cd-9f98-fae516d7179c` | A | 7 | 18,889 | 1,112 | 10.164 s | 正确；Catalog resolve CLI 2 次，Generation submit 0 次 |
| `fc12efd6-42e7-4f31-aa0d-cde0648c83ea` | A | 7 | 16,976 | 852 | 10.123 s | 正确；Catalog resolve CLI 2 次，Generation submit 0 次 |
| `b27463d3-0630-4d21-b57b-194aac3c1b9e` | B | 2 | 14,285 | 930 | 10.022 s | 正确；Catalog resolve CLI 2 次，Generation submit 0 次 |
| `ddcdd7b5-1bcb-4800-8fc8-b41be4d10d42` | B | 2 | 14,148 | 732 | 7.004 s | 正确；Catalog resolve CLI 2 次，Generation submit 0 次 |
| `52cf0ced-f476-4fd9-baf9-2640f3562777` | A | 7 | 18,002 | 1,009 | 14.451 s | 正确；Catalog resolve CLI 2 次，Generation submit 0 次 |

`总输入 token = inputTokens + cacheReadTokens`。A 平均总输入为 17,956，B 为 14,249；B 低 20.6%。A 平均耗时为 11.579 秒，B 为 8.365 秒；B 低 27.8%。A 平均输出为 991，B 为 886。输出和耗时包含模型路径差异，不能单独归因于 schema。

A 的 serialized `tools` JSON 是 7,458 bytes；B 是 3,401 bytes，减少 4,057 bytes，即 54.4%。这是直接由 Preset visibility 产生的确定性差异。

## 真实生成提交与数据库证据

B 回归 Session `session-62ade0ce-3051-4a89-a215-1e5bda92f6ee` 的模型请求只含 `bash` 与 `skill`。模型读取两份 CLI 参考文档，resolve 模板 39，从实例目录取得 `instance_id = "2"`，建立一个 title 固定为“完全相同请求重复提交”的 Generation Request，并通过两个独立前台 Bash Tool Call 提交逐字段完全相同的 JSON。两次 CLI 调用均返回不同的 `run_id`。

| 提交 | `run_id` | `call_id` | `prompt_id` | 最终状态 |
| --- | --- | --- | --- | --- |
| 1 | `run_16cef8d9-8585-44e2-a9b9-a9dd9322b8bd` | `call_cbd223b78aa84770b6c3b0a6` | `ebdac911-dad5-48d3-b1c7-716f2b7cbe8d` | `succeeded` |
| 2 | `run_84215fd5-d9a9-47bc-baee-1b770a7c947e` | `call_9849de4cdfd6496b9f8b5ef2` | `91bb208c-4a43-4ccc-bbfd-660c50caae92` | `succeeded` |

两个 Run 的数据库记录均保存 `workspace_id = "83eeed16-43fb-4d1f-99b1-dd15bbbde4c3"`、上述 Session ID、`turn = 1`、`instance_id = "2"` 和模板 39。SQLite 聚合结果为 2 条 Run、1 个 distinct `request_json`、2 个 distinct `call_id` 和 2 个 distinct `run_id`。模型提交的 JSON 不含 Workspace、Session、Turn 或 Tool Call ID；Host capability 和 workspace registry 为每次 shell Tool Call 提供数据库身份。

| `run_id` | 媒体文件 | 类型 | 字节数 |
| --- | --- | --- | ---: |
| `run_16cef8d9-8585-44e2-a9b9-a9dd9322b8bd` | `2026-08-29-152800_anima-aesthetic-v1.1_123456.png` | `image/png` | 400,347 |
| `run_84215fd5-d9a9-47bc-baee-1b770a7c947e` | `2026-08-29-152801_anima-aesthetic-v1.1_123456.png` | `image/png` | 400,347 |

Client 最终显示 2 个已完成 Run 和 2 个媒体；两个保存文件都能作为 512×512 PNG 打开。

## 排除项

- 选择生成模型 3 的首次生成 Session 触发了 `anima-prompt-builder`，在 submit 前累计约 192K 输入与 10.4K 输出后被终止。该 Session 改变了 Prompt Skill 变量，不进入 A/B 统计。
- 远端实例恢复前的 B 生成 Session 曾产生 `COMFYUI_CONNECTION_FAILED`。失败提交可能已经持久化 Run，且同一个 Generation Request 可以再次独立提交；这些环境失败结果不进入兼容性 A/B 统计。
- Session `session-7c3b2178-dc6f-4431-8ac3-8a65496a4a85` 成功生成两个 Run，但模型把两个 `title` 分别改为“提交1”和“提交2”，因此两个 `request_json` 不同；该 Session 不作为“同一个 Generation Request 重复提交”的证据。
- 旧 `harness-comfyui-tool-canary` Session 和旧 resolver-Tool 用例的结论全部无效，不进入本报告。

## 验收清单

- [x] 使用真实 `opencode-go/deepseek-v4-flash`。
- [x] A/B 使用相同 Prompt、Workspace 和全局 Skill。
- [x] B 的模型请求为 0 个 Host 项目 Tool schema。
- [x] 两组实际读取 Skill 参考文档并调用项目 CLI。
- [x] SQLite 证明身份字段来自当前 shell execution。
- [x] 同一个 Generation Request 的两次独立提交均返回不同 `run_id`。
- [x] 两个 Run 均由远端 ComfyUI 完成并保存媒体。

## 非本次目标

- 本报告不根据一次成功回归证明远端 ComfyUI 的长期可用性。
- 本报告不批准生产默认切换或删除 5 个 Host Tool。
- 本报告不把停止的 Prompt-Skill Session 当成 B 的性能结果。

## 已获得的授权

用户授权独立 worktree、真实 Provider 调用、默认 Workspace 和全局 Skill 路径。本报告没有执行发布、部署或推送。
