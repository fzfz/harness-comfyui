---
文档用途: 记录独立 ComfyUI Skill 的实例验收、CLI 回归结果及交付检查证据位置。
读取时机: 使用交付的 Skill 或复核测试证据时。
---

# ComfyUI 工作流 Skill 验收记录

## 1. 当前交付

1. [Skill 目录](../../standalone-skills/comfyui-workflow-builder/)包含 `SKILL.md` 和 `scripts/comfyui.mjs`。四个独立 Agent 在仓库外使用该目录副本完成任务。
2. 实测环境为 `192.168.110.122:8188`，ComfyUI `0.42.0`、前端 `1.55.18`、Node.js `25.8.2`、Chrome `155.0.8059.85`。本次新增第三方依赖数量为 `0`。
3. 四个用例的工作流与实际图片均已通过独立复核。用户尚未确认图片是否满足偏好要求。CLI 回归结果见第 3 节，最终代码审查与仓库门禁记录见第 4 节。

## 2. 实例用例结果

1. 每个用例均由干净上下文的独立 Agent 执行。执行期间没有追加解题提示。独立审阅 Agent 核对了调用记录、工作流与实际图片。

| 用例 | 实际结果 | 提交次数 | 交付与证据 |
| --- | --- | --- | --- |
| MOSS 多 LoRA | 一个加载节点保留加速 LoRA，并分别启停两个指定 LoRA；四种状态均生成 1024×1024 图片，保存重载后顺序、强度和开关一致。 | 6 次，其中 1 次失败、5 次成功。 | [逐项结果](../../.local/workflow-builder-development/acceptance/case-1/results.json)、[最终 UI](../../.local/workflow-builder-development/acceptance/case-1/deliverables/final-ui.json)、[最终 API](../../.local/workflow-builder-development/acceptance/case-1/deliverables/final-api.json)、[共同启用图片](../../.local/workflow-builder-development/acceptance/case-1/deliverables/images/both.png)。 |
| Anima 两阶段生成 | 从零生成水彩白兔、蓝茶壶和两株绿色盆栽；512×512 放大并再采样至 768×768，主体与相对位置保留。 | 1 次。 | [逐项结果](../../.local/workflow-builder-development/acceptance/case-2/results.json)、[最终 UI](../../.local/workflow-builder-development/acceptance/case-2/workflow.json)、[最终 API](../../.local/workflow-builder-development/acceptance/case-2/api.json)、[放大图片](../../.local/workflow-builder-development/acceptance/case-2/stage2-768.png)。 |
| 图像与遮罩组合 | 官方节点与 `ImageFlip+` 完成合成、最近邻缩放、批处理和双路保存；3 张输出均为 256×128，顺序正确，各输出图片与用例预期图片的逐像素差异均为 0。 | 1 次。 | [逐项结果](../../.local/workflow-builder-development/acceptance/case-3/results.json)、[最终 UI](../../.local/workflow-builder-development/acceptance/case-3/workflow.ui.json)、[最终 API](../../.local/workflow-builder-development/acceptance/case-3/workflow.api.json)、[像素结果](../../.local/workflow-builder-development/acceptance/case-3/evidence/output-pixels.json)。 |
| 文字修正 | 先观察错误图片，再调整提示词；三个目标文本各出现一次，黑板、木框、暖光和咖啡杯粉笔画保留。 | 2 次。 | [逐项结果](../../.local/workflow-builder-development/acceptance/case-4/results.json)、[最终 UI](../../.local/workflow-builder-development/acceptance/case-4/final.workflow.json)、[最终 API](../../.local/workflow-builder-development/acceptance/case-4/final.api.json)、[最终图片](../../.local/workflow-builder-development/acceptance/case-4/final.png)。 |

2. 原始工具调用及返回保存在[轨迹目录](../../.local/workflow-builder-development/traces/)。完整用例证据已复制到当前 worktree 的 `.local/workflow-builder-development/acceptance/`。这些运行文件保留在本机，Git 不跟踪该目录。
3. MOSS 首次失败的 history 记录了 BF16 文件超出文件末尾的读取错误。使用实例已有 INT8 模型后生成成功。一次前端导出超时在增加等待时间后恢复；控制台日志未被工具保存，具体超时原因仍缺少证据。
4. 子目录图片复测提交 1 次，任务 ID 为 `7cb100f7-08af-40bc-b72e-807063f6fff1`。3 张图片均为 256×128，批次顺序正确，各输出图片与用例预期图片的逐像素差异均为 0。工作流保留 `workflow-builder-retest-20261022` 子目录引用。证据见[复测结果](../../.local/workflow-builder-development/retest-case-3/results.json)与[像素核验](../../.local/workflow-builder-development/retest-case-3/evidence/pixel-verification.json)。
5. 子目录复测首次导出的工作流经前端重载后，两个图片加载节点的高度发生变化。采用重载后的工作流再次导出，节点、连接和执行参数均与再次重载后的结果一致。差异见[重载比较](../../.local/workflow-builder-development/retest-case-3/evidence/export-comparison.json)。
6. 已核对 14 次前端导出的进程、端口和临时 Profile，均已释放。证据见[浏览器清理记录](../../.local/workflow-builder-development/browser-cleanup-verification.json)。

## 3. CLI 回归结果

1. [CLI 测试](../../standalone-skills/tests/comfyui.test.mjs)覆盖 16 项场景，全部通过，无跳过项。严格 JavaScript 类型检查通过。命令输出见[回归日志](../../.local/workflow-builder-development/cli-final-20261022.log)。

| 验证条件 | 通过结果 |
| --- | --- |
| 参数值由实例校验 | 子目录图片通过提交；实例拒绝无效文件时，CLI 保存具体节点错误。 |
| 导出与提交前的连接校验 | 不存在的源节点、错误长度、非整数槽位及越界槽位返回具体错误；拒绝后提交次数为 0。 |
| HTTP 诊断与认证剔除 | JSON、文本和图片下载错误保留状态码、请求路径及响应正文；含引号和反斜杠的认证值被剔除。 |
| 超时后查询恢复 | 成功查询清除当前记录中的过期错误；原失败调用的记录保留，重提次数为 0。 |
| 前端重载与资源释放 | 普通工作流与多 LoRA 工作流的控件值在重载前后保持一致。导出成功、浏览器启动失败和前端超时后，本轮浏览器资源均已释放。 |
| 任务状态与证据 | 成功、节点失败、目标输出缺失及提交结果未知均有对应记录；并发调用使用独立目录。 |

2. 四个实例用例的工作流已用 CLI 重新导出，结果见[导出记录](../../.local/workflow-builder-development/final-export-replay.json)。最终 Skill 副本在仓库外完成多 LoRA 与子目录图片工作流的导出，见[独立运行记录](../../.local/workflow-builder-development/final-standalone-export.json)。
3. 已有任务的查询恢复结果见[任务记录](../../.local/workflow-builder-development/final-status/status-VR9vTK/run.json)。

## 4. 交付检查证据

1. [最终检查记录](../../.local/workflow-builder-development/final-gates.json)保存独立代码审查、独立语义审查、仓库门禁与差异检查的当前结论。记录中的 `quality` 和 `diff_check` 分别表示 `pnpm quality` 与 `git diff --check` 的结果。
2. `pnpm quality` 的命令输出保存在[门禁日志](../../.local/workflow-builder-development/quality-20261022.log)。
