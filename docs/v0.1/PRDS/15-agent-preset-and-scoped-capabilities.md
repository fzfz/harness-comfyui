# Ticket 15 — 交付 harness-comfyui Agent Preset 与作用域化 Tool/Skill

## 产品目的

产品安装完成后，操作员启动真实Harness Host与Client，Harness必须从当前release自己的`dsh-home/.agent-presets/harness-comfyui/`发现状态正常的`harness-comfyui` Agent Preset。rc.8把这个公开Harness home root标记为`user` trust；本项目不得伪造`system` trust或把Preset写入`@deepseek-ai/dsh`包目录。使用该Preset创建的Agent只能取得本产品明确注册的model-facing Tool与当前release附带的项目Skill；使用`standard`、`minimal`或测试Preset创建的Agent不能取得这些项目Tool，也不能从默认Skill roots发现这些项目Skill。

本 Ticket 补充已关闭的 Ticket 01。它不修改 DeepSeek Harness rc.8 核心代码，不复制上游包源码，不修改上游 package patch；它只使用 rc.8 公开的 Profile patch、Agent Preset、Cordis standing Preset scope、`ctx.tools.register()`、`dsh-skill-filesystem` 与 `dsh-tool-skill` 机制。

## 唯一产品契约

计划执行者必须创建 `config/product-agent.json`，并把以下值作为构建、安装、Host 和 Client 共用的唯一结构化来源：

- `agentPresetId`: `harness-comfyui`
- `agentPresetArtifactRelativeRoot`: `agent-presets`
- `agentPresetInstallRelativeRoot`: `dsh-home/.agent-presets`
- `skillRelativeRoot`: `skills`
- `agentPluginExport`: `./agent`
- `sessionListConvergenceTimeoutMs`: `10000`

计划执行者不得在其他 TypeScript 模块中重新声明第二个 Preset ID、Preset 相对路径或 Skill 相对路径。

## Release Artifact 与 Profile 组合

Release Artifact 必须包含以下真实运行文件：

- `agent-presets/harness-comfyui/preset.yml`
- `agent-presets/harness-comfyui/agent.cordis.yml`
- `lib/agent.js`
- `skills/`只在业务Skill已经由Tickets 04或12加入后进入tarball；本Ticket阶段的tarball可以不包含空目录。

`profiles/comfyui-workbench/cordis.patch.yml`必须用以下配置替换`@deepseek-ai/dsh-agent-presets` row的config。rc.8启动器会在该patch之后把随`@deepseek-ai/dsh`发布的Preset root写入`roots`，并在`includeUserRoot: true`时追加当前`DSH_HOME/.agent-presets`；本项目只能使用这个公开user root，不能通过Profile patch声明第二个system root：

```yaml
- id: agent-presets
  config:
    default: harness-comfyui
    includeUserRoot: true
```

产品管理CLI的`install`与`upgrade`必须把artifact中的`agent-presets/harness-comfyui/`复制到目标release的`dsh-home/.agent-presets/harness-comfyui/`，并在复制前拒绝目标为symlink或非目录。CLI的`start`、`restart`、`upgrade`与`rollback`必须把当前release的`dsh-home`作为真实Harness进程的`DSH_HOME`，从active release推导`HARNESS_COMFYUI_SKILL_DIR=<active-release>/package/skills`，并固定传入`DSH_TOOLS_MODE=native`。调用者ambient中的`DSH_TOOLS_MODE`不能覆盖产品值；这保证rc.8不会在项目Agent中加入保留的`run_code` presentation transport。

`HARNESS_COMFYUI_SKILL_DIR`不能来自调用者手写的installation配置，不能指向来源checkout，也不能指向`$DSH_HOME/skills`。`install`与`upgrade`必须在业务Skill尚未交付时通过`mkdir({recursive: true})`物化空的`<active-release>/package/skills`，并拒绝该路径为symlink或非目录；后续tarball含业务Skill时保留解包后的真实目录。`preflight`只验证tarball内的两个Preset文件、Agent bundle、结构化产品Agent合同与精确Profile patch。`health.agentPresetInstallation`验证active release内的两个Preset文件、Agent bundle与Skill目录。

## Agent Preset 组合

`agent-presets/harness-comfyui/preset.yml` 必须固定为：

```yaml
name: ComfyUI 图像工作台
description: 只使用当前版本随附的 ComfyUI Skills 与项目 Tools 处理图像生成任务。
order: 1
```

`agent-presets/harness-comfyui/agent.cordis.yml` 必须且只能挂载以下 model-facing能力：

1. `@deepseek-ai/dsh-persona`，`text`固定为`You are the DeepSeek Harness ComfyUI workbench Agent. Use only the Tools and Skills mounted by the active Agent Preset. When the user invokes a Skill, follow its instructions and call only the Tools it names. Reply in the user's language.`；`complete`与`includeRuntimeContext`使用rc.8默认值。
2. `@deepseek-ai/dsh-skill-filesystem`，配置 `providerName: harness-comfyui`、`includeDefaultRoots: false`、`watch: false` 与 `customSkillDirs: [!!js process.env.HARNESS_COMFYUI_SKILL_DIR]`。
3. `@deepseek-ai/dsh-tool-skill`，提供 Harness原生 `skill` Tool、`/skill-name` invocation解析与 Skill正文加载。
4. `harness-comfyui/agent`，在当前 Agent scope注册项目 Tool。

该 Preset不得挂载 `standard` Preset中的 shell、filesystem、jobs、goals、subagents或web Tool插件。

## 项目 Tool 注册

计划执行者必须创建 `src/agent/plugin.ts` 并通过 `package.json#exports["./agent"]` 与 Client/Host bundle build配置导出为 `lib/agent.js`。该插件必须在 standing Preset scope中直接调用现有 `src/host/tools/register-project-tools.ts` 导出的 `registerProjectTools(ctx, definitions)` 注册该阶段已经实现的项目 Tool。该插件不得调用 `ctx.tools.restrict()`：rc.8把同一 Preset composition中的 `dsh-tool-skill` 与项目 Agent plugin都挂载在 standing Preset layer，目标Agent从子scope继承该layer；在该layer注册allow restriction会同时过滤原生`skill`与项目Tool。

rc.8 `@deepseek-ai/dsh-web-app/cordis.patch.yml`把Host composition中的`tool-bash`、`tool-pwsh`、`tool-jobs`、`tool-fs`、`tool-fs-search`、`tool-str-replace-editor`、`tool-skill`、`tool-goal`、`plan-mode`、`tool-subagent-control`、`tool-subagent-list-agents`、`tool-subagent`、`tool-subagent-fork`、`tool-workflow`、`tool-ralph`、`tool-todo`与`tool-web`全部设为disabled；当前项目Host plugin不得注册model-facing Tool。真实`comfyui-workbench` Web composition加载完成后，Host-global `ctx.tools.schemas()`必须严格等于`[]`。项目Preset只通过自己的`dsh-tool-skill` row和项目Agent plugin形成model-facing集合；`standard`、`minimal`与测试Preset的sibling standing scope不能继承项目Preset layer。

计划执行者必须从 `src/host/plugin.ts` 删除 Host root对 `registerProjectTools()` 的调用。Host plugin继续负责 Configuration Profile、Source adapter、Run Repository、Jobs、Remote、Web route与状态服务；Host root不得注册 model-facing项目 Tool。

本 Ticket执行完成时，业务 Tool尚未由后续 Ticket交付，因此真实 `harness-comfyui` Agent的 model-facing schema只能包含 Harness原生 `skill` Tool。Tickets 03、04 与 05后续只能向 `registerProjectTools()` 的定义集合增加已经由对应 Ticket实现并验证的项目 Tool，不能另建第二个 Tool registry入口。

## Skill 隔离

项目 Skill必须保存在当前 release的`package/skills`。`dsh-skill-filesystem`必须设置`includeDefaultRoots: false`并只读取`HARNESS_COMFYUI_SKILL_DIR`。安装程序不得把项目 Skill复制到`$DSH_HOME/skills`、`.dsh/skills`或`.agents/skills`。

自动化测试可以在测试目录创建一个受控 Skill fixture并把测试进程的`HARNESS_COMFYUI_SKILL_DIR`指向该目录。测试 fixture不得写入Release Artifact的`skills/`，也不得进入production Profile。

## 状态与错误

Preset安装证据与运行时roster证据必须按生命周期分开验证：

- `preflight`在Host未启动时，只验证tarball中的`config/product-agent.json`、`agent-presets/harness-comfyui/preset.yml`、`agent-presets/harness-comfyui/agent.cordis.yml`、`lib/agent.js`导出与精确Profile patch；`preflight`不得调用`agentPreset.list`。
- `install`或`upgrade`完成后，停止态`status`只验证active release、`dsh-home/.agent-presets/harness-comfyui/`中的两个Preset文件、`package/skills`真实目录、进程状态与端口状态；停止态`status`不得调用`agentPreset.list`，也不得声称已经取得运行时roster。
- running `status`在确认process state属于当前installation、PID identity匹配且目标端口已监听后，必须调用一次rc.8 `agentPreset.list`。`health`只有在自己的process检查得到`status: "passed"`后才能调用一次同一接口；process state缺失、PID identity不匹配、目标端口未监听或端口由非受管进程占用时，`health`必须把`agentPresetRoster`标为`process-required`且不得发送该RPC。两条成功在线路径都必须确认唯一`harness-comfyui`记录满足`trust === "user"`、`isDefault === true`且`broken === undefined`。
- rc.8公开`agentPreset.list`结果不包含Preset文件路径。产品CLI必须通过release-local静态文件验证证明安装路径，通过在线`agentPreset.list`证明运行时roster；任何命令不得把两类证据伪装成同一个RPC结果。

`health --json`必须把两类证据放在两个对象中：`agentPresetInstallation`固定为`{ status, releaseRelativeRoot: "dsh-home/.agent-presets/harness-comfyui", requiredFiles: ["preset.yml", "agent.cordis.yml"], skillRelativeRoot: "package/skills" }`；`agentPresetRoster`成功时固定为`{ status: "passed", id: "harness-comfyui", trust: "user", isDefault: true }`。`agentPresetRoster`不得包含`releaseRelativeRoot`、文件名或Skill路径。

`preflight`、`status`与`health`不得为检查Preset而创建Session；真实Session创建与mount只在本Ticket验收测试中执行。以下情况必须在所属生命周期路径返回非零状态与具体错误，不能改用`standard`：

- Preset root不存在。
- `preset.yml`或`agent.cordis.yml`缺失。
- `HARNESS_COMFYUI_SKILL_DIR`不存在。
- Preset任一必需 row挂载失败。
- running `status`或`health`调用的`agentPreset.list`没有返回状态正常的`harness-comfyui`。
- Session创建响应返回的resolved Preset ID不是`harness-comfyui`。

## 自动化验收

1. 从当前 worktree构建tarball，通过现有产品管理 CLI在该worktree的`runtime/production/`完成install、preflight、start、status、health、logs与stop。
2. `preflight`在没有Host进程时通过tarball静态检查；停止态`status`在没有Host进程时通过release-local Preset与Skill目录检查。测试必须断言两条路径都没有发出`agentPreset.list`请求。running `status`与`health`分别调用运行中Host的`agentPreset.list`并返回`trust: "user"`、`isDefault: true`且`broken`缺失；release-local文件检查另行证明Preset位于当前release Harness home的`harness-comfyui`。`health`测试必须覆盖process state缺失、PID identity不匹配与非受管进程占用端口三种分支，并断言三种分支都没有请求`/api/agentPreset.list`。成功health必须把`agentPresetInstallation`与`agentPresetRoster`按本PRD定义分列，roster对象不能包含路径。
3. `sessions.create({ cwd: hostDescription.cwd, agentPreset: "harness-comfyui" })`成功，响应与Session header都保存`harness-comfyui`。
4. 真实`comfyui-workbench` Web composition的Host-global Tool schemas严格等于`[]`；指定项目Agent scope的Tool schemas严格等于`["skill"]`。测试必须对实际子Agent scope取schemas，不能用standing Preset scope代替。
5. 测试用项目 Tool只对`harness-comfyui` Agent可见，`standard`、`minimal`与测试Preset均不可见。
6. 受控测试Skill只对`harness-comfyui` Agent的Skill catalog与`/`菜单可见，其他Preset从默认roots不能发现该Skill。
7. 删除Preset文件、删除Skill目录、写入无效Preset row与返回错误resolved ID分别得到具体失败，且Harness没有发布错误Agent。
8. tarball-only installation在来源checkout不存在且tarball没有业务Skill时，install必须物化真实空`package/skills`目录，项目Agent的Skill catalog为空；随后测试专用Skill root仍能完成隔离验收。
9. 全部现有质量门禁通过；计划执行者不安装新依赖。若现有精确rc.8依赖必须从`devDependencies`提升到运行依赖，执行者必须使用根manifest已有的精确`0.1.0-rc.8`版本并通过既有双lock安全门禁。

## 人工验收

本 Ticket没有新增可见原型区域，也不新增移动端布局。独立审核者必须在真实本地浏览器确认Agent Preset roster显示`harness-comfyui`状态正常，并在Harness原生`/`菜单确认测试Skill只出现在项目Session。自动化测试不能替代这两项人工确认。

## 后续 Ticket 约束

- Ticket 02在本 Ticket完成后继续现有三列工作台实现，不重写本 Ticket的Preset、Tool registry或安装逻辑。
- Ticket 16在Ticket 02完成后把工作台Session严格绑定到`harness-comfyui`。
- Tickets 04与12把业务Skill加入Release Artifact的`skills/`，不能改回`DSH_HOME/skills`。
