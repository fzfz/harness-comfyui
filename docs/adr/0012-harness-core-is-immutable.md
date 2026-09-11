---
status: accepted
---

# Harness core is immutable

Harness ComfyUI 通过 config/desktop-baseline.json 指定的 DeepSeek Harness 包提供的公共 package export、Cordis composition、Client slot 和 service 接口接入 Host 与 Web Client。`/Volumes/4Tdisk/work/AI2/deepseek-harness` 中的源码不是本项目的构建输入或运行依赖。

Session、Agent、Tool、Skill 和持久日志的权威实现必须由宿主包提供；Harness ComfyUI 插件必须通过宿主公共接口调用这些能力。插件目录只保存本项目业务实现，宿主实现必须从已安装包的公共 package export 解析。宿主适配补丁由自有 Desktop 仓库维护，Harness ComfyUI 通过 config/desktop-baseline.json 选择包含这些补丁的固定提交。

根 `package.json.exports` 直接公开当前项目的 `src/index.ts` 和 `src/client/index.tsx`。根 `cordis.patch.yml` 只通过公共 composition 插入项目 Host plugin；项目 Client plugin 只通过 `package.json.dsh.client` 进入 Web composition，并且不替换上游 `ui-layout`。

项目 Client plugin 通过公开 Client service 向 `sidebar.footer.action`、`conversation.input.dock` 和 `sidebar.right.pane.tab` 注册项目内容。Harness 原生`ui-layout`继续负责页面布局；项目不替换root、sidebar、conversation或composer，也不提供第二套Session、conversation projection、输入、Skill菜单、主题或布局权威状态。

项目 Host plugin 只通过 `src/host/tools/register-project-tools.ts` 注册项目 Tool。`ComfyUI工作台预设` 通过 Harness 原生文件系统 Skill provider 的 `customSkillDirs` 读取当前 checkout 的 `.agents/skills`，并通过 `includeDefaultRoots: false` 使只有最终采用该 Preset 的 Session 可以读取 Repository Skills。项目不注册其他 Skill provider，也不提供自有 Skill 列表 RPC。

上述边界由 `pnpm check:harness-boundary`、类型检查、合同测试和集成测试验证。
