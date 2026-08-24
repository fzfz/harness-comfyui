---
status: accepted
---

# Harness core is immutable

Harness ComfyUI 通过 DeepSeek Harness `0.1.0-rc.8` 的公共 package export、Cordis composition、Client slot 和 service 接口接入 Host 与 Web Client。`/Volumes/4Tdisk/work/AI2/deepseek-harness` 中的源码不是本项目的构建输入或运行依赖。

项目不得修改 Harness package 源码、导入 `@deepseek-ai/*/src/*`、复制 Harness 内部实现，或替换 Session、Agent、Tool、Skill 和持久日志的权威实现。

根 `package.json.exports` 直接公开当前项目的 `src/index.ts`、`src/client/index.tsx` 和 `src/agent/plugin.ts`。`profiles/cordis.patch.yml` 只通过公共 composition 插入项目 Host plugin 并停用上游 `ui-layout`。项目 Client plugin 只通过 `package.json.dsh.client` 进入 Web composition。

项目 Client plugin 向内建 `root` slot 注册唯一 root occupant，并声明 `sidebar`、`conversation`、`details` 与 `shell.overlay`。项目继续使用 Harness 提供的 Session、conversation projection、输入触发器、Skill 菜单与主题服务，不注册第二套同类权威状态。

项目 Host plugin 只通过 `src/host/tools/register-project-tools.ts` 注册项目 Tool。项目 Agent 只通过 `src/agent/plugin.ts` 和 `agent-presets/harness-comfyui/` 接入 Harness Agent 生命周期。

上述边界由 `pnpm check:harness-boundary`、类型检查、合同测试和集成测试验证。
