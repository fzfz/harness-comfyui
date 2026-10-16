---
文档用途: 记录配置规范文档的独立逐行语义审计结果。
读取时机: 修改 docs/system/configuration.md 时读取。
---
# configuration.md 语义审计

## 审计范围与覆盖结论

1. 本次审计仅读取 `docs/system/configuration.md`，覆盖第 1—150 行。除下列需修改项外，其余行在本次文字规范审计中通过；本次结论不确认代码实现与文档描述是否一致。

## 需修改项

### 1. 第 1 行：补全文档用途与读取时机

1. 独立理解及理由：文档当前直接以标题开始，缺少规定的 YAML 字段，读者无法从文档入口明确何时读取这些配置规则。
2. 在标题前插入：

```yaml
---
文档用途: 说明 Harness-ComfyUI 插件的配置入口、字段来源、覆盖顺序和生效时机。
读取时机: 配置插件、调整环境变量或定位配置错误时读取。
---
```

### 2. 第 5—7、19—21 行：先区分官方 Profile 与 Configuration Profile

1. 独立理解及理由：第 5 行已经使用 `Configuration Profile`，但第 19 行只提供同名标题，未解释该名称与官方 Profile 的区别。两种配置都称为 Profile，后文“当前 Profile”容易产生指代歧义。
2. 将第 5—7 行替换为以下文字；后文继续使用这两个完整名称区分配置对象：

```markdown
1. 官方 Profile 指官方 Harness 保存插件配置与设置的配置对象。Configuration Profile 指本项目由 `config/base.json` 和 `config/profiles/<name>.json` 组成的业务配置；当前可选名称为 `production`。
2. 官方 Harness 按 bundle、官方 Profile、home、invocation 的顺序合并插件配置，后续层覆盖较早层的同名字段；官方 Profile 中的 `config` 整体替换此前的对象。Host 插件接收合并结果，并按“Configuration Profile”一节加载业务配置。
3. `config/schema.ts` 定义业务配置字段与范围，`config/environment-overrides.json` 定义可接受的 `HARNESS_COMFYUI_*` 环境变量。
```

### 3. 第 9—17、29—60、68—77、85—123、127—150 行：使用有序列表组织同层级说明

1. 独立理解及理由：除第 23—27、81 行外，正文说明与字段表基本以未编号段落组织，未满足使用有序列表组织标题下同层级内容的要求。
2. 必要修改：将各节中的独立说明段落组织为有序列表；字段表放入对应列表项并缩进。第 107—115 行应先按第 8 项压缩，再组织列表，避免仅给长段落添加编号。

### 4. 第 15、33—38、60、62 行：删除重复定义与未定义的存储名称

1. 独立理解及理由：数据根目录默认值在第 15、33 行重复；缓存目录约束在第 15、34、62 行重复；环境变量映射的唯一来源在第 29、60 行重复。第 35—38 行还引入未定义的 `Plugin Storage`，而同一组字段已经有明确的 `paths.dataDir`。
2. 第 33—38 行替换为：

```markdown
| `paths.dataDir` | 插件业务数据根目录；默认值与官方 Profile 覆盖规则见“官方插件配置层”。 |
| `paths.apiWorkflowCacheDirectory` | Official API Workflow Cache 目录；默认值与目录约束见“官方插件配置层”。 |
| `paths.runRepositoryFile` | Run Repository SQLite 文件路径。 |
| `paths.runDirectory` | Run 文件目录。 |
| `paths.savedMediaDirectory` | Saved Media 目录。 |
| `paths.logDirectory` | 插件 Host 日志目录。 |
```

3. 第 15 行中“其他默认目录来自”改为“存储路径默认值来自”，使读者能够从该处查找文件路径与目录路径。
4. 第 60 行第一、二句删除不替换；第 62 行末句删除不替换。环境变量名称、目标字段与类型继续从第 29 行指定的结构化来源查阅。

### 5. 第 48、58 行：配置说明中包含浏览器执行流程

1. 独立理解及理由：第 48 行在尝试次数字段中列举错误分支、页面就绪条件和导出判断，已经承担运行实现说明的职责；第 58 行继续列举进程启动与固定命令行参数。读者选择字段值时只需知道次数含义与作用阶段。
2. 第 48 行替换为：

```markdown
| `comfyui.frontendCompiler.preReadiness.infrastructureAttempts` | 同一次缓存未命中时，在前端就绪检查开始前允许尝试的浏览器会话总次数；允许值与默认值分别见 `config/schema.ts` 和 `config/profiles/production.json`。 |
```

3. 第 58 行删除不替换。若运行维护确实依赖这些细节，应由运行职责对应的文档或代码入口承载，本配置文档只保留其索引。

### 6. 第 60 行：删除配置退役过程并拆出有效信息

1. 独立理解及理由：“已不再”“退役变量”描述迁移过程，且对三个变量单独重复第 29 行的声明约束。段末又从业务配置跳到 Desktop probe，当前段落同时承担环境校验、Skill 加载、服务设置和测试凭据四种职责。
2. 第 60 行整体替换为：

```markdown
1. Host 拒绝接收 `config/environment-overrides.json` 未声明的 `HARNESS_COMFYUI_*` 环境变量。维护者依据报错变量名，从传入 Host 的环境中移除对应变量。
```

3. 与第 29 行合并保留一次变量接收规则；Skill 加载句删除不替换，数据源设置与 CLI listener 句分别由对应专节承载。Desktop probe 凭据说明应单列“Desktop probe 凭据”标题，并保留以下有序列表项：

```markdown
1. 官方 Desktop development probe 从 main checkout 的 `.env` 读取 `config/desktop-e2e.json` 声明的凭据变量，并仅向本轮应用传入这些凭据变量。
```

### 7. 第 81 行：明确预设范围与地址一致性要求

1. 独立理解及理由：“两个 ComfyUI 预设”没有给出名称或定位入口；“同一目录数据”不能明确要求的是相同地址、相同服务还是相同数据。配置执行者无法仅据该句核对两个入口是否一致。
2. 在当前文件已有信息范围内，完整替换为：

```markdown
1. ComfyUI 预设通过 `agent-presets/noobai-mcp.cordis.yml` 配置 NoobAI MCP，应用进程通过环境变量 `NOOBAI_MCP_TOKEN` 提供凭据。维护者须确认 NoobAI MCP 与 Host 数据源服务访问同一份目录数据。
```

### 8. 第 105—115 行：图片读取配置章节过度复述状态与持久化实现

1. 独立理解及理由：这些段落逐步说明草稿状态、索引替换、凭据临时引用、失败回查、临界区、取消信号和错误传递载体。大量实现步骤不属于配置字段或配置使用说明；它们增加配置文档与实现产生分歧的维护风险。需要保留的是使用者能观察到的保存、切换、删除与生效规则。
2. 第 105—115 行完整替换为：

```markdown
1. 用户在设置页选择已保存配置后，该配置立即用于下一次图片读取。新建或复制的草稿需要保存后才能使用，离开设置页会丢弃未保存的草稿。
2. 用户保存草稿时，设置页同时提交最终需要激活的配置。保存草稿与激活配置作为一次操作生效。
3. OpenAI 兼容配置支持保留、清除和替换 API Key；官方凭据服务保存 API Key，设置页通过 `hasApiKey` 显示保存状态。凭据来源为只读时，用户需要先调整凭据来源，才能替换或清除凭据、删除对应配置或将其改为 runtime 配置。
4. 删除配置后至少保留一份已保存配置。删除活动配置时，Host 激活原列表中的后一份配置；原配置位于列表末尾时，Host 激活前一份配置。
5. 图片读取配置的保存与校验实现见 `src/image-reader/settings.ts`，凭据引用前缀见 `config/image-reader-runtime.json` 的 `credentialReferencePrefix`，错误原因与操作指引见 `config/error-catalog.json`。
```

### 9. 第 119—123 行：分开默认提示词、卸载期限与诊断来源

1. 独立理解及理由：标题只包含默认提示词与阶段诊断，但第 121 行又解释插件卸载；该行还逐项复述日志时间计算和响应解析顺序。第 119 行“内置配置采用事实观察用途”没有说明具体配置动作，删除后不影响默认值与覆盖顺序的理解。
2. 第 119 行删除“内置配置采用事实观察用途。”，其余默认值及覆盖规则保留。
3. 第 121 行替换为：

```markdown
1. `config/image-reader-runtime.json` 的 `diagnosticLogFormat` 定义 Host 阶段日志格式，`src/image-reader/diagnostics-schema.ts` 定义日志字段。维护者依据这两个来源读取图片请求的阶段诊断信息。
```

4. 将关闭期限说明放入第 144 行标题下，替换第 150 行的跨主题引用：

```markdown
1. 图片读取插件卸载时，Host 取消活动请求，并等待 `shutdownTimeoutMs` 指定的期限；到期后报告仍未结束的请求。`config/image-reader-runtime.json` 提供默认值，插件配置中的同名字段覆盖该值，`src/image-reader/plugin-schema.ts` 负责校验。
```

5. 第 123 行删除不替换；错误原因与操作指引的查阅入口由第 8 项替换文字统一提供。

### 10. 第 127、142 行：区分角色配置与调度调用说明

1. 独立理解及理由：第 127 行文件路径与字段名未使用代码格式，`../project-iteration-dispatch.mjs` 的相对基准也不明确。第 142 行后半段介绍首次调用、续派、消息组装与子任务通知，超出“角色配置”的职责，并使用未明确指代的 `component`。
2. 第 127 行替换为：

```markdown
1. `agent-presets/harness-comfyui-iteration/agent.cordis.yml` 中的 `composition-agent`、`generation-agent`、`observation-agent` 和 `comparison-agent` 均加载 `agent-presets/project-iteration-dispatch.mjs`。各角色的 `config` 字段如下。
```

3. 第 142 行替换为：

```markdown
1. `agent-presets/harness-comfyui-iteration/agent.cordis.yml` 中 ID 为 `persona` 的配置项通过 `config.prefix` 定义主 Agent 的调度与交付职责。
```

### 11. 第 148 行：删除 CLI 字段规则的重复解释

1. 独立理解及理由：监听地址、端口分配方式与关闭等待期限已经分别由第 54—56 行定义；本节再次解释同一组规则。末句“Host 停止后释放 listener”不提供配置操作或查阅入口。
2. 第 148 行替换为：

```markdown
1. `config/base.json` 提供 `cliServer` 的默认配置，`config/schema.ts` 负责校验；字段用途见“Configuration Profile”。
```
