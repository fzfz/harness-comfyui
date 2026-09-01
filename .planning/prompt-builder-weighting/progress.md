# Prompt Builder 权重校验调研进度

## 2026-09-01

- 已读取项目 AGENTS 规范、Skill 开发规范、worktree 开发规范、测试规范、发布规范和技术栈。
- 已读取 `planning-with-files`、`skill-creator` 与 `find-docs`。
- 已从本地 `origin/main@b3643feea960ab94bca9c260c12bde0d76ded997` 创建独立 worktree 和分支 `codex/plan-weighted-tag-validator`。
- 已读取两个 Prompt Builder 的主文件、权重相关参考文件和两个校验脚本。
- 已通过 Context7、ComfyUI 官方文档、ComfyUI 官方源码和 ANIMA 官方模型卡核对权重行为。
- 已执行两个本地校验器的只读输入矩阵并记录当前错误接受、错误拒绝与错误消息。
- 已完成 `.planning/prompt-builder-weighting/implementation-plan.md` 初稿。
- 独立语义 Reviewer 第一轮提出四项阻断问题：weight 与 payload 的词法边界不完整、WAI 画师语义责任与脚本责任冲突、JSON 推荐数值单一来源约束不完整、真实 Desktop 模型验收记录不可复核。
- 已修订实施方案，明确 ASCII 十进制文法、逐字符转义与冒号合同、WAI 画师语义责任、JSON 推荐数值单一来源、真实 Desktop 固定配置和验收记录字段。
- 独立语义 Reviewer 第二轮确认第一轮七项问题均已获得实质修订，并提出三个新阻断问题：验收记录缺少后置语义审查、JSON 属性标识符未定义、WAI 画师 payload 新增逗号限制会改变现有合同。
- 已在方案中定义两个 JSON 的准确字段路径、层级、类型和值，增加真实验收后的独立语义审查，删除 WAI 画师 payload 的新增逗号限制并增加兼容性测试。
- 独立语义 Reviewer 最终复核确认第二轮三个阻断问题均已关闭，没有发现新的阻断问题。
- 用户已通过“批准完整方案”授权实施、测试、审查、提交、发布和生产部署。
- 已读取本轮适用的 `planning-with-files`、`skill-creator`、`writing-for-agents`、`team-mode` 和 `stop-that-shit`。
- 已把独立分支从调研基线快进到 `origin/main@dfc480d0200b92da9a0027c6cd14f996dd7663b5`；该基线已经发布 `v0.38.1`，本次目标版本顺延为 `v0.38.2`。
- 当前开始编写自动化测试与两个校验器。
- 已新增两个 `prompt-weight-policy.json` 和目标单元测试。
- 首次运行 `pnpm vitest` 因独立 worktree 尚未链接 `node_modules` 而失败；直接调用主 checkout Vitest 时，ESM 仍从 worktree 解析依赖并失败。没有安装或复制依赖，后续按照 `docs/agents/worktree-development.md` 运行 `dev:start` 建立受控链接。
- 已使用 `pnpm dev:start` 在前台启动开发 Desktop，并从第二个终端确认 `dev:status` 为 `running`；该命令建立了受控 `.env` 与 `node_modules` 链接。
- 旧校验器上的目标测试结果为 76 项中 37 项失败，失败覆盖普通 tag 非法权重、可选画师权重、嵌套结构、转义与 CLI 错误合同。
- 已修改两个校验器从各自 JSON 策略读取位置、固定质量内容和权重词法；目标测试现为 76 项全部通过。
- 当前开始编写两个 Skill 的权重理论、槽位方法和关联参考文档。
- 已新增两个 `prompt-weighting.md`，并更新两个 `SKILL.md`、ANIMA 输出协议与自检、WAI 画师语法、格式校验器说明、自检和质量规则。
- 已完成策略属性路径、交叉引用和质量内容单一来源清理。
- 两个 Skill 的 `quick_validate.py` 均返回 `Skill is valid!`；目标 Vitest 76 项全部通过；当前 `git diff --check` 通过。
- 当前进入候选文件主线程复核和三项独立审查。
- 主线程已完整复核两个 Skill 的主文件、JSON 策略、权重方法及全部本次修改的语义参考文件；文档使用 JSON 属性路径引用推荐档位与默认质量内容，没有在运行规范中复制推荐数值。
- 标准审查、规格审查和语义审查三个独立 Reviewer 正在并行检查当前候选树；三项审查均不得修改文件或重复运行广泛测试。
- 已读取既有真实 Desktop 验收记录和项目真实模型验收规范。`computer-use` 的 Sky 服务首次启动失败；当前转为调查开发 Desktop 的本地 Session 接口和已有可复核操作路径，不使用未经计划的替代 Provider、模型或 Preset。
- Standards Reviewer 和 Spec Reviewer 分别发现同一项转义端点缺陷，并补充发现 WAI 默认质量未加权门禁缺失、非用户来源权重未计入强调预算两项问题。
- 已先新增回归测试，旧候选 82 项中 6 项失败；随后修改两个解析器按从左到右的转义对识别未转义右括号，修改 WAI 校验器从 JSON 策略校验默认质量内容，并修订两个权重方法和自检的非用户来源统计规则。
- 修复后定向 Vitest 82 项全部通过，两个 Skill 的 `quick_validate.py` 和 `git diff --check` 通过；当前由两个新的独立 Reviewer 复核修复。
- Semantic Reviewer 发现 ANIMA Style 分段外部空白的清理时机不明确，并发现 WAI 来源权重解析与最终权重生成存在两个执行时机。
- 已明确 ANIMA 的顺序为“逗号分段、删除分段外部空白、解析权重外层、规范化 `@`、恢复合法外层”；已明确 WAI 在来源采用时只记录 payload 与权重信息，冲突和去重完成后才一次性生成最终权重外层。
- 已通过开发 Desktop 的 loopback 页面确认当前环境选择 `ComfyUI工作台预设`、`DeepSeek V4 Flash` 和推理等级 `Default`；Browser 页面连接可用。
- 开发 Desktop 的全局 Prompt Builder 链接按项目规范解析到主开发 checkout，不能指向 linked worktree。候选需要在修复复核通过后先形成可追溯提交，再把主开发 checkout 快进到该提交，才能让真实模型读取候选 Skill。
- 第二轮 Semantic 修复复核发现 ANIMA 仍存在解析后修剪 payload 的冲突指令，并发现两个方法文件的“被标记 payload”步骤和旧完成条件会覆盖来源权重或漏算来源强调。
- 已删除 ANIMA 对权重外层内部 payload 的解析后修剪；两个方法现在遍历全部保留 payload，按照用户权重、合法来源形式、作用与主视觉锚点的顺序一次性生成最终外层，并在完成条件中使用全部非用户权重的统计口径。
- 新的 Standards、Spec 和 Semantic 修复复核均确认没有剩余阻断问题。候选实现与语义文档审查阶段完成。

## 验证记录

- 已确认实施方案列出的现有文件全部存在。
- 已确认 Skill Creator `quick_validate.py` 的本机路径存在。
- 没有运行产品测试、Desktop、发布或部署命令。
