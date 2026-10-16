---
文档用途: 记录目录 MCP 迁移中配置、预设与指定测试的独立代码审阅结果。
读取时机: 修正配置与测试遗漏、执行 Desktop 验收和提交候选改动前。
---

# 配置与测试审阅

## 1. 审阅范围与验证结果

1. 本次审阅以提交 `57bd76d522a3a88c7b153bd78b5be4691dc8bd33` 为基线，覆盖两个项目 `agent.cordis.yml`、共享 `noobai-mcp.cordis.yml`、`config/plugin-runtime-resources.json`、`config/desktop-e2e.json` 和委派指定的三个测试文件。
2. 已执行 `pnpm exec vitest run tests/production/official-agent-preset-resources.test.mjs tests/production/plugin-build-presets.test.mjs tests/contract/prompt-builder-generation-output-references.test.mjs --maxWorkers=1 --no-file-parallelism`，结果为 3 个文件、35 项测试通过。
3. 当前共享 MCP 文件可被两个预设的相对 include 解析，插件包包含该文件，四份已删除参考文件已从资源清单移除。Desktop 初始模型 ID 与模型声明 ID 均为 `thinkingmachines/inkling:free`。
4. 已核对 `.local/skills-mcp-migration-desktop.log:25–66`：官方 Desktop lifecycle 和 live 两项测试均在创建工作台预设会话时收到 `agent-preset/invalid`，原因为 `mcp-client(noobai): initial connection or tool synchronization failed`。该次 Desktop 门禁共 260 项通过、3 项失败。
5. 同次运行的另一项失败来自 probe 测试中保留的初始模型断言。修正后的独立 probe 日志 `.local/skills-mcp-migration-probe-tests.log:5–6` 显示 47 项通过。MCP 接入修正后仍需重跑 Desktop 门禁，模型调用与子会话工具继承仍需完成对应验收。

## 2. 确定遗漏

### 2.1 Desktop 业务夹具缺少新增 MCP 依赖的接入

1. 位置：`agent-presets/noobai-mcp.cordis.yml:6`、`:8`、`:10`；两个项目 `agent.cordis.yml:2`；`config/desktop-e2e.json:12`。
2. 当前两个项目预设均加载固定本机地址的 MCP 客户端，使用 `NOOBAI_MCP_TOKEN`，并要求启动失败时报错。`tests/desktop/run-desktop-tests.mjs:75–80` 从测试进程环境删除配置列出的凭据；`tests/desktop/official-desktop-live.test.mjs:515–518` 又将凭据清单替换成业务夹具的模型密钥，`:1599–1601` 写入的独立环境文件也只有该密钥。
3. `tests/desktop/official-desktop-live.test.mjs:1826` 继续创建并验证产品预设会话，但本轮改动没有为该路径提供 MCP 凭据或 MCP 服务夹具。因此，完整 Desktop 门禁目前没有自包含的 MCP 启动条件；带认证的本机服务会收到缺失凭据形成的请求，服务未启动时则无法建立连接。
4. 风险等级：P1，官方应用中的会话创建失败已复现。`.local/skills-mcp-migration-desktop.log:26–34` 记录 lifecycle 在 `createLifecycleSession` 失败，`:38–66` 记录 live 在工作台会话创建断言失败；两项均报告 MCP 初始连接或工具同步失败。配置路径证明业务夹具缺少 MCP 启动依赖；日志尚不能区分服务不可达、认证失败或工具同步失败的底层原因。
5. 建议：为 Desktop 业务夹具提供受控 MCP 服务与夹具凭据，通过测试配置连接该服务，并在两个项目预设内验证工具发现。真实目录服务与真实凭据的验收继续由 development probe 执行。

## 3. 判断建议

### 3.1 将配置文本断言与运行行为验收分开

1. 位置：`tests/production/official-agent-preset-resources.test.mjs:76–86`、`tests/production/plugin-build-presets.test.mjs:56–57`。
2. 当前测试解析 YAML 并匹配 `Authorization` 源码字符串；它们没有执行 Cordis 表达式、发起 MCP 请求或观察 Tool Registry。因此，这些测试通过只能证明声明与包内资源符合预期，无法证明动态凭据和 `local-only` 下的工具调用生效。
3. 建议：保留资源层的结构断言，在官方应用验收中记录两预设的工具发现、一次实际调用，以及缺失凭据、无效凭据和连接恢复的结果。行为断言应依据实际请求与工具集合。

### 3.2 删除打包测试中已被字节一致性覆盖的重复断言

1. 位置：`tests/production/plugin-build-presets.test.mjs:55–57`。
2. 第 55 行已断言包内共享文件与源码完全一致；源码测试已核对服务名与认证表达式，第 56、57 行再次检查相同内容，增加了格式调整时需要修改的位置。
3. 建议：打包测试保留两个 include 可解析和包内文件字节一致性的断言，源码测试承担 MCP 字段与认证表达式的结构断言。该简化保持当前测试覆盖的行为。
