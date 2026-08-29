# harness-comfyui 渐进式 Tool 披露调研

## 结论

本报告固定审阅 `dsh-routing-suite` 提交 [`21a7260d961571c77a11705d2b0e6cf7015cc48b`](https://github.com/yjh051108/dsh-routing-suite/tree/21a7260d961571c77a11705d2b0e6cf7015cc48b)，并以本项目已安装的 Harness `0.1.1-rc.2` 为实现权威。[项目版本锁定](/Volumes/4Tdisk/work/AI2/harness-comfyui/package.json:37)

结论是 **GO：复刻“早期限制全局 Tool、最终阶段解除限制”的思想，做成项目自有、可选的 `comfyui-progressive` Agent Preset；NO-GO：引入整套 `dsh-routing-suite` 或 `dsh-super-injector`。**

继续使用唯一的 CLI Profile `comfyui-workbench`。用户通过 Harness 原生 Agent Preset 入口，为新 Session 选择“标准模式”或“ComfyUI 渐进模式”；不新增 Client UI，也不要求重启 Host。

## 证据边界

- 外部仓库只通过公开 GitHub 页面读取；没有 clone、下载、安装、构建或运行外部代码。
- 外部研发线在固定提交仍标为“尚未发布”。其测试包含源码检查、mock 和集成断言，不等于本项目的 rc.2 生产验证。[外部状态](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/README.md#L200-L210)、[selftest](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/router-standard/router-bootstrap-v34.selftest.mjs#L21-L87)、[集成测试](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/router.integration.test.mjs#L177-L277)
- 外部实验多为 `n=2–5` 的微型任务或少量真实 Session，不能证明最终任务质量稳定提升。[实验条件](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/docs/experiments.md#L194-L210)
- P21 的同文件连续任务中，无引导基线为 `63%`，深度引导为 `46%`；作者认为引导会把注意力从读取现状转向分类。[P21](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/docs/experiments.md#L351-L361)
- PORTS 研究支持“大 Tool 集合存在选择困难、先选相关 Tool”这个一般方向，但不证明 Router Standard 的阶段、persona 或 DeepSeek 效果。[PORTS, EMNLP 2025](https://doi.org/10.18653/v1/2025.emnlp-main.507)

因此只复刻 Tool 可见性控制，不复刻 persona 分类、near-field guidance、模型路由、mode boost 或交付门禁。

## 为什么使用 Agent Preset

| 组成 | 生命周期 | 本设计职责 |
|---|---|---|
| CLI Profile `comfyui-workbench` | Host 启动级 | 继续承载 `dsh-base`、`dsh-web-app`、`harness-comfyui` 和全局 Tool。[profile 清单](/Volumes/4Tdisk/work/AI2/harness-comfyui/profiles/comfyui-workbench/package.json:1)、[启动器](/Volumes/4Tdisk/work/AI2/harness-comfyui/scripts/production/start.mjs:22) |
| Agent Preset `standard` / `comfyui-progressive` | Session 创建级 | `standard` 为单个 Session 保留 Harness 默认 Tool 可见性；`comfyui-progressive` 为单个 Session 管理四阶段状态与全局 Tool 披露。Preset 目录包含 `agent.cordis.yml`，Session 通过 scope 父链加入其 standing mount。[rc.2 Preset 合同](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-agent-presets/README.md:5) |

新增 CLI Profile 会把选择变成重启级配置，不能满足按 Session 选择。Harness rc.2 已提供：

- 常规设置中的默认 Agent Preset，只影响以后创建的 Session；
- 新会话页面中、工作区选择器旁的一次性 preset chip；
- Session 标题旁的只读 preset 名称；
- 设置页中的 roster、复制、删除、默认值和查看入口。

以上均为原生 UI。[rc.2 UI 合同](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-client-ui-agent-preset/README.md:5) 已输出内容的 Session 不能切换，Host 会返回 `agent-preset-locked`。[新会话选择合同](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-client-ui-agent-preset/README.md:11)

原型可放在当前隔离 `DSH_HOME/.agent-presets/comfyui-progressive`；`list()` 和 `resolve()` 每次重新扫描，运行中的 Host 能发现新目录。[发现合同](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-agent-presets/README.md:11) 生产实现应把受版本控制的 preset 物化到隔离运行目录，并作为 `agent-presets.roots` 的 system root，同时保留 Harness 自带 root 与 `includeUserRoot: true`。[roots 配置](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-agent-presets/README.md:84)

## 最小复刻范围

1. 创建 `comfyui-progressive` Agent Preset，以 rc.2 官方 `standard` 组合为基线，使用原生 Tool presentation，并加载一个项目自有 router 插件。
2. router 只使用公开 API：`ctx.tools.restrict({ allow })`、restriction disposer、公开的 system-prompt 组装事件和 preset-scope Tool 注册。
3. 结构化阶段表作为阶段 ID、允许的全局 Tool 名称、完成信号和阶段文案的唯一来源；程序不读取 Markdown。
4. router 把 `phase_status` 和 `phase_advance` 注册为四个阶段都可见的 preset-scope meta Tool；每个阶段的 restriction allowlist 都包含现有全局 `skill` Tool。
5. 阶段状态由 Harness Session 的有序 durable event 恢复，不复制外部实现的 `<DSH_HOME>/router-standard/stages.json` 第二事实源。[外部状态实现](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/router-standard/router-bootstrap-v34.mjs#L527-L556)
6. 每个 listener、restriction 和 Tool 注册都由准确 disposer 管理。

不复刻：super-injector、热安装、profile 重写、persona band、任务关键词分类、逐轮分类引导、`dev_*` Tool、页面验证器、engram、子 Agent 包装、Windows 安装脚本和外部 benchmark。

Harness 明确说明 `ctx.tools.restrict()` 只过滤全局 Tool，allowlist 在注册 restriction 时形成快照，多个 restriction 取交集，scope-local Tool 随后合并；未知、local、reserved 名称会报错。该接口是可见性组合，不是权限边界。[公开 API](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-tools/README.md:18)、[类型合同](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts:603)

## 建议阶段

| 阶段 | Agent 目标 | 全局 Tool 披露 |
|---|---|---|
| 0 理解 | 读取上下文并确认目标 | 读取、搜索、询问类 Tool |
| 1 方案 | 形成可执行步骤 | 阶段 0 + plan/todo 类 Tool |
| 2 制作 | 编写内容或准备完整生图参数 | 阶段 1 + write/edit/提示词准备类 Tool |
| 3 生成与验证 | 查询模板并创建异步 ComfyUI 运行 | 解除 restriction，恢复完整全局 Tool |

阶段 0–2 不显示生成 Tool 是使用时序，不是兼容性故障。外部 Router Standard 在 stage 3 不再创建 restriction；stage 2 自动晋级只认 `delivery_check`，Agent 仍可显式调用 `phase_advance`。[auto-advance](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/router-standard/router-bootstrap-v34.mjs#L514-L524)、[restriction 生命周期](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/router-standard/router-bootstrap-v34.mjs#L559-L584)、[显式推进](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/router-standard/router-bootstrap-v34.mjs#L786-L820)

本项目第一版只用显式 `phase_advance`。作者自验指出阶段推进是会与任务竞争注意力的元工作，因此不复制四套交付 gate。[作者反馈](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/docs/FEEDBACK-v34.md#L238-L242)

## 阶段 3 的 ComfyUI 调用

当前脏工作树尚未完成以下两个 Tool 接口；本报告只把这两个 Tool 接口作为实现趋势，不修改对应代码：

- `query_semantic_comfyui_templates` 根据模板 ID 返回模板和运行参数定义。[当前接口](/Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/catalog/catalog-tool.ts:5)
- `generate_with_comfyui` 返回异步 `run_id`，并要求当前 turn 先出现 `comfyui-generate` 的 `skill-invocation` 事件。[当前接口](/Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-tool.ts:13)、[同 turn 门禁](/Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-tool.ts:20)

两者由 Host 的单一注册入口注册为全局 Tool，阶段 3 解除 restriction 后会同时出现。[Host 注册](/Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/plugin.ts:74)

调用顺序必须是：进入阶段 3 并先解除 restriction → 用户选择模板并提出画面要求 → 当前 turn 调用 `comfyui-generate` Skill → Skill 查询目录并组装参数 → 用户没有声明重复次数时调用一次生成 Tool，用户明确要求多个 Run 时通过多个独立 Tool Call 重复提交完全相同的请求参数 → Agent 返回每次调用的 `run_id`，右侧工作台继续展示异步状态。[当前 Skill 草案](/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/comfyui-generate/SKILL.md:8)

本项目第一版选择让 `skill` Tool 在四个阶段常驻，以避免 Agent 在阶段切换后继续沿用“Skill 不可用”的早期认知。Issue #12 的后续真实 Session 曾观察到：promotion 已恢复完整能力后，Agent 有时仍不再执行 Skill 匹配；Issue #50 采用一次性提醒处理该问题，并明确把提醒标为尚未独立 benchmark 的实验方案。因此，Issue #50 只证明阶段切换存在能力认知风险，不能证明常驻 `skill` Tool 会稳定改善本项目行为；本项目必须通过真实 Session 验证常驻方案。[Issue #50 对 #12 的汇总](https://github.com/yjh051108/dsh-routing-suite/issues/50)

用户通过 `/<skill-name>` 显式调用 Skill 的入口也应始终可用。Harness 的 slash Skill 列表与全局 Tool restriction 是两条通道，所以 `/comfyui-generate` 可能在阶段 0–2 仍显示。第一版把“生成只在阶段 3 成功”作为时序合同；阶段感知的 Skill 菜单过滤不属于最小复刻，也不能把 Host 阶段逻辑写进 Skill。

## 风险

- allowlist 是快照：新全局 Tool 不会自动进入阶段 0–2。阶段表必须引用 Tool 名称常量；配置错误直接失败。
- scope-local Tool 会在过滤后合并：不得声称阶段 Tool 数量等于全部可见 Tool 数量。
- 早期显式 `/comfyui-generate` 会加载 Skill，但生成 Tool 不可见：必须验收清晰错误，且不能创建 Generation Run。
- 实现者必须在编码前用结构化状态合同分别定义 resume、fork、并发 Session 和子 Agent 的阶段状态来源、继承方式与隔离边界；Harness 子 Agent 会加入父 preset composition。[子 Agent 合同](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-agent-presets/README.md:33)
- Agent Preset 没有 patch 语义，复制官方 `standard` 会成为快照；Harness 升级时必须人工 diff 和回归。[copy-only 合同](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-agent-presets/README.md:53)
- stage 3 恢复全量 Tool 后 schema 会重新增大；是否增加项目专用 denylist 必须由本项目实测决定。

## 验证清单

- [ ] `dsh --dump-config` 显示 CLI Profile 仍是 `comfyui-workbench`，roster 同时包含 `standard` 与 `comfyui-progressive`。
- [ ] 原生设置页、新会话 chip 和 Session 标题显示正确 preset；非空 Session 拒绝切换。
- [ ] 阶段 0–2 的 Agent schema 不含两个 ComfyUI Tool；阶段 3 同时包含两者；两个 router meta Tool 和现有 `skill` Tool 在四个阶段都可见。
- [ ] 结构化状态合同已经定义 resume、fork、并发 Session 和子 Agent 的阶段状态来源、继承方式与隔离边界；durable event 能在进程重启后恢复每个 Session 的阶段状态。
- [ ] 阶段 0–2 输入 `/comfyui-generate` 不创建运行，并返回清晰错误。
- [ ] 阶段 3 的真实 Session 日志依次出现当前 turn 的 `skill-invocation`、模板查询 Tool call、生成 Tool call 和 `run_id`。
- [ ] `run_id` 返回后 Agent 不等待 ComfyUI 完成，右侧工作台继续显示异步任务状态。
- [ ] 使用相同模型、工作区、任务和上下文，对比 `standard` 与 `comfyui-progressive` 的完成率、turn 数、阶段推进次数、错误 Tool 调用数、到 `run_id` 的耗时和用户纠正次数。

只有当渐进模式在直接生图、先写提示词再生图、同 Session 连续修改、需要澄清和失败重试五类任务上表现稳定，且不破坏显式 Skill 调用时，才考虑把它设为默认值。
