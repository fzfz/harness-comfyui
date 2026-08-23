# Harness rc.8 Agent Preset、Tool 与 Skill 运行链路调研

## 结论

Issue #16执行前的`comfyui-workbench` Profile只组合`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`与`harness-comfyui`，因此产品Session实际依赖`@deepseek-ai/dsh-web-app`在rc.8中配置的默认`standard` Preset。Issue #16必须交付项目专属`harness-comfyui` Agent Preset并把它设为产品默认Preset。

Issue #16执行前的实现会让`DSH_HOME/skills`中的Skill被`standard` Agent发现，也会让Host根作用域注册的项目Tool被`standard` Agent继承；该实现不能满足“项目Tool与项目Skill只提供给DeepSeek Harness ComfyUI Agent”的限制。Issue #16必须从`src/host/plugin.ts`移除项目Tool注册，并由项目Preset挂载的Agent plugin注册项目Tool。

如果产品要求限定 Agent 能力，计划必须交付项目专属 `harness-comfyui` Preset，并且创建产品 Session 时必须显式传入 `agentPreset: "harness-comfyui"`。项目 Tool 必须由该 Preset 挂载的项目 Agent-plane 插件在 Preset scope 中注册；项目 Skill provider 与 `dsh-tool-skill` 也必须由同一 Preset 挂载。该方案完全使用 Harness rc.8 的公开插件、Preset 与 scope 机制，不修改 Harness 核心代码。

## Harness rc.8 的实际运行链路

### Web Profile 只提供 Preset roster，不预先启动固定 Agent

`@deepseek-ai/dsh-web-app/cordis.patch.yml` 第 431–445 行插入 `@deepseek-ai/dsh-agent-presets`，并把部署默认 Preset 设置为 `standard`。同一配置说明 Harness 还会扫描 `$DSH_HOME/.agent-presets`。

`@deepseek-ai/dsh-host-apiproxy` 的公开 `sessions.create` 契约说明：

- `sessions.create` 创建真实 Session 与 idle Agent。
- 请求可以传入 `agentPreset`。
- 未传入 `agentPreset` 时，Harness 使用用户保存的默认值；用户未保存默认值时才使用部署默认值。
- Harness 把解析后的 Preset ID 写入 Session header，后续 resume 使用同一 Preset 重建 Agent。
- Preset 不存在或无法挂载时，Session 创建失败。

因此，“启动自设 Agent”不是 Host 启动时再启动一个独立 Agent 进程。正确链路是：产品创建 Session 时指定项目 Preset，Harness 在发布 Agent 前完成 Preset mount。

### Preset 是 Agent 的 Tool、Skill 与 Prompt 组合边界

`@deepseek-ai/dsh-agent-presets` 的公开类型说明，每个 Session 的 Agent 从一个 Preset `cordis.yml` 取得 model-facing plugin set。Preset 的 Tool 注册、Prompt section 与事件监听器挂载在 standing scope 中；使用该 Preset 的 Agent 通过 scope parentage 加入该组合。

`@deepseek-ai/dsh-host-apiproxy/lib/types/api-proxy.js` 第 941–956 行执行以下步骤：

1. 取得 `agentPresets` service。
2. 解析请求或 Session 指定的 Preset ID。
3. 创建 Agent，并把解析后的 Preset ID写入 Agent metadata。
4. 在 Agent factory 的 `setup(agentCtx)` 中调用 `presets.mount(agentCtx, resolvedId)`。
5. Preset mount 成功后才发布 Agent；mount 失败时回滚 Agent 创建。

`@deepseek-ai/dsh-agent-presets` 还会拒绝 Preset row 泄漏 process-global service。Preset 内需要隔离的 service 必须放在 isolate realm 中。

### `standard` Preset 才提供当前计划依赖的 Skill 能力

`@deepseek-ai/dsh/config/agent-presets/standard/agent.cordis.yml` 是 Agent-plane composition。第 76–87 行挂载：

- `@deepseek-ai/dsh-skill-filesystem`：向当前 Preset scope 注册 filesystem Skill provider。
- `@deepseek-ai/dsh-tool-skill`：向当前 Preset scope注册模型可调用的 `skill` Tool、Skill catalog prompt 与用户 `/skill-name` 注入处理。

`@deepseek-ai/dsh-skill-filesystem` 默认扫描当前项目的 `.dsh/skills`、`.agents/skills`、`$DSH_HOME/skills`、`$DSH_AGENTS_HOME/skills` 与 bundled Skill 目录。这个 provider 是否存在取决于当前 Agent Preset 是否挂载它；把项目 Skill 复制到 `DSH_HOME/skills` 还会让挂载默认 provider 的 `standard` Preset发现这些 Skill，因此不能实现项目 Skill隔离。

rc.8 的公开 `dsh-skill-filesystem` 配置提供 `includeDefaultRoots` 与 `customSkillDirs`。项目 Preset必须设置 `includeDefaultRoots: false`，并把 `customSkillDirs`唯一指向当前 release的`package/skills`目录。产品管理 CLI从active release推导该绝对路径并通过`HARNESS_COMFYUI_SKILL_DIR`传给 Harness；项目 Skill不得复制到`$DSH_HOME/skills`。

`@deepseek-ai/dsh-tool-skill` 执行 Skill 时使用 `exec.agent` 的 cwd 与 scope。用户消息中的 `/skill-name` 也会在 `agent/pre-step` 阶段按同一 Agent scope 重新解析和校验，然后生成 `source.kind: "skill-invocation"` 的 Context。

### Host 根作用域 Tool 注册不等于 Agent 专属 Tool

`@deepseek-ai/dsh-tools` 的公开契约明确区分两种注册：

- Host/root context 调用 `ctx.tools.register()`：注册到全局 Tool 层。
- Agent/Preset scope 调用 `ctx.tools.register()`：注册到调用方 Agent scope；同名 scoped Tool 可以 shadow 全局 Tool。

Agent取得的最终Tool view由全局Tool与`agent → preset → global` scope chain中的Tool共同组成。`ctx.tools.get(name, scope)`与`ctx.tools.schemas(scope)`用于证明指定Agent实际能看见哪些Tool。

rc.8的`ctx.tools.restrict()`不能用于这个项目Preset。`dsh-agent-presets`把`dsh-tool-skill`和项目Agent plugin的注册都放在同一个standing Preset layer；真实Session Agent是该layer的子scope。Preset layer中的`restrict({ allow: [] })`会在子Agent读取时同时过滤该layer的原生`skill`和项目Tool，调整Cordis row顺序不会改变scope parentage。

rc.8 Web composition已经在`@deepseek-ai/dsh-web-app/cordis.patch.yml`的agent-plane区段禁用Host plane的model-facing Tool rows，并明确规定Web的global Tool layer为空。项目Host plugin也不注册model-facing Tool后，项目Preset不需要restriction：`dsh-tool-skill`与项目Agent plugin只向项目standing Preset layer注册，目标Agent通过parent chain继承，`standard`、`minimal`与测试Preset的sibling standing scope不能继承该layer。真实Web composition必须以Host-global schemas严格等于`[]`、项目Agent schemas当前严格等于`["skill"]`和测试项目Tool不出现在三个非项目Preset中证明该边界。

Issue #16必须让`src/agent/plugin.ts`成为`registerProjectTools()`的唯一调用方，并从`src/host/plugin.ts`删除该调用。统一registry通过项目Agent plugin在`harness-comfyui` standing Preset layer注册`generate_with_comfyui`与Catalog Tool；Host plugin不注册model-facing Tool。Skill adapter仍检查当前turn的`skill-invocation` Context并拒绝不合法调用；standing Preset sibling scope负责Tool可见性隔离。

## 当前仓库与计划的具体缺口

### 运行配置没有项目 Preset

`profiles/comfyui-workbench/package.json` 只组合以下 bundle：

- `@deepseek-ai/dsh-base`
- `@deepseek-ai/dsh-web-app`
- `harness-comfyui`

`profiles/comfyui-workbench/cordis.patch.yml`当前为空数组。仓库没有项目Preset的`preset.yml`与`agent.cordis.yml`，安装流程也没有把项目Preset复制到release-local`DSH_HOME/.agent-presets` user root。rc.8启动器会在Profile patch之后把`agent-presets.config.roots`重写为随`@deepseek-ai/dsh`发布的唯一system root；项目不能通过Profile patch增加第二个system root，也不能修改上游包目录。

### 计划只描述“preset scope”，没有交付 Preset

当前计划已经写到 `dsh-tool-skill` 按 Session cwd 与 preset scope校验 Skill，也要求安装程序复制 Skill。原计划使用`<release>/dsh-home/skills/`会把项目 Skill暴露给其他挂载默认 provider的Preset，必须改为只由项目 Preset读取的`<release>/package/skills/`。计划还没有定义：

- 项目 Preset ID、显示名称与 `preset.yml`。
- 项目 Preset 的 `agent.cordis.yml`。
- Preset 挂载的 persona、Skill provider、Skill Tool与项目 Agent-plane Tool plugin。
- 产品管理CLI如何把项目Preset复制到当前release的公开`DSH_HOME/.agent-presets` user root，并把隔离Skill root传给项目Preset。
- 产品新建 Session 时如何显式传入项目 Preset ID。
- 产品恢复 Session 时如何核对 Session header中的 Preset ID。
- Preset mount失败、Skill row未激活或项目 Tool row未激活时如何阻止产品 Session可用。
- 如何证明另一个 Preset的 Agent看不见项目专属 Tool与 Skill。

### 当前验收只证明 Host 注册，未证明 Agent 可调用

Ticket 01 当前只验证 Host、Client、Remote、Profile 与全局 Tool registry基础设施。Ticket 04 与 Ticket 12分别要求真实 Skill和 Tool Call，但是都没有固定 Session 的 `agentPreset`，也没有读取指定 Agent 的 Tool schemas 与 Skill catalog。

因此，在执行这些 Ticket 时，即使测试恰好因为 Web App 默认 `standard` 而通过，也不能证明：

- 产品没有依赖用户可变的默认 Preset。
- `minimal` 或其他 Preset不会看见项目 Tool。
- 项目 Skill 与项目 Tool属于同一个 Agent能力边界。
- release安装后创建的 Session一定使用正确 Preset。

## 应写入计划的实现设计

### 项目 Preset 产物

Ticket 15必须交付唯一项目Preset`harness-comfyui`：

- Release Artifact保存 `agent-presets/harness-comfyui/preset.yml`。
- Release Artifact保存 `agent-presets/harness-comfyui/agent.cordis.yml`。
- Release Artifact把该目录保存在`agent-presets/harness-comfyui/`；产品管理CLI把它复制到当前release的`dsh-home/.agent-presets/harness-comfyui/`。rc.8通过公开Harness home user root发现该Preset；项目不得修改随`@deepseek-ai/dsh`发布的system root。
- Product Profile必须让 `agentPreset.list` 返回状态正常的 `harness-comfyui`。

### Agent-plane plugin composition

`harness-comfyui/agent.cordis.yml` 至少必须挂载：

- 项目定义的 persona或system prompt贡献。
- `@deepseek-ai/dsh-skill-filesystem`，并设置`providerName: harness-comfyui`、`includeDefaultRoots: false`与唯一`customSkillDirs`。
- `@deepseek-ai/dsh-tool-skill`。
- 当前包公开导出的项目 Agent-plane Tool plugin `harness-comfyui/agent`。

项目 Agent-plane Tool plugin必须在 Preset scope调用统一 Tool registry并注册 `generate_with_comfyui` 与 Catalog Tool。Host/root plugin继续拥有配置、Source adapter、Run Repository、Jobs、Remote、Web route与其他 Host service，但不再把 model-facing项目 Tool注册到全局 Tool层。

### Session创建与恢复

Ticket 16必须让产品创建 Session时显式提交：

```ts
{ agentPreset: "harness-comfyui", ...projectIdentity }
```

产品不得依赖用户保存的默认 Preset或 rc.8 Web App的部署默认 `standard`。创建成功后必须核对响应与 Session header中的 resolved Preset ID。恢复既有 Session时，产品必须只把 header中记录为 `harness-comfyui` 的 Session绑定为产品工作台Session；Preset缺失或不匹配必须显示具体错误，不得静默改用 `standard`。

### Tool与 Skill限制

计划必须定义项目 Preset的允许能力集合。默认 `standard` 是完整 coding Agent，包含 shell、filesystem、jobs、goals、subagent、web等 Tool；它不应被直接视为本产品的最终最小权限集合。

项目 Preset只挂载本产品需要的 model-facing能力：Skill loader、产品 Skill provider、项目 Catalog Tool与 `generate_with_comfyui`。Harness Session、AgentLoop、Tool runtime、Skill runtime与stream仍由上游 rc.8负责。

项目Preset不得调用`ctx.tools.restrict()`。产品依赖rc.8 Web composition已经清空Host-global model-facing Tool rows，并依赖standing Preset sibling scope隔离不同Preset的Tool；项目必须通过实际global scope与实际子Agent scope的schemas测试验证这两个已冻结的rc.8事实。

### Preset文件与roster的生命周期证据

`agentPreset.list`只存在于运行中的Host API，并且公开结果不包含Preset文件路径。产品生命周期必须使用两类独立证据：

- Host未启动时，`preflight`读取tarball并验证结构化Preset合同、两个Preset文件、Agent bundle与Profile patch；停止态`status`读取active release并验证release-local Preset/Skill路径、process state与端口。这两个命令不调用`agentPreset.list`。
- Host运行后，running `status`在process state、PID identity与端口均确认后调用`agentPreset.list`；`health`只有在自己的process检查通过后调用该接口。process state缺失、PID identity不匹配或非受管进程占用端口时，两条命令不得发送roster RPC。在线roster只验证唯一项目Preset的ID、`user` trust、默认状态与`broken`缺失，不承担路径验证。

上述四条命令都不创建Session。真实Session只在Preset mount验收与后续工作台流程中创建。

## Ticket责任调整

| GitHub Issue | 必须增加的责任 |
| --- | --- |
| Ticket 15 / GitHub附加Issue | 定义并安装 `harness-comfyui` Preset；提供 Agent-plane Tool plugin export；把统一项目 Tool registry从 Host根作用域迁入 Preset scope；验证 Preset roster、mount失败关闭与非目标 Preset隔离。 |
| Ticket 16 / GitHub附加Issue | 创建产品 Session时显式传入 `agentPreset: "harness-comfyui"`；恢复时核对持久 Preset ID；用真实 idle Agent完成消息发送与流式响应验收。 |
| #4 / Ticket 03 | 在项目 Agent scope注册首批 Catalog Tool；验收指定 Agent的 Tool schemas，而不是只查看全局 registry。 |
| #5 / Ticket 04 | 在同一项目 Agent中完成 `/comfyui-generate` Skill Invocation、`generate_with_comfyui` Tool Call与 Tool Result；验证其他 Preset不可见。 |
| #6 / Ticket 05 | 在同一项目 Agent scope补齐十个 Catalog Tool并验证完整 allowlist。 |
| #13 / Ticket 12 | 通过同一项目 Agent的 filesystem provider发现三个迁移 Skill；验证原生 `/`菜单与 Host重新校验读取同一 scope catalog。 |
| #14 / Ticket 13 | 从 Release Artifact创建指定项目 Preset的真实 Session，完成全部 Skill/Tool链路与错误分支验收。 |

## 必需验收

1. `preflight`与停止态`status`在Host不存在时完成静态文件检查且不发送`agentPreset.list`；running `status`与`health`分别从运行中Host取得状态正常的`harness-comfyui` roster记录。
2. `sessions.create({ agentPreset: "harness-comfyui" })` 返回相同的 resolved Preset ID，Session header保存该 ID。
3. Preset任一必需 row无法挂载时，Session创建失败且Agent不发布。
4. 项目 Agent的 `ctx.tools.schemas(agentScope)`只包含计划允许的 model-facing Tool集合。
5. `standard`、`minimal`或测试 Preset的 Agent看不见只在 `harness-comfyui` scope注册的项目 Tool。
6. 项目 Agent能从当前 release的`package/skills`发现`comfyui-generate`与三个迁移 Skill；`standard`与测试Preset不能从默认Skill roots发现这些项目Skill。
7. 原生 `/`菜单、`dsh-tool-skill` Skill catalog、`agent/pre-step` Skill Invocation与Skill正文加载使用同一 Session和Preset scope。
8. 一次真实消息形成原生 Skill Invocation、Tool Call、Tool Result与异步 Run状态；不得用直接调用 Tool adapter替代Agent验收。
9. Preset mount失败、Skill provider失败、Skill不存在、Tool不在Agent scope与Tool执行失败分别产生可区分的错误证据。

## 计划落点

本调研结论由Ticket 15与Ticket 16分别落地：Ticket 15交付项目Preset、Agent-scope Tool注册和隔离Skill root；Ticket 16在三列工作台完成后交付项目Session创建、筛选与恢复。两个Ticket都使用rc.8公开机制，不修改Harness核心代码。
