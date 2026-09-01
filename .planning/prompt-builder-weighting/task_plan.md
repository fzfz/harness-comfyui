# Prompt Builder 权重校验调研计划

## 必须要实现的目标

- 计划编写者必须定位 ANIMA 与 WAI Prompt Builder 的权重文档、校验器和测试缺口。
- 计划编写者必须核对 ComfyUI 权重语法与 ANIMA 模型专用权重说明。
- 计划编写者必须同时设计 tag 校验修复和槽位权重理论、方法与规范。
- 计划编写者必须在用户批准前保持两个 Prompt Builder 的实现、测试、版本和生产环境不变。

## 阶段状态

| 阶段 | 状态 |
| --- | --- |
| 建立独立 worktree | complete |
| 定位两个 Skill 与校验器 | complete |
| 核对权重语法和模型差异 | complete |
| 复现当前校验行为 | complete |
| 编写实施方案 | complete |
| 独立语义审查第一轮 | complete |
| 独立语义审查第二轮 | complete |
| 独立语义最终复核 | complete |
| 提交方案并等待用户批准 | complete |

## 验收清单

- [x] 方案列出两个 Prompt Builder 的准确目录、文档和脚本。
- [x] 方案定义普通 tag、画师 tag、未加权、默认权重、显式权重和非法结构。
- [x] 方案为 ANIMA 十二槽与 WAI 十五位置分别定义权重方法。
- [x] 方案列出自动化测试、真实模型验收和发布边界。
- [x] 独立语义 Reviewer 确认第一轮阻断问题已经关闭。
- [x] 独立语义 Reviewer 确认 JSON 属性、后置审查和 WAI 画师字符合同问题已经关闭。
- [x] 用户批准前没有修改产品实现。

## 实施阶段状态

| 阶段 | 状态 |
| --- | --- |
| 同步 `origin/main` 与确认目标版本 | complete |
| 编写自动化测试与两个校验器 | complete |
| 编写两个 Skill 的权重策略与语义文档 | complete |
| 执行目标测试和 Skill 静态校验 | complete |
| 完成三项独立审查 | complete |
| 完成真实 Desktop 模型验收 | complete（6/6 通过，记录已成文） |
| 更新版本与发布文档 | complete，W3 修复复验与 v0.38.3 主线整合均已记录 |
| 执行合并候选完整质量门禁 | complete（626/27/115/32/2） |
| 完成合并后最终三项独立审查 | complete（Standards、Spec、Semantic 均无阻断问题） |
| 对最终候选树无修改复跑质量门禁 | complete（626/27/115/32/2，完整审计四级均为 0） |
| 提交、推送、发布和生产部署 | pending |

## 非本次目标

- 本次调研不修改 Prompt Builder Skill、校验器、测试、版本或生产环境。
- 本次调研不改变槽位数量、槽位职责、模型、LoRA、Workflow 或 Generation Run 合同。
- 本次调研不安装依赖，不启动 Desktop，不发布版本。

## 已获得的授权

- 用户已授权创建独立 worktree、执行只读调研、运行本地校验器复现和编写实施方案。
- 用户已授权把槽位权重理论、方法与规范加入方案。
- 用户已通过“批准完整方案”授权修改、测试、提交、推送、发布和生产部署。

## 错误记录

| 错误 | 处理结果 |
| --- | --- |
| 第一次追加用户补充范围时，补丁原文与文件内容不一致 | 重新读取后使用准确原文 |
| 仓库没有 `data/` 目录 | 使用仓库源码、测试夹具和权威外部资料，不假定运行时 Catalog 数据位于 worktree |
| `stop-that-shit` 清单指向的 0.1.0 文件不存在 | 读取本机 0.2.0 说明并保持只读范围 |
| zsh 循环变量误用特殊变量 `path` 导致命令搜索路径失效 | 新 shell 使用 `candidate_file` 变量完成相同只读检查 |
| `planning-with-files` 默认根文件与仓库既有跟踪文件冲突 | 把本次记录迁入 `.planning/prompt-builder-weighting/`，恢复根文件到 worktree 基线 |
| 独立 worktree 尚未由 `dev:start` 链接 `node_modules`，`pnpm vitest` 找不到命令 | 不安装或复制依赖；首次改用主 checkout Vitest 后发现 ESM 仍从 worktree 解析依赖，改为按照 worktree 规范运行 `dev:start` 建立链接 |
| 一个 `apply_patch` 同时删除并新增同一路径时被工具拒绝 | 把 WAI 新文档与普通更新作为一组补丁，把两个完整文件的替换分别作为后续补丁 |
| 更新两个规划文件的补丁在文件切换前包含空 hunk 标记 | 删除空 hunk 标记后按准确上下文重新应用补丁 |
| `computer-use` 的 Sky 服务启动请求失败 | 不重复触发失败服务；改为调查开发 Desktop 的本地 Session 接口和既有验收路径，只有实际 UI 操作不可替代时再报告环境阻塞 |
| 开发 Desktop 的全局 Prompt Builder 链接按项目规范解析到主开发 checkout，不读取 linked worktree 候选 | 不改写全局链接；候选通过修复复核后先创建可追溯候选提交，再按项目既有 canonical Skill 验收流程把主开发 checkout 快进到该提交 |
| 当前 `ComfyUI工作台预设` 只向模型公开 Skill 与 Bash，没有公开 `run_skill_script` Tool | 真实验收记录如实记录模型以前台 Bash 调用 Skill 自带 `scripts/validate-output.mjs` 的命令、标准输入、退出码、标准输出和标准错误；不虚构不存在的 Tool 调用 |
| Browser 验收页面中的第二轮校验器卡片首次因工具调用列表折叠而未匹配 | 先展开该轮工具调用列表，再读取准确的校验器命令、标准输入与标准输出；该错误没有改变 Desktop 会话状态 |
| 查询版本引用时使用了不存在的 `CHANGELOG*` 与 `RELEASE*` glob，zsh 在执行 `rg` 前报告 `no matches found` | 改为只查询仓库中实际存在的 `package.json`、`README.md`、`docs/releasenotes.md` 和 `docs/system/*.md`；没有修改任何文件 |
| 开发 Desktop 前台进程在执行计划要求的 `pnpm dev:stop` 后以 `SIGTERM` 和生命周期退出码 1 结束 | `pnpm dev:stop` 返回受管状态 `stopped`，第二个终端的 `pnpm dev:status` 再次确认 `stopped`；该退出是受管停止产生的预期前台进程结果 |
| 第一次完整 `pnpm quality` 的两个真实 Desktop 测试在导入阶段找不到共享 DSH `node_modules` 中的两个入口 | 其余 626 项 unit/integration、27 项 contract/security、115 项 production 和 32 项 prototype 测试已经通过；共享 DSH 依赖当时正处于另一个已批准任务的准备窗口，当前该任务已确认 fresh `npm ci` 完成、共享 checkout 稳定且不会再修改；后置语义审查通过后重新运行完整最终门禁 |
| 后置 Semantic Reviewer 发现 W3 把合法 UI Style 来源画师权重误写为用户明确权重 | 修正 W3 的预期与结论；相同 WAI Session 已原样重新执行 W3，模型明确区分合法 UI Style 来源与用户来源，校验器再次成功；后置复核确认 W3 修复与复验字段通过 |
| 后置 Semantic Reviewer 发现发布文档提前使用质量门禁完成式，并发现 `progress.md` 的早期调研状态没有限定时间范围 | 合并候选完整 `pnpm quality` 已单次连续通过；发布说明与测试规范据此改为完成式，`progress.md` 已把旧状态明确限定为只读调研阶段 |
| 发布前远端核对发现并发任务已经发布 `v0.38.2` | 把权重修复提交重放到 `origin/main@8a2b829`，保留 v0.38.2 的 OpenCode Go 目录修复与 DSH Desktop 固定提交，并把本次实际版本顺延为 `v0.38.3` |
| 合并后第一次完整 `pnpm quality` 在 engineering baseline 的版本断言处失败 | `package.json.version` 已顺延为 `0.38.3`，同步把 `tests/contract/engineering-baseline.test.ts` 的唯一版本断言更新为 `0.38.3`；失败前 626 项 unit/integration、覆盖率与完整依赖审计均已通过，修正后重新运行合同测试和完整门禁 |
| 合并后第二次完整 `pnpm quality` 的两项 Desktop 测试把 DSH 源路径强制指向当前独立 worktree 中不存在的 `.local/upstreams/dsh-desktop` | 按 `docs/agents/worktree-development.md` 和 `config/desktop-worktree.json.mainCheckoutPath` 恢复既有 worktree 路径解析；production Desktop 测试只替换 `desktopSource`，继续保留 production 启动模式与运行目录，managed shell 测试直接使用完整 development worktree context |
