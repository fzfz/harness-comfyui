# Prompt Builder 权重校验调研结论

## 代码结论

- 两个目标 Skill 是 `.agents/skills/anima-prompt-builder/` 与 `.agents/skills/wai-sdxl-prompt-builder/`。
- ANIMA 校验器只在画师前缀检查前尝试剥离一部分权重外层；普通 tag 没有结构化权重校验。
- WAI 校验器只为 `artist` 位置执行结构化权重校验；其余 tag 位置只检查单行非空字符串。
- 当前仓库没有直接覆盖两个 `scripts/validate-output.mjs` 权重分支的自动化测试。

## 文档结论

- ANIMA 输出协议明确禁止 `(tag:1.2)` 并错误地把槽位顺序称为隐式权重。
- WAI 文档要求每个画师强制使用 `(payload:weight)`，但没有为普通 tag 定义同一合同。
- 两个 Skill 的槽位体系都没有定义何时加权、数值档位、冲突处理和叠加限制。

## 权威资料结论

- ComfyUI 官方 `CLIPTextEncode` 文档支持 `(text:weight)`，支持 `(text)` 默认 `1.1`，并规定字面圆括号转义。
- ComfyUI 官方解析器没有 `0.25` 至 `1.5` 的平台级范围。
- ANIMA 官方模型卡明确说明 Prompt weighting 有效、通常需要高于 SDXL 的数值，并给出 `(chibi:2)`；ANIMA 画师需要 `@` 前缀。

## 当前行为复现

- ANIMA 错误接受 `(blue hair:abc)`、嵌套权重和 `@(@fukahire:1.2)`。
- WAI 错误接受普通 `(blue hair:abc)` 和嵌套权重，只对 `artist` 应用范围与格式检查。
- WAI 当前拒绝未加权画师并拒绝 `2.0` 画师权重。

## 方案边界

- 修复保持 ANIMA 十二槽与 WAI 十五位置的名称、职责和顺序不变。
- 修复为每个 Skill 增加 Skill 内 JSON 策略和 Markdown 方法，校验器读取 JSON，不解析 Markdown。
- 修复不增加依赖，不修改生成链路、Catalog、Workflow 或生产配置。
- 实施开始时 `origin/main` 已经发布 `v0.38.1`，因此本次修复的目标版本是 `v0.38.2`。
- `v0.38.1` 的五个新增提交没有修改两个 Prompt Builder Skill 或校验器；目标实现接口与调研结论保持一致。
- ANIMA 校验器当前把固定质量前缀保存在脚本常量中，并使用 `stripWeight()` 只辅助画师前缀检查；实现时必须把固定质量前缀与统一权重语法改为读取 ANIMA Skill 自带 JSON 策略。
- WAI 校验器当前把 `CANONICAL_WEIGHT`、`0.25` 和 `1.5` 硬编码在脚本中，并只在 `artist` 分支调用 `validArtistFragment()`；实现时必须删除这些画师专用数值限制，让十四个 tag 位置使用同一解析器。
- ANIMA `SKILL.md` 当前在 Style 规范化时先反复删除段首 `@`，该流程无法正确处理 `(@artist:weight)`；实现时必须先解析合法外层，再规范化 payload 的单个 `@`，最后恢复原权重词法。
- WAI `references/prompt-position-rules/artist.md` 只把格式责任路由到 `wai-artist-syntax.md`，没有数值副本，不需要修改。
- WAI 默认质量内容当前由 `references/prompt-position-rules/quality.md` 保存。由于新 JSON 策略包含同一内容，实施时必须把该规则文件改为读取 `recommendations.unweighted_quality.content`，避免产生第二个运行来源。
- 仓库单元测试使用 Vitest 4.1.8，并允许测试直接导入 `.mjs` 模块；CLI 分支可以通过 Node `spawnSync` 向校验脚本传入标准输入并断言退出码、stdout 和 stderr。
- `package.json` 当前版本为 `0.38.1`，Node 引擎为 `^22.19.0 || >=24.0.0`；JSON 策略读取可以使用 Node 内置 `readFileSync(new URL(..., import.meta.url))`，不需要新增依赖。
- 权重方法文档已避免复制模型推荐数值；方法只引用 `recommendations.levels.*` 属性，纯语法说明中的数值必须明确标注为字符格式示例。
- WAI `references/prompt-position-examples/quality.md` 仍把默认质量段写成字面量，必须改为读取 JSON 属性，才能让质量段定义保持单一来源。

## 独立语义审查结论

- 第一轮审查确认实施方向覆盖用户要求，但要求计划补全 weight 十进制文法、payload 转义规则、WAI 画师语义责任边界、JSON 推荐数值单一来源和真实 Desktop 模型验收记录合同。
- 修订后的方案规定校验器只执行确定性结构检查；Skill 执行者与 Semantic Reviewer 负责 WAI 画师来源语义检查。
- 修订后的方案规定每个 Skill 的 `prompt-weight-policy.json` 是该 Skill 推荐数值的唯一结构化来源；受影响的 Skill Markdown 只引用策略属性名。
- 修订后的方案规定真实 Desktop 验收使用当前产品默认 Agent 配置，并把六个用例的输入、读取文件、脚本调用和结果写入可提交的验收记录。
- 第二轮审查要求方案定义两个 JSON 的准确属性标识符，并要求真实模型验收记录在最终门禁前接受后置独立语义审查。
- 第二轮审查确认现有 WAI 画师合同允许其他可见字符；修复方案不得新增逗号限制，也不得使用字符规则代替画师来源语义判断。

## 实施候选结论

- 两个 Skill 的策略文件使用相同权重词法结构，并分别定义 ANIMA 与 WAI 的位置集合、默认质量内容、推荐档位和自主强调数量。
- ANIMA 的前十一槽和 WAI 的前十四位置统一接受未加权、默认权重和显式权重形式；两个关系文本位置继续使用原有句子合同，不进入 tag 权重解析器。
- 两个校验器逐字符保留合法 weight 词法，拒绝非 ASCII 十进制、非正数、非有限数值、未知转义、末尾反斜杠、嵌套定界符和多个未转义冒号。
- ANIMA 画师先解析权重外层，再规范化 payload 的单个 `@` 前缀；WAI 画师与普通 tag 使用同一个格式解析器，画师身份和来源仍由 Skill Agent 语义确认。
- 定向 Vitest 共包含 76 项并全部通过；两个 Skill 的 `quick_validate.py` 静态检查通过；当前候选树的 `git diff --check` 通过。

## 第一轮实施审查与修复

- 两个解析器原先使用原始字符串末尾判断权重外层，导致 bare payload 末尾的合法 `\)` 被误判为未闭合外层；修复后的解析器从左到右消费转义对，再判断末尾右括号是否未转义。
- WAI 校验器原先没有读取 `recommendations.unweighted_quality` 执行默认质量内容的未加权门禁；修复后的校验器从 JSON 读取位置名和内容集合，拒绝这些 payload 的默认或显式权重外层，同时继续允许其他质量 payload 合法加权。
- 两个权重方法原先只统计自主设计权重，遗漏合法 Style 或 Character 来源权重；修订后的规则统计除用户明确提供权重以外的全部高于中性强度决定。
- 新增回归分支后定向测试从 76 项增加至 82 项，当前全部通过。
- ANIMA 的 Style 处理必须区分逗号分段外部空白和权重外层内部空白；前者在解析前删除，后者继续由权重语法拒绝。
- WAI 的来源采用阶段只记录 payload、来源形式、weight 原文和主要或辅助作用；最终外层必须在冲突与去重完成后按照来源优先级一次性生成。

## 修复复核结论

- Standards 修复 Reviewer 确认转义端点、WAI 默认质量 JSON 门禁、公开函数与 CLI 回归测试没有剩余阻断问题。
- Spec 修复 Reviewer 确认非用户来源强调预算、默认质量边界和修复范围符合批准方案。
- Semantic 修复 Reviewer 确认 ANIMA Style 分段空白边界、两个 Skill 的全部 payload 遍历、来源 weight lexeme 保留、一次性最终外层和强调预算统计口径没有剩余阻断问题。
