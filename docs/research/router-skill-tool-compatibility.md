# Router Standard 与仓库 Skill 的 Tool 可见性兼容性

## 结论摘要

本报告固定审阅 `dsh-routing-suite` 提交 [`21a7260d961571c77a11705d2b0e6cf7015cc48b`](https://github.com/yjh051108/dsh-routing-suite/tree/21a7260d961571c77a11705d2b0e6cf7015cc48b)，并以本机已安装的 Harness `0.1.1-rc.2` 和当前工作树为运行事实。

当前仓库有 4 个 Skill。按它们明示的 Tool 合同判断：

- `character-portrait-prompt-designer`：**确定兼容（仅限 Tool 可见性结论）**。Skill 没有明示任何 Harness Tool 名称，Router 没有可按名称阻断的 Skill 依赖；该结论不证明文件读写流程已通过真实 Session。
- `comfyui-generate`：**条件兼容**。官方 `standard` 下，两项业务 Tool 可见；Router Standard 下必须到 stage 3，并且用户必须在该 stage 的当前 turn 显式调用 `/comfyui-generate`。
- `anima-prompt-builder`：**条件兼容**。四项语义查询 Tool 均未由当前 Host 注册；只要触发任一语义查询分支就不兼容。未触发查询时仍存在“校验器脚本如何映射到 Harness Tool”的未定义项。
- `wai-sdxl-prompt-builder`：**不兼容**。它每次都必须调用 `run_skill_script`，错误分支还必须调用 `finalize_skill_error`；当前 Host 和 Harness rc.2 已安装包均未提供这两个 Tool。其四项语义查询 Tool 也未注册。

只复制或安装 Router Standard Agent Preset 不改变任何已有 Session。选择官方 `standard` 才保持完整 Tool 面；选择 `router-standard` 才启用首请求裁剪和 stage 0–3 限制。额外安装 super-injector 只增加 `dev_*` 运行时管理 Tool，不会补齐上述六项缺失 Tool，因此不能修复任何 Skill 兼容性。

## 审计范围与判定规则

- 审计对象是 [`.agents/skills`](/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills) 下全部 4 个 `SKILL.md`，以及它们直接引用的语义查询、脚本调用和格式校验合同。
- 只有 Skill 或直接合同明确点名的 Harness Tool 才进入矩阵。“读取文件”“写入目录”“调用校验器脚本”等动作如果没有指定 Tool 名称，不被推断为 `read`、`write`、`bash`、`pwsh` 或其他 Tool。
- “确定兼容”只表示当前 Tool 可见性没有阻断明示依赖；“条件兼容”表示只有特定输入、stage 或调用方式成立；“不兼容”表示 Skill 的必经路径依赖当前不存在或不可见的 Tool。
- 没有安装、构建或运行外部项目，也没有运行仓库 Skill 脚本。

## 当前 Harness 与 Host 事实

### Skill 发现和调用

Harness rc.2 的 filesystem provider 默认扫描 `<projectRoot>/.agents/skills`，因此这 4 个一级 Skill bundle 都属于可发现形态。[发现顺序](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-skill-filesystem/README.md:29)、[bundle 形态](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-skill-filesystem/README.md:53)

官方 `standard` Agent Preset挂载 scoped `skill-filesystem` 和 `tool-skill`，后者提供模型可见目录与 `skill` Tool。[standard preset](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh/config/agent-presets/standard/agent.cordis.yml:76) 当前 `comfyui-workbench` patch 也启用了 Host 层对应行。[profile patch](/Volumes/4Tdisk/work/AI2/harness-comfyui/profiles/comfyui-workbench/cordis.patch.yml:1)

模型调用 `skill` Tool只把 Skill 正文作为 Tool result；该路径不会创建合成的 `skill-invocation` user message。[模型调用合同](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-tool-skill/README.md:19) 用户输入空白边界明确的 `/name` 时，Harness 才把完整 Skill 正文作为 user-role instructions context 注入，并记录 `skill-invocation` source。[显式调用合同](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-tool-skill/README.md:148)

### 当前项目业务 Tool

项目自有的唯一注册入口收到且只收到两个 Tool definition：[Host 调用](/Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/plugin.ts:74)、[单一注册入口](/Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/tools/register-project-tools.ts:59)

1. `query_semantic_comfyui_templates`。[定义](/Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/catalog/catalog-tool.ts:5)
2. `generate_with_comfyui`。[定义](/Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-tool.ts:13)

`generate_with_comfyui` 还检查当前 turn 的 durable user message：source 必须严格等于 `{ kind: "skill-invocation", name: "comfyui-generate", form: "instructions" }`。[同 turn 门禁](/Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation/generation-tool.ts:20)

当前项目和本机已安装的 Harness 包中均未找到以下 Tool 注册：`query_semantic_works`、`query_semantic_characters`、`query_semantic_styles`、`query_semantic_prompt_terms`、`run_skill_script`、`finalize_skill_error`。其中 anima 的直接参考资料实际描述的是独立 CLI `imagegen-semantic-query`，不是当前 Host Tool definition。[anima 查询参考](/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/anima-prompt-builder/references/semantic-query-interfaces.md:12)

## Router Standard 的可见性时序

Router Standard 自己的 preset 同样挂载 `skill-filesystem` 和 `tool-skill`。[固定提交 preset](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/router-standard/agent.cordis.yml#L106-L115)

但它的首个模型请求不是 stage 0 的正常 Tool 面：只要 Session 尚无 durable `tool/call`，`system-prompt/assemble` 就把 `assembled.tools` 手工过滤为仅 `phase_begin`。[首请求过滤](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/router-standard/router-bootstrap-v34.mjs#L600-L619) 因此，首请求过滤会隐藏已注册的 `skill` 和两项 ComfyUI Tool；另外六项 Skill 业务 Tool 因当前未注册而不存在。

首次 durable Tool call 后，Router 才按当前 stage 调用 `ctx.tools.restrict({ allow })`。Harness rc.2 会先用当前 Agent scope 的 restriction 过滤该 Agent 继承的 global 层和全部祖先层，再合并该 Agent exact scope 自己注册的 Tool；只有 exact scope 的自有注册不受该 restriction 过滤。[rc.2 restrict 精确定义](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts:627) Agent 的继承链是 `agent → preset → global`，所以 Router preset 层注册的 `skill` 属于被过滤的祖先层 Tool，而不是豁免的 Agent exact-scope Tool。[preset scope 继承链](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-agent-presets/README.md:5)

Router v34 的 stage 0–2 allowlist 不含 `skill`、任何 `query_semantic_*` Tool 或两项 ComfyUI Tool。[固定提交阶段表](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/router-standard/router-bootstrap-v34.mjs#L79-L106) `dsh-tool-skill` 会在当前 Agent Tool view 隐藏 `skill` 时省略模型 Skill 目录。[目录可见性合同](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-tool-skill/README.md:9) 用户显式输入 `/skill-name` 的正文注入是另一条入口，不依赖模型调用 `skill` Tool。[显式 slash 合同](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-tool-skill/README.md:148)

stage 0–2 保留的 `tools_catalog` 和 `tools_help` 只能向 Agent展示完整 Tool 名称、摘要和参数结构；`ctx.tools.restrict({ allow })` 仍阻止 Agent调用不在 allowlist 中的 Tool，因此这两个 meta Tool 不能替代 Skill 明示的业务 Tool。[allowlist 安装逻辑](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/router-standard/router-bootstrap-v34.mjs#L559-L584)

固定提交使用当前阶段单档窗口：

| Router 状态 | allowlist 中的阶段 Tool | 对仓库 Skill 的后果 |
|---|---|---|
| 首请求 | 仅 `phase_begin` | 模型不能调用被首请求过滤的 `skill` 和两项 ComfyUI Tool；另外六项 Tool 因当前未注册而不存在。用户显式 slash 注入可以把 Skill 正文放入消息，但不会改变两项 ComfyUI Tool 被过滤或另外六项 Tool 未注册的状态。 |
| stage 0 | `read`、`glob`、`grep`、`web_search`、`ask_user_question`、部分 engram Tool，加 meta Tool | `preset` 祖先层的 `skill` 被隐藏，模型 Skill 目录被省略；已注册的两项 ComfyUI Tool 被 allowlist 隐藏，另外六项 Tool 因未注册而不存在。用户显式 slash 仍可注入 Skill 正文。 |
| stage 1 | stage 0 累积 + `todo_write`、`exit_plan_mode`、部分 engram Tool | `skill`、模型 Skill 目录和已注册的两项 ComfyUI Tool 仍被隐藏；另外六项 Tool 仍因未注册而不存在。 |
| stage 2 | stage 0–1 累积 + `write`、`edit`、`str_replace_editor`、部分 engram Tool | `skill`、模型 Skill 目录和已注册的两项 ComfyUI Tool 仍被隐藏；另外六项 Tool 仍因未注册而不存在。 |
| stage 3 | 不再安装 restriction，恢复完整 registry | 当前已经注册的两项 ComfyUI Tool 可见；另外 6 项 Tool 仍因没有注册而不存在。 |

阶段表、单档窗口和 meta Tool 来自固定提交的 `STAGES`、`GLOBAL_SAFE` 与 `windowFor()`。[阶段表](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/router-standard/router-bootstrap-v34.mjs#L79-L106) stage 3 分支先解除旧 disposer，随后不再创建 restriction。[restriction 生命周期](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/preset/router-standard/router-bootstrap-v34.mjs#L541-L566)

## 逐 Skill 矩阵

| Skill | 明示 Tool | Tool 使用条件 | 官方 `standard` | `router-standard` | 结论 |
|---|---|---|---|---|---|
| `anima-prompt-builder` | `query_semantic_works`、`query_semantic_characters`、`query_semantic_styles`、`query_semantic_prompt_terms` | 七类语义补全或消歧条件触发；无条件要求调用校验器脚本，但没有写明 Harness Tool 名称。[Skill](/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/anima-prompt-builder/SKILL.md:51)、[脚本合同](/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/anima-prompt-builder/references/03-output-protocol.md:14) | 四项查询 Tool 不存在；无查询分支的脚本执行 transport 未定义。 | stage 0–2 即使以后注册四项查询 Tool 也会被 allowlist 隐藏；stage 3 只解决可见性，不解决当前缺少注册。 | **条件兼容**：仅未触发语义查询且实际 Session 能明确执行本地校验器时可能完成。 |
| `character-portrait-prompt-designer` | 无 | Skill 明示读取白名单文件并写入 `source/media/`，但没有指定 Harness Tool 名称。[Skill](/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/character-portrait-prompt-designer/SKILL.md:41)、[输出位置](/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/character-portrait-prompt-designer/SKILL.md:109) | 没有明示 Tool 名称被隐藏或缺失。 | 没有明示 Tool 名称可与 allowlist逐名比较。 | **确定兼容（Tool 可见性）**；真实文件读写能力不在本结论内。 |
| `comfyui-generate` | `query_semantic_comfyui_templates`、`generate_with_comfyui` | 每项 Generation Request 先查询一次实例目录；未声明重复次数时默认调用一次生成 Tool，明确要求多个 Run 时通过多个独立 Tool Call 重复提交完全相同的请求参数。[Skill](/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/comfyui-generate/SKILL.md:14)、[生成循环](/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/comfyui-generate/SKILL.md:36) | 两项都已注册；但只有用户显式 `/comfyui-generate` 才满足生成 Tool 的同 turn source 门禁，模型通过 `skill` Tool 加载不满足。 | 首请求与 stage 0–2 不可调用；stage 3 两项同时恢复。用户必须在 stage 3 当前 turn 再次显式 slash 调用。 | **条件兼容**。 |
| `wai-sdxl-prompt-builder` | `query_semantic_works`、`query_semantic_characters`、`query_semantic_styles`、`query_semantic_prompt_terms`、`run_skill_script`、`finalize_skill_error` | 四项查询按输入条件调用；`run_skill_script` 每次必调；`finalize_skill_error` 处理第三次格式失败或执行错误。[语义合同](/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/wai-sdxl-prompt-builder/references/semantic-tool-orchestration.md:9)、[校验合同](/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/wai-sdxl-prompt-builder/references/prompt-format-validator.md:11) | 必经的 `run_skill_script` 不存在；错误 Tool 和四项查询 Tool 也不存在。 | stage 3 解除 restriction 仍不能产生未注册 Tool。 | **不兼容**。 |

## 四种部署/选择状态

| 状态 | 实际变化 | Skill 兼容性 |
|---|---|---|
| 只安装 Router Standard Agent Preset | rc.2 roster 每次 `list()`、`resolve()` 重新扫描；未选择的 preset 不会改当前 Session。[Preset 发现](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-agent-presets/README.md:11) | 与安装前相同。 |
| 新 Session 选择官方 `standard` | Session 取得完整 standard 组合；preset 选定后对非空 Session 固定。[Session preset](/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/production/dsh-home/profiles/node_modules/@deepseek-ai/dsh-agent-presets/README.md:41) | 只有当前已注册 Tool 可用；不会自动产生缺失的六项 Tool。 |
| 新 Session 选择 `router-standard` | 启用首请求仅 `phase_begin`、stage 0–2 allowlist、stage 3 全量恢复。 | `comfyui-generate` 推迟到 stage 3；WAI 仍不兼容；anima 查询分支仍不兼容。 |
| 额外安装 super-injector | Host 新增 `dev_inject_plugin`、`dev_reload_package`、`dev_stage_*` 等 `dev_*` Tool。[固定提交 Tool 表](https://github.com/yjh051108/dsh-routing-suite/blob/21a7260d961571c77a11705d2b0e6cf7015cc48b/injector/README.md#L109-L123) | super-injector 不提供六项缺失 Skill Tool，因此四个 Skill 的结论不变。Session 选择官方 `standard` 时，新增的 `dev_*` Tool 可见；Session 选择 `router-standard` 时，不在 allowlist 中的全局 `dev_*` Tool 在 stage 0–2 被隐藏，并在 stage 3 解除 Router restriction 后恢复。 |

## 实际后果

1. 用户在官方 `standard` 中显式输入 `/comfyui-generate`，两项 ComfyUI Tool 对 Agent 可见，且当前 turn source 可以通过生成 Tool 门禁；这是当前唯一能够从文档与代码确认的完整 Skill → Tool 链路。
2. 用户在 Router Standard 的首请求或 stage 0–2 显式调用 `/comfyui-generate` 时，Skill 正文可以被注入，但两项业务 Tool 不在可见 Tool 面，不能创建 Generation Run。
3. 用户在早期 stage 调用过 `/comfyui-generate` 后，进入 stage 3 不能沿用旧 turn 的 invocation 通过门禁；用户必须在 stage 3 再显式调用一次。
4. Router 从首请求到 stage 2 都隐藏 `skill` 并省略模型 Skill 目录，stage 3 解除 restriction 后才恢复。早期 stage 的用户显式 slash 调用仍能注入 Skill 正文，但 Agent 不能通过模型目录自行匹配 Skill，也不能调用仍被隐藏或尚未注册的业务 Tool。
5. WAI Skill 即使不需要语义查询，也会在必经校验阶段停在不存在的 `run_skill_script`；安装 Router 或 super-injector 都不会改变结果。
6. anima Skill 在需要角色、作品、画师或 Prompt term 查询时会找不到四项 Tool。它直接参考的 CLI 不能等同于 Harness Tool，报告没有假设 Agent 会自行改用 shell。

## 验收清单

- [ ] 官方 `standard` 新 Session 的首个 request header 包含 `skill`、`query_semantic_comfyui_templates` 和 `generate_with_comfyui`。
- [ ] Router Standard 首个 request header 只包含 `phase_begin`。
- [ ] Router stage 0、1、2 的 request header 都不包含 `skill`、两项 ComfyUI Tool 或任何 `query_semantic_*` Tool；stage 3 同时恢复当前已注册的 `skill` 和两项 ComfyUI Tool。
- [ ] Router stage 0–2 的模型消息不包含当前 Skill 目录；用户显式 `/comfyui-generate` 仍注入完整 Skill 正文。
- [ ] stage 3 显式 `/comfyui-generate` 的 Session 日志先记录当前 turn 的 `skill-invocation` user message，再记录模板查询和生成 Tool call。
- [ ] stage 0–2 显式 `/comfyui-generate` 不创建 Run，并返回明确的不可用原因。
- [ ] 模型通过 `skill` Tool加载 `comfyui-generate` 后直接调用生成 Tool时，测试确认 `GENERATION_SKILL_INVOCATION_REQUIRED`；用户显式 slash 路径成功。
- [ ] WAI Skill 的黑盒门禁在启动时报告缺少 `run_skill_script`、`finalize_skill_error` 和四项语义查询 Tool，而不是运行到一半才失败。
- [ ] anima Skill 的黑盒门禁区分“未触发语义查询”和“触发任一语义查询”两类输入，并报告校验器执行 transport 尚未定义。
- [ ] 安装 super-injector 前后重复上述检查；六项缺失 Skill Tool 的集合必须保持不变。

## 证据边界

本报告没有把未明示的文件操作映射成具体 Tool，也没有把外部 Router 的源码测试当作当前生产 Session 证据。负向 Tool 注册结论来自当前 profile 仅包含 `dsh-base`、`dsh-web-app` 和 `harness-comfyui`，[profile 清单](/Volumes/4Tdisk/work/AI2/harness-comfyui/profiles/comfyui-workbench/package.json:5) 当前项目唯一 Tool 注册入口，以及对本机 rc.2 已安装包的精确名称检索。最终兼容性必须以验收清单中的 request header、durable Session event 和真实 Tool result 为准。
