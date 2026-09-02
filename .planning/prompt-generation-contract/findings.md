# Prompt Builder 与 ComfyUI 生图参数合同调研记录

## 2026-09-03：最新基线与 Desktop Skill staging

- 最新实施基线为 `origin/main` 的 `08d54a5ef942a85b4b05a355f1b9b8bf6ac12603`。新基线包含 linked worktree 运行端口隔离、ComfyUI 前端编译隔离和 `v0.38.7` 发布元数据。
- 第一轮 A01 真实 Desktop 请求读取了主开发 checkout 的旧版 Skill。该请求没有调用候选模板检查 CLI，也没有提交候选负向 Prompt、Seed 或 `batch_size: 1`，因此其成功 Run 不是候选实现的验收证据。
- 原因位于 Desktop development context：隔离运行 HOME 的 `.agents/skills` 指向真实 `$HOME/.agents/skills`，真实全局项目 Skill 按项目规范只能指向主开发 checkout，不能指向独立 linked worktree。
- 最小修复不修改真实全局链接、不增加 CLI、不复制 Skill、不建立 overlay。`config/desktop-worktree.json.skillSourceRelativePath` 唯一定义当前 worktree 的候选 Skill 根；`dev:start` 把隔离运行 HOME 链接到该目录。production context 继续解析真实 home 的 `.agents/skills`。
- 开发 Skill 配置缺失、使用绝对路径、离开 worktree 或目标不是目录时，context 返回明确错误并且不回退真实 home。自动化测试验证隔离链接可读取 worktree marker，真实全局 marker 保持不变，生产 context 的 Skill 根保持不变。

## 用户需求

- `comfyui-generate` 为每张图片默认使用新的随机 Seed；只有用户显式要求固定 Seed 或复用已经生成过的 Seed 时才使用指定值。三个 Prompt Builder 不负责 Seed。
- 三个 Prompt Builder Skill 在构造提示词时，同时设计适合画面的宽高比和清晰度。
- Prompt Builder 必须根据当前任务属于正式生成还是 Prompt 方案测试，选择正式大图或测试小图。Prompt 方案测试包括首次测试、方案比较和根据上一轮结果持续迭代；迭代链在用户明确结束测试前保持测试档。
- Prompt Builder 必须兼容以 `width`/`height` 表示尺寸的 Workflow 模板和以 `aspect_ratio`/`megapixels` 表示尺寸的 Workflow 模板。
- 三个 Prompt Builder Skill 必须根据各自目标模型的特性构造负向 Prompt，重点防止当前画面主体常见的结构崩坏和低质量结果。
- `comfyui-generate` 必须使用正向 Prompt、默认随机或显式指定的 Seed、显式画幅参数和负向 Prompt提交 Generation Request。
- 当前只设计方案；用户批准后才能实施。

## 已确认的仓库事实

- 独立 worktree 路径为 `/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-prompt-generation-contract`。
- 独立分支为 `codex/prompt-generation-contract-plan`。该分支先从 `origin/main` 的 `e559781`（tag `v0.38.5`）创建，并在方案编写期间 fast-forward 到当前主 checkout 已提交的 `5142a99`，从而包含已跟踪的第三个 Builder。
- 主 checkout 存在用户改动 `AGENTS.md`；独立 worktree 不包含该未提交改动。
- `.agents/skills/` 是六个项目 Skill 的 canonical source；生产全局 Skill 链接不得指向独立 worktree。
- Workflow compiler 已能定位正向 Prompt、负向 Prompt、Seed 和精确 `width`/`height`；使用 `aspect_ratio`/`megapixels` selector 的模板不会被强制改为精确尺寸。
- Generation Tool 只把用户显式提供的运行参数交给 compiler，因此 Skill 必须明确提交所选的 Prompt、Seed 和尺寸参数。
- 修改项目 Skill 后必须由独立 Reviewer 完成 Markdown 语义验收；涉及 Skill 读取流程或 managed CLI 调用流程时必须通过独立 worktree 的完整 Desktop 真实模型验收。
- 当前方案基线跟踪 `anima-prompt-builder`、`wai-sdxl-prompt-builder`、`krea2-anime-prompt-builder` 和模型无关的 `character-portrait-prompt-designer`。用户所说的三个模型专用 Prompt Builder 明确映射为 ANIMA、WAI-Illustrious 和 Krea2。
- `krea2-anime-prompt-builder` 当前只返回一条 Prompt 正文，并明确禁止在最终输出中附带参数建议、负向 Prompt 或检查清单。实现用户要求时必须把该输出合同改成结构化结果，同时保持 `positive_prompt` 属性只包含一条纯净 Prompt 正文。
- 三个 Prompt Builder 的历史 Run 查询只服务于历史 Prompt 或 Workflow 信息复用；Prompt Builder 不从查询结果提取 Seed 作为输出。历史 Seed 复用由 `comfyui-generate` 按自己的 `generation run-inputs --stdin` 合同完成。
- `krea2-anime-prompt-builder` 的动作迁移约束已经要求完整竖向全身、鞋履入镜、标准焦段、关节轮廓和主体背景分离；正向规避策略应复用并泛化这些可见约束，不应建立独立负向 conditioning。

## 模型资料事实

### WAI-Illustrious

- WAI v17 维护者模型卡建议正向质量词使用 `masterpiece, best quality, amazing quality`，负向 Prompt 使用短集合 `bad quality, worst quality, worst detail, sketch, censor`；维护者警告过多质量词和过长负向 Prompt 会降低质量并使画面模糊。
- WAI v17 模型卡示例使用 1024×1344，并建议原生尺寸大于 1024×1024；官方 Space 提供 1536×1536、1728×1344、1344×1728、1824×1248、1248×1824、2016×1152、1152×2016、2304×960、960×2304 等预设。
- Illustrious 技术报告说明基础模型原生支持 1536×1536；这一事实不能直接当成 WAI v17 每种画幅的严格最优结论。
- WAI 官方资料没有证明社区常用的超长 `bad anatomy`、`bad hands` 列表优于短负向 Prompt；肢体修复更适合通过高分辨率修复流程和针对当前主体的少量缺陷词处理。

### ANIMA

- CircleStone Labs 官方模型卡把 Anima 定义为 2B 模型，包含 Base、Aesthetic 和 Turbo；仓库当前生成模型示例指向 `anima-aesthetic-v1.1.safetensors`，因此实施必须按实际模型版本选择规则。
- Anima 官方推荐 Base 路线正向前缀 `masterpiece, best quality, score_7, safe`，推荐负向 Prompt `worst quality, low quality, score_1, score_2, score_3, artist name, blurry, jpeg artifacts, chromatic aberration`。
- Anima Aesthetic 路线说明质量词可以省略，并建议避免同时在正向与负向使用 `score_*`，否则可能造成过度俗艳；因此不能把 Base 负向词原样套到 Aesthetic v1.1。
- Anima 官方支持约 512² 至 1536² 范围；Preview 给出约 1MP 的 1024×1024、896×1152、1152×896 示例。最终版没有固定画幅白名单。
- Anima 官方没有提供 `bad anatomy`、`bad hands`、`extra fingers` 的固定负向词表；人数、动作和多角色归属应主要由正向 Prompt 写清，负向只加入与当前画面风险直接相关且需要实测的缺陷词。

### Krea2 Turbo

- Krea 官方仓库、官方模型卡和 ComfyUI 官方文档确认本机 `krea2_turbo_fp8_scaled.safetensors` 对应 Krea 2 Turbo，不是 Krea 1 或 `FLUX.1 Krea [dev]`。
- Krea 2 Turbo 是 8-step distilled 路线，官方推荐自然语言 Prompt；本机 Skill 的“中文自然叙事 + 英文标签”属于项目经验，不是官方唯一格式。
- Krea 官方 CLI、Diffusers 示例和 ComfyUI 官方 Workflow 都只提供正向 Prompt；Krea 官方 Prompt Engineering 文档说明多数 Krea 模型不暴露 `negative_prompt`。Krea2 原生路线必须把待规避缺陷改写成正向可见约束，不能提交不存在的负向 conditioning。
- Krea 官方资料把输出范围描述为约 1K–2K，并要求尺寸向 16 的倍数对齐；本机 `704×1408` 是用户实测的小图配方，不是官方默认。
- Krea 官方没有对手指数、脚部完整、头身比或全身人物成功率提供量化保证；这些目标必须通过本机真实 Workflow A/B 结果验收。

## Workflow 尺寸与负向参数事实

- 当前静态支持基线包含 19 个模板：17 个模板支持精确 `width`/`height`；模板 36 和 21 使用 `aspect_ratio`/`megapixels`；模板 33 还支持 `resolution_preset`。
- `width`/`height` 与 selector 输出连接时，compiler 不会反向修改 `aspect_ratio`/`megapixels`；两类尺寸表示必须按模板选择，不能同时提交。
- `aspect_ratio` 与 `resolution_preset` 的合法字符串来自目标实例实时 `/object_info` enum；静态配置只能说明参数存在，不能证明当前实例允许哪些比例或预设。
- 当前基线中模板 39 与 28 支持 `negative_prompt`；模板 36 与 21 不支持 `negative_prompt`，与 Krea2 官方无独立负向 conditioning 的结论一致。
- 当前 `catalog template resolve` 只返回模板 ID、标题、`base_model_id` 和默认 `model_id`，刻意不向 Skill 返回参数能力；`comfyui-generate` 目前无法仅靠 resolve 结果可靠选择尺寸表示。
- compiler 只在模板保存的 `Seed (rgthree)` 值为 `-1` 时自动物化随机 Seed。其他模板在请求省略 `parameters.seed` 时可能继续使用模板保存的固定 Seed，因此 Skill 层仅“省略 Seed”不能保证每张图随机。

## 已形成的方案结论

- 三个 Prompt Builder 使用同一组结构化结果属性；模型专用 `generation-profiles.json` 保存该模型的尺寸与负向策略常量。
- managed CLI 提供随机 Seed 数组，`comfyui-generate` 独占 Seed 职责，并在提交每个 `batch_size: 1` 的请求前物化或复用具体 Seed。
- `generation inspect-template-parameters --stdin` 从当前 Source Workflow 与目标实例实时 `/object_info` 返回实际参数合同；生成 Skill据此选择精确尺寸、Selector 或可确定像素尺寸的 preset 中的一种，不读取静态 Workflow 验证基线。
- 自动化测试只验证结构、类型、数值范围、字段组合、CLI 副作用和 Workflow 参数选择；独立语义 Reviewer 与真实生成图片负责 Prompt 语义验收。

## 技术决策

| 决策 | 理由 |
| --- | --- |
| 保留模型通用合同与模型差异规则的单一来源 | 三个 Prompt Builder 和生成 Skill 需要一致字段语义，但不同模型需要不同负向 Prompt 决策。 |
| 把外部事实与方案推论分开记录 | 官方资料通常说明能力或训练尺寸，具体测试/正式尺寸矩阵仍属于本项目设计决定。 |
| 不用程序测试 Prompt 语义正确性 | 仓库规范要求语义任务由独立语义 Reviewer 和真实模型用例验收。 |
| Krea2 使用“负向意图正向改写”而非伪造 `negative_prompt` 参数 | 官方 Krea2 路线没有独立负向 conditioning，当前 Krea2 模板静态基线也不支持 `negative_prompt`。 |
| Prompt Builder 同时设计画幅语义和两类执行表示 | Builder 决定构图与清晰度，`comfyui-generate` 根据模板能力在精确尺寸和 selector 之间选择一种。 |

## 问题与处理

| 问题 | 处理 |
| --- | --- |
| `find-docs` Skill 默认依赖外部 Context7 CLI | 遵守仓库安全规则，不安装或运行该外部 CLI；改用浏览器读取官方一手资料。 |
| 批量读取长规范时输出被截断 | 对必读文件逐个读取。 |
| 浏览器批量打开官方链接时没有返回正文 | 改用官方域名检索并使用独立 Explorer 已抓取的直接页面证据；关键结论仍只采用官方仓库、模型卡、Space 配置和论文。 |

## 资料索引

- `docs/agents/comfyui-workbench-preset-and-skill-development.md`
- `docs/agents/worktree-development.md`
- `docs/system/architecture.md`
- `docs/system/directory-structure.md`
- `docs/system/testing.md`
- `docs/system/technology-stack.md`
- WAI v17 模型卡：https://huggingface.co/LyliaEngine/waiIllustriousSDXL_v170/blob/main/README.md
- WAI 官方 Space 配置：https://huggingface.co/spaces/IbarakiDouji/WAI-NSFW-illustrious-SDXL/blob/main/config.toml
- Illustrious 技术报告：https://arxiv.org/abs/2409.19946
- Anima 官方模型卡：https://huggingface.co/circlestone-labs/Anima
- Anima Preview 模型卡：https://huggingface.co/renxiaxin/Anima
- Krea 2 官方仓库：https://github.com/krea-ai/krea-2
- Krea 2 Turbo 官方模型卡：https://huggingface.co/krea/Krea-2-Turbo
- ComfyUI Krea 2 官方文档：https://github.com/Comfy-Org/docs/blob/main/tutorials/image/krea/krea-2.mdx
- Krea 官方 Prompt Engineering：https://github.com/krea-ai/skills/blob/main/krea-generate/references/prompt-engineering.md
- `config/verification/comfyui-workflow-parameter-support.json`
- `src/host/generation/runtime-parameters.ts`
- `src/host/generation/workflow-compiler.ts`

## 浏览器核验记录

- 2026-09-02 的官方域名检索确认 `circlestone-labs/Anima` 当前模型仓库存在 Base/Aesthetic/Turbo 相关文件和持续更新的 README；方案仍以模型卡明确写出的 Prompt 与 generation settings 为依据。
- WAI、Krea2 和 ComfyUI 的具体结论由独立 Explorer 从上述直接官方页面提取；方案不采用搜索结果页或第三方教程作为唯一依据。

## 独立语义审核结论

- 第一轮 Reviewer 提出的 6 个 P1 已全部修订：尺寸表示合同、历史 Seed 责任、Krea2 文件边界、Krea2 validator、程序/语义测试边界和逐配置验收覆盖。
- 第二轮 Reviewer 继续检查尺寸缺字段组合、5% 公式、单次 20 张上限、真实验收证据字段和 Reviewer 只读职责边界。
- 最终 Reviewer 结论为没有 P0、P1 或 P2，方案可以提交用户审批。

## 用户补充的标准长画幅

- 用户在审批前指出方案缺少 `9:16` 与 `16:9`。
- 修订方案把这两个比例加入 ANIMA、WAI 和 Krea2 的可选 profile，不替换各模型现有默认画幅。
- ANIMA 使用 576×1024 / 864×1536 及横向对调；这让长画幅的较短边不低于约 512 像素，名义清晰度为 0.59 / 1.33 MP。
- WAI 与 Krea2 使用 864×1536 / 1152×2048 及横向对调，名义清晰度为 1.33 / 2.36 MP。
- 新增比例属于项目候选；实施阶段必须通过目标实例参数枚举、真实生成、独立语义审核和独立视觉审核后才能保留。
- 独立 Reviewer 确认全部新增长画幅均精确约分为 9:16 或 16:9，名义 MP 偏差为 0.0298%–0.2177%，40 个真实配置计数与验收引用一致；修订没有 P0、P1 或 P2。

## 用户更正的 Seed 职责

- 用户明确更正：Prompt Builder 不负责 Seed，Seed 由生图 Skill 负责。
- 三个 Prompt Builder 的结构化结果删除 `seed_mode` 和 `seed`；Builder 不生成随机 Seed、不读取历史 Seed 作为结果、不处理固定 Seed 请求。
- `comfyui-generate` 独占 Seed 的解析、历史查询、随机生成、范围校验、提交和失败重试复用。
- Builder 的 deterministic validator 只拒绝不属于 Builder 合同的 Seed 输出属性，不判断用户 Seed 请求。
- 独立 Reviewer 确认 Seed 职责修订没有 P0、P1 或 P2，Builder 与生成 Skill 的 CLI、validator、测试和验收主体一致。

## 用户补充的 Prompt 迭代用途

- 用户明确补充：“测试 Prompt 方向、比较 Prompt 方案”还包括持续迭代 Prompt 方案。
- `generation_purpose: "test"` 覆盖首次方向测试、多个方案比较、根据生成结果或反馈继续改写、继续测试修改版、快速预览和批量筛选。
- 当前请求明确引用旧 Prompt、图片、Run、反馈或修改版，或者明确继续调整同一画面与主体时，当前请求才连接同一测试链；连接后的迭代在用户明确结束测试前保持测试档。
- 可见上下文中存在旧测试链，但当前请求是没有引用关系的新画面任务时，新任务不继承旧测试状态；没有测试、比较或迭代表述时使用正式档。链归属无法判断时询问用户。
- 一次 Builder 执行只返回一个 Prompt 和一个生成目的；多个比较方案及已划分的测试/正式任务必须分别执行 Builder，不能返回候选数组。
- 独立 Reviewer 确认测试链连接、新任务默认、链归属不明、单结果输出和任务拆分合同没有 P0、P1 或 P2。

## 用户指定的 Skill 内容边界

- 用户明确要求：详细规则不能塞进 `SKILL.md`，必须写入参考文档，并在 `SKILL.md` 写准确读取时机。
- 三个 Builder 各自使用 `references/generation-output-schema.json` 保存结果 schema，使用 `references/generation-output-contract.md` 保存生成目的、尺寸和模型负向语义规则，使用 `references/generation-profiles.json` 保存结构化常量。
- Builder 的 `SKILL.md` 只规定在输入与模型 Prompt 规则读取后、生成决定以前完整读取三份文件；上下文压缩后在最终结果前重读；随后调用读取两个 JSON 的 validator。
- `comfyui-generate` 的 Seed/提交规则由 `references/generation-cli.md` 唯一保存，模板实际参数检查与尺寸选择规则由 `references/template-parameter-inspection-cli.md` 唯一保存，模板/模型/LoRA/实例目录解析规则继续由现有 `references/catalog-cli.md` 保存；生成 Skill的 `SKILL.md` 只规定对应阶段的读取和重读时机。
- 程序测试只检查引用与文件存在，独立语义 Reviewer 审核 `SKILL.md` 没有复制详细合同。
- 每个 Builder 的 `generation-output-contract.md` 同时保存自己的 validator 脚本路径、固定命令、stdin、stdout、退出码、错误修正和重试合同；`SKILL.md` 只规定何时读取和何时调用。
- `comfyui-generate` 在解析或校验固定整数 Seed、随机或历史 Seed，以及构造任一 Generation Request 前均必须已经完整读取 `generation-cli.md`，不能延迟到提交前才读取。
- `comfyui-generate` 使用自己 Skill 内的 `prompt-result-contract.md` 和 `prompt-result-schema.json` 解析 Builder 结果并映射正向 Prompt、原生负向 Prompt、正向规避和尺寸参数；生成 Skill运行时不跨 Skill 读取三个 Builder 的参考文件。
- 三个 Builder 的 `generation-output-schema.json` 与生成 Skill的 `prompt-result-schema.json` 必须深度相等；仓库合同测试解析四份 JSON 并检查相等，运行时的每个 Skill 只读取自己的本地副本。
- 计划执行者不能仅向四个 `SKILL.md` 追加读取说明；计划执行者必须删除或改写其中与新参考文件重复或冲突的详细合同，使 `SKILL.md` 最终只保留读取时机、压缩后重读时机和执行阶段路由。
- 独立 Reviewer 最终确认参考文档内容边界修订没有 P0、P1 或 P2；文件清单、合同测试、第 6.5 节、第 7.14 节、验收清单和审批项相互一致，可以提交用户审批。

## 用户更正的模板职责

- 用户明确指出 Prompt Builder 必须与 Workflow 模板解耦；Builder 只根据画面设计目标画幅与目标尺寸，不查询或适配模板参数。
- 用户明确要求 `comfyui-generate` 在实际生成阶段通过 CLI 检查当前模板的真实参数，并允许把 Builder 的目标尺寸适当调整为模板可接受的实际尺寸。
- 当前仓库的 `config/verification/comfyui-workflow-parameter-support.json` 用于 Workflow 验证基线；把它设计成 Catalog resolve 的运行时模板白名单会导致新增模板在配置同步前全部失败，不符合用户要求。
- 当前 `catalog template resolve` 的实现有意不返回 Source 的 `parameters_json`；需要继续核对现有 CLI 与 Source 适配层，设计不会依赖静态模板白名单的真实参数查询路线。
- 当前运行配置固定 Source `0.86.1`；当前 Host 的生成请求允许提交结构化 `parameters`，Workflow compiler 已经根据模板 Workflow 和目标实例实时 `/object_info` 校验并绑定实际参数。
- 旧 Source `0.82.2` 的 Host TemplateBundle 曾包含 `parameters_json`，但当前 `0.86.1` 合同已经变化；修订方案不能假定旧 `parameters_json` 是当前可靠的运行时能力来源。
- 当前 Source `0.86.1` TemplateBundle 只包含 `id`、`title` 和 `workflow_json`。因此现有 Catalog semantic resolve 的 `parameters_json` 既不是生成链路的权威来源，也不能满足当前模板实际能力查询。
- 当前 Workflow compiler 已从目标模板 `workflow_json` 与目标实例实时 `/object_info` 中定位标准运行参数、识别连接关系、解析枚举与数值合同，并在参数找不到、歧义或值不合法时返回具体 Generation parameter 错误。
- 生成 Skill所需的模板能力检查应复用当前 Workflow compiler 的真实解析逻辑，通过新的只读 managed CLI 检查命令返回当前模板和实例可接受的标准运行参数及约束；该命令不创建 Generation Run，也不读取静态 Workflow 验证基线。
- 修订必须删除方案中的 `catalog template resolve --id` → `supported_parameters` 投影、`workflow-parameter-support.ts`、模板验证基线白名单失败、Catalog 合同/测试改造和“不允许近似调整”条款；这些内容与用户最新职责定义冲突。
- Builder 仍输出模板无关的目标 `aspect_ratio`、`width`、`height` 和 `megapixels`。生成 Skill根据只读 CLI 返回的当前模板实际参数类型与约束选择一种提交表示，并在明确误差阈值内调整实际尺寸。
- 新的只读命令可命名为 `generation inspect-template-parameters --stdin`，输入当前 `template_id` 与 `instance_id`。CLI route 通过 Generation runtime、SourceGenerationPreparer 和同一个 Workflow compiler 读取当前 Source Workflow 与当前实例 `/object_info`；命令不经 Catalog resolve 推导参数能力。
- 当前 managed CLI 已把 `generation submit`、历史 Run 查询和媒体查询路由到 Generation runtime；模板参数检查应进入同一生成域路由，不扩展 Catalog resolve，也不修改 Catalog 合同。
- 方案把生成阶段的自动尺寸适配限制为相对宽高比偏差不超过 5%、相对像素面积偏差不超过 10%；偏差使用 Builder `width ÷ height` 与 `width × height` 作为统一目标计算。用户明确要求尺寸不变或任一偏差超过阈值时，生成 Skill必须停止并请求选择。
- “新增模板不受静态配置阻塞”由自动化 Source/`/object_info` fixture 验证；真实 Desktop 验收不要求计划执行者在外部 Source 创建临时模板。
- 独立 Reviewer 指出生成 Skill仍需在目录解析前读取现有 `catalog-cli.md`；方案已把该读取时机、压缩后重读、合同测试和真实 Desktop 路由验收补回，但不修改 `catalog-cli.md` 内容。
- 模板检查命令必须返回结构化 `size_candidates`，由 compiler 把多组尺寸参数确定性配对；preset 结果分为带确定宽高的 `mapped_options` 与不得自动选择的 `unmapped_values`。生成 Skill不解析自由文本或猜测节点后缀。
- 尺寸适配自动化测试必须覆盖恰好 5%/10% 的闭区间边界、刚超过任一阈值的拒绝、以 Builder 目标值为分母的公式和“先比例、后面积”的候选排序。
- 独立 Reviewer 最终确认模板职责修订没有 P0、P1 或 P2；Builder 模板无关、Generation CLI 实时检查、结构化尺寸候选、参考文档路由、阈值分支、文件清单和验收范围相互一致，可以提交用户审批。

## 用户指定的 Workflow compiler 复用方向

- 用户明确要求模板只读检查必须复用 Workflow compiler 的现有检查能力，或者把该能力抽象成深模块，不能在 CLI 路径重新实现参数发现与校验。
- 当前 `ComfyWorkflowCompiler` 已经隐藏 Workflow widget 发现、连接关系、别名、节点后缀、动态枚举、数值合同、`/object_info` 缓存和参数应用等复杂实现；把它定义为深模块比新增一个浅层转发模块更符合现有 seam。
- 修订方向是把 `WorkflowCompiler` 的小接口扩展为 `compile(input)` 与 `inspectRuntimeParameters(input)` 两个方法；两个方法在模块内部调用同一个私有 runtime-parameter plan。私有 plan、参数 target、NodeDefinitionsSnapshot 和配对算法不导出。
- `SourceGenerationPreparer`、Generation runtime 和 managed CLI 只负责把模板、实例和连接适配到 `WorkflowCompiler.inspectRuntimeParameters`，不解析 Workflow 节点、不配对尺寸参数、不解释 `/object_info`。
- 现有 `GenerationPreparationAdapter` 只有 `prepare(request, signal?)`。方案将为该 adapter 增加 `inspectRuntimeParameters({ templateId, instanceId }, signal?)`；两个 ID 都是必填非空字符串，SourceGenerationPreparer 只读取显式 Source TemplateBundle 和实例并委托 compiler。
- Generation runtime 的确定公共方法名是 `inspectTemplateRuntimeParameters(input, signal?)`，输入只包含必填 `templateId` 与 `instanceId`，返回 `WorkflowRuntimeParameterInspection`。CLI route 的 runtime `Pick` 显式加入该方法；runtime 与 route 都不创建 Run。
- `WorkflowCompiler.inspectRuntimeParameters` 必须停在参数检查边界，不调用 Official API Workflow compiler、不物化 Seed、不替换模型、不应用 LoRA，也不修改输入 Workflow；这些工作继续只属于 `compile` 的提交编译路径。
- Workflow 缺少某个标准参数时，inspect 只是不返回该参数，而不是报错。检查与提交的一致错误范围只覆盖共享 plan 已发现目标的歧义、非法 `/object_info` 合同和连接错误；compile 独有的 `GENERATION_PARAMETER_TARGET_NOT_FOUND` 只用于调用方提交检查结果未提供的 parameter_id。
- `generation-workflow-compiler.test.ts` 应通过深模块接口验证检查与提交的一致结果；测试不得直接导入或断言私有 runtime-parameter plan 的内部状态。
- 独立 Reviewer 第一轮指出 inspect/compile 的缺失参数错误等价范围过宽、实例 ID 必填性不明确、Generation runtime 入口缺少确定方法名。修订已把缺少标准参数定义为正常的结果缺项，把错误一致性限制为已发现目标的歧义、非法合同和连接错误，规定两个 ID 都是必填非空字符串，并固定 runtime 方法名。
- 独立 Reviewer 最终确认 Workflow compiler 深模块修订没有 P0、P1 或 P2；剩余风险只需要由实施阶段的 interface tests 证明两个方法确实共享私有 plan，且 adapter 与 CLI 没有复制解析逻辑。

## 用户要求生成 Skill 拥有只读检查 CLI 参考文档

- 用户明确要求：`comfyui-generate` 在生图前调用 `generation inspect-template-parameters --stdin`，因此该 Skill 必须拥有一份 Skill 内可见的 CLI 参考文档，不能只依赖系统实施方案或 Host 文档。
- Skill 开发规范要求把只在模板检查分支需要的详细 CLI 合同放入 `references/`，并由 `SKILL.md` 的准确上下文指针规定读取分支；CLI 输入、输出、错误和使用顺序只保留一个文字来源。
- 方案把文件名明确为 `.agents/skills/comfyui-generate/references/template-parameter-inspection-cli.md`，使它与一般语义说明区分，并把它定义为只读检查命令的完整 Skill-owned CLI 参考文档。
- 项目 Skill 开发规范要求新建 CLI 使用参考文档完整包含九个章节：用途、环境与入口、命令与时机、参数与 stdin、ID 来源、输出、错误与重试、副作用与重复调用、完整示例。程序测试只检查引用与文件存在，独立语义 Reviewer逐项验收这些章节的真实合同。
- 生成 Skill的 `SKILL.md` 必须在目录解析取得非空模板 ID 与实例 ID 后、组织第一次检查命令或消费检查结果前读取该文档；检查错误修正前读取错误章节；上下文压缩丢失内容后在下一次检查或结果消费前重读。
- 模板 ID 或实例 ID 改变时只要求按仍完整保留的参考内容重新调用检查命令；只有上下文压缩已经丢失参考内容时才先重读文档。
- 当前 `docs/agents/comfyui-workbench-preset-and-skill-development.md` 已经完整规定 CLI 参考文档九章、Skill-owned 文件边界和读取条件，本方案遵守该规范，不修改该规范文件。
- 独立 Reviewer 第一轮指出 ID 变化后的文档重读条件与 Desktop 验收不一致，并指出实施清单无具体目标地包含现有 Skill 开发规范。修订已把 ID 变化定义为按仍保留的参考内容重新检查，并从修改清单删除该规范文件。
- 独立 Reviewer 最终确认 CLI 参考文档的文件名、九章合同、真实命令与输入输出、ID 来源、调用单位、只读副作用、错误重试、Skill 路由、合同测试和 Desktop 验收没有 P0、P1 或 P2。

## 实施技能与测试方法

- 用户通过 `$implement` 批准当前方案实施；implement Skill 要求尽可能使用 TDD、定期运行 typecheck 与单测、结束时运行完整测试、执行两轴 code review，并提交当前分支。
- TDD 必须通过已批准的公共 seam 做纵向 red-green slices；测试不得导入 compiler 私有参数计划，也不得 mock 本项目内部类。允许 mock 的系统边界包括 ComfyUI `/object_info`、Source、时间、随机源和必要的文件系统边界。
- code-review 的固定比较点使用完成基线同步后的实施起点 `edfa69a1d1c2ebc65beab66df1bfa7765ffb1ce6`，规范轴依据仓库文档与 smell baseline，规格轴依据 `.planning/prompt-generation-contract/implementation-plan.md`。
- Skill 实现必须保持 progressive disclosure：`SKILL.md` 只保存执行步骤和准确上下文指针，详细 schema、模型配置、CLI 参数、输入输出、错误与示例保存在 Skill-owned references；Skill validator 通过结构化 JSON 来源执行确定性检查。
- 项目 Skill CLI 参考文档必须使用真实命令与真实属性，覆盖九个必备章节，并且只描述 Skill 执行者可见的 managed environment；`SKILL.md` 必须覆盖首次调用、ID 获取、请求构造、写入、历史查询、错误修正和上下文压缩后的读取条件。
- 独立 worktree 不运行 `pnpm install`，完整 Desktop 只能使用前台 `pnpm dev:start`；第二终端必须执行 `pnpm dev:status` 与 `pnpm dev:logs`，结束时执行 `pnpm dev:stop` 并确认 stopped。
- 自动化验证必须覆盖成功、拒绝、清理和错误分支；最终候选必须运行 `pnpm quality` 与 `git diff --check`，任何审查后代码修改都必须重新运行受影响审查和完整质量门禁。
- 架构规范把 `scripts/cli/` 定义为 managed CLI 源入口、`src/cli/` 定义共享结构化合同、`src/host/cli/` 定义 capability route、`src/host/generation/` 定义 Source/Workflow compiler/Runtime；新检查命令必须沿这条既有链路进入生成域。
- `src/host/generation/workflow-compiler.ts` 是运行时参数解析、Actual Workflow 改写、活动输出节点和运行时 API Workflow 投影的现有深模块位置；inspection 必须复用该模块的 `/object_info` 缓存与目标合同解析，而不进入 Official API Workflow export。
- 当前测试规范已明确 `ComfyWorkflowCompiler.compile()` 是运行参数合同公开 seam，并覆盖精确数值、动态 COMBO、缓存、Prompt 极性和尺寸；新增 inspection tests 应扩展同一文件的公共接口矩阵而不重复搭建私有解析器测试。
- managed CLI 的 endpoint 与 capability 由前台 shell 环境提供；Skill 只传业务参数，不能传 Workspace、Session、Turn 或 Tool Call identity。只读模板检查不需要 Run 归属，也不写入 Run Repository。
- 当前技术栈已经提供 TypeScript 6、Vitest 4 和 Node 22；随机 Seed 使用普通伪随机数，不需要依赖变更，且 worktree 不允许运行依赖安装。
- `CONTEXT.md` 把 Repository Skills、Source v0.86.1 三字段 TemplateBundle、Generation Run durability、运行时 API Workflow 投影和 Official Base API Workflow 定义为既有领域名词；实现和测试名称应沿用这些术语。
- ADR 要求 Generation Run 只在实际写入调用后创建并保持持久异步；只读模板检查不能借用 `acceptGeneration()` 或预先创建 Run。
- ADR 把 ComfyUI 实例定义为 execution route，并禁止不可用时自动切换；新检查命令必须使用 Skill 从实例目录取得的显式实例 ID，失败时返回该实例错误。
- ADR 0014 明确 Source v0.86.1 TemplateBundle 只有 `id`、`title`、`workflow_json`，且 compiler 是活动输出节点唯一所有者；inspection 同样必须从现有 Source bundle 与实时 `/object_info` 推导，不能恢复旧 Source 参数字段。
- Source 的 Host-only read surface 不注册为 Agent Tool；新能力通过当前仓库 managed CLI capability route 暴露给 Skill，不改变 Source Operation 或 Harness Tool roster。
- 实施 worktree 是有效 linked worktree，当前分支 `codex/prompt-generation-contract-plan` 的基线为 `5142a99d1676fc01b2429391f8cae2299016fd7f`；除 `.planning/prompt-generation-contract/` 外没有现有修改，manifest 与 lockfile无差异。
- 主开发 checkout 在方案审批期间已经前进到 `edfa69a1d1c2ebc65beab66df1bfa7765ffb1ce6`。开始写代码前必须只读比较 `5142a99..edfa69a` 的提交和授权文件重叠，判断是否需要把实施分支更新到当前 main，避免在过期基线上实现或覆盖后来修复。
- 分支分叉源于 `5142a99` 与 main 的 `d407916` 是同一 Krea2 功能的两次等价提交，main 随后由 `edfa69a` 增加 Krea2 semantic query CLI 参考。rebase 重放旧提交时产生 add/add 冲突；依据 merge-conflict 规范跳过旧等价提交后，实施分支准确落在 `edfa69a`，`.planning/` 文件保持不变且没有其他修改。
- 现有 `ComfyWorkflowCompiler` 已集中拥有 `parameterTargets()`、`resolveParameterTarget()`、`validateDynamicRuntimeContracts()`、`liveRuntimeParameterValue()`、`applyRuntimeParameters()` 和共享 `/object_info` cache；最小深模块改动应把“建立 targets + 动态合同 + 解析 assignment”组合为私有 plan，而不是新增外部 parser。
- `compile()` 当前顺序是：读取缓存 definitions → clone Workflow → apply runtime parameters → 物化 rgthree 随机 Seed → 模型 → LoRA → runtime projection → Official API compile。`inspectRuntimeParameters()` 应复用读取与 plan，但停在参数投影前，不 clone/写 Workflow、不进入其余阶段。
- `WorkflowCompiler` 类型目前位于 `source-preparer.ts`，`GenerationPreparationAdapter` 目前只有 `prepare()`；当前文件结构与批准方案的两个方法扩展一致，不需要移动 `UiWorkflow` 或建立新 contract module。
- 标准运行时参数种类的唯一代码来源是 `src/host/generation/runtime-parameters.ts` 中的 `STANDARD_RUNTIME_PARAMETER_KINDS`；其中已经包含正负提示词、Seed、`width`、`height`、`resolution_preset`、`aspect_ratio` 和 `megapixels`。
- `applyRuntimeParameters()` 当前把目标发现、调用方参数解析、动态组合合同校验、值合同校验和 widget 写回串联在一个函数中；只读检查必须复用目标发现与合同解析，但不能进入 widget 写回。
- Workflow compiler 的公开 seam 测试位于 `tests/unit/generation-workflow-compiler.test.ts`，Generation runtime 测试位于 `tests/unit/generation-runtime.test.ts`；后续 TDD 使用这些既有测试入口。
- 已批准的 inspection 对外合同要求：非尺寸参数返回参数 ID、标准 kind、值类型、当前值及实际存在的数值/枚举约束；尺寸必须只通过 `width_height`、`aspect_ratio_megapixels` 或 `resolution_preset` 三类结构化候选返回。
- 现有 compiler 测试已经覆盖连接后的 width/height 不可直接写、Selector 的 aspect-ratio/megapixels 替代表示、独立 latent upscale 尺寸，以及所有标准参数的节点 ID 后缀；inspection 测试可复用这些公开行为 fixture 验证候选配对和 parameter_id 一致性。
- 第一个 inspection 纵向切片应选一个同时包含 `width` 与 `height` 的单节点 workflow，断言数值合同、当前值、`candidate_id` 和 Official compiler 未调用；随后再扩展 Selector、preset、多组后缀及错误一致性。
- `parameterTargets()` 已排除 bypass、编辑器节点和已连接 widget；`resolveParameterTarget()` 已负责标准别名、上游 `value`、Prompt 极性、主采样管线偏好和节点 ID 后缀。inspection 应以逐个标准 kind 调用同一 resolver 的方式发现 canonical target，再为多组目标补充精确后缀发现，避免复制这些规则。
- `ComfyWorkflowCompiler` 的 `/object_info` 读取与 10 分钟实例缓存已经封装在私有 `nodeDefinitions()`；新增 `inspectRuntimeParameters()` 可以与 `compile()` 共用一个新的私有 snapshot 获取包装，保持连接错误语义一致。
- `SourceGenerationPreparer` 已在一个类中封装 Source TemplateBundle、实例、origin 和 authorization 到 compiler 输入；新增 inspect adapter 方法只需强制显式实例 ID并委托 compiler，不需要新模块。
- 独立 worktree 初始没有根 `node_modules` 链接，因此直接调用 `pnpm vitest` 无法找到命令；主 checkout 的根 `node_modules` 存在。必须通过仓库的 worktree checkout 准备逻辑创建受规范管理的链接，不能运行 `pnpm install`。
- `scripts/desktop/dependencies.mjs` 只负责把 DSH Desktop 底座的指定依赖逐项链接到仓库 `node_modules`，不是把独立 worktree 链到主 checkout 的入口；链接 worktree 依赖的逻辑应继续从 `development-checkout.mjs` 或现有 dev 命令调用。
- `scripts/desktop/development-checkout.mjs` 导出的 `prepareDesktopDevelopmentCheckout()` 是 `dev:start` 与 `web:start` 共用的 checkout 准备实现；它验证 linked worktree 与主 checkout 路径后，仅创建 `.env` 和根 `node_modules` 符号链接。调用该仓库本机函数后 Vitest 可用，没有安装依赖。
- 第一个 inspection 测试已得到预期红灯：`TypeError: compiler.inspectRuntimeParameters is not a function`；失败来自尚未实现的公共 seam，而不是 fixture 或环境错误。
- 第一个 green 实现新增 `RuntimeParameterPlan` 私有对象；inspection 与 compile 都通过 `createRuntimeParameterPlan()` 使用同一 `parameterTargets()` 结果，compile 仅在克隆后的 Workflow 上执行写回。
- 第一版 inspection 投影采用 `parameters` 保存非尺寸参数，采用 `size_candidates` 保存结构化尺寸表示；数值合同输出 `integer`/`number`、当前值及实际 min/max，枚举合同输出 `choice` 与 `allowed_values`。
- 第一个 width/height inspection 单测与全仓 TypeScript typecheck 已通过；Official compiler spy 未调用且原 Workflow widget 值保持不变。
- Selector inspection 已能直接复用枚举与浮点合同，输出 `aspect_ratio_megapixels` 候选；preset 映射只接受文本中可确定解析的正整数 `宽×高`，其余原始允许值进入 `unmapped_values`。
- 第二个 TDD 切片先因缺少 `resolution_preset` 候选而红，再增加确定性 preset 投影后转绿；focused test 与 typecheck 均通过。
- 多组同名 width/height widget 能通过现有节点后缀 resolver 直接形成 `width_1`/`height_1` 与 `width_2`/`height_2` 两个候选；把第二组检查结果原样交给 compile 只改写第二组，证明公开 parameter ID 一致性。
- Source adapter 切片先因 `SourceGenerationPreparer.inspectRuntimeParameters` 不存在而红；最小实现只读取显式 template ID 与 instance ID、构造现有连接对象并委托 compiler，不使用默认实例，也不创建 Generation Run。
- Generation runtime 切片先因 `inspectTemplateRuntimeParameters` 不存在而红，新增方法后 focused test 转绿，并确认查询不到任何新增 Run。
- 把 `GenerationPreparationAdapter.inspectRuntimeParameters` 设为必需方法后，typecheck 精确找出 6 个测试假 adapter 需要补齐新接口：两个 CLI route fixture、三个直接构造的 runtime options fixture和一个 worker fixture；生产 adapter 已由 `SourceGenerationPreparer` 满足。
- 补齐 6 个测试 adapter 后，相关 compiler/preparer/runtime 共 232 个单测和 typecheck 全部通过；新 adapter 方法保持必需接口，没有改成可选降级。
- managed CLI 的单一解析入口是 `src/cli/contract.ts`：所有 stdin 命令先由 shell 调用 `parseCliArguments()`，再由 Host route 调用 `parseCliRequest()` 复验严格属性；新增检查与随机 Seed 命令应同时加入两个分支。
- `scripts/cli/harness-comfyui.mjs` 只维护“哪些命令需要 stdin”和命令级参数错误分类；业务 dispatch 位于 `src/host/cli/route.ts`。模板检查 route 应直接调用 runtime，随机 Seed 可以在 route 内调用生成域的纯函数或 runtime 公共方法，但不需要 Workspace identity。
- 现有 CLI route 只有提交和历史 Run查询需要 `generationIdentity()`；模板参数检查输入已经显式包含 template/instance ID，随机 Seed 只包含 count，两者均不应查询 Workspace 或创建 Run。
- 用户明确否决加密随机源并指出该设计属于过度开发。随机 Seed 实现只使用普通伪随机数；实现保留同一次 1 至 20 个结果互不相同的已批准外部合同，不增加加密、持久化或额外随机架构。
- managed CLI 的两个新 stdin 合同已实现严格属性检查：模板检查只接受非空 `template_id` 与 `instance_id`，随机 Seed 只接受 1 至 20 的整数 `count`；shell 现在会读取这两条命令的 stdin 并按请求错误报告。
- 随机 Seed route 直接使用 `Math.random()` 生成 31 位非负整数并通过同一次调用内的 `Set` 去重；测试固定普通随机序列验证碰撞重试，没有引入加密随机或新随机模块。
- CLI route 的 runtime `Pick` 已显式加入 `inspectTemplateRuntimeParameters`；模板检查与随机 Seed dispatch 均不调用 Workspace resolver。三个 CLI contract/command/route 测试文件共 29 个测试及 typecheck 已通过。
- Compiler 已有 dynamic-combo 测试主要覆盖自定义 `dynamic.*` 参数；标准尺寸可能通过上游 `value` 节点或同节点 Selector 暴露。inspection 仍需增加正向 Prompt、负向 Prompt、Seed 和标准参数合同测试，确保生成 Skill的三项提交门禁都有直接证据。
- `runtimeParameterContractFromDescriptor()` 已能把带 options 的 `COMFY_DYNAMICCOMBO_V3` 根参数转换为 choices；现有 `validateDynamicRuntimeContracts()` 只在 compile 有实际 assignments 时校验选中分支的 child 合同。inspection 若发现标准参数位于 dynamic child，必须用当前父选项运行同一校验，而不能只读取初始 child descriptor。
- inspection 现在先发现全部标准 targets，再用当前 widget 值构造只读 planned assignments 并调用与 compile 相同的 `validateDynamicRuntimeContracts()`；随后才投影公开合同。一个缺少 `inputs.optional` 的动态 `resolution_preset` 在 inspect 与 compile 均返回相同 unsupported 错误。
- inspection 的直接门禁测试已覆盖 `positive_prompt`、`negative_prompt` 与 0 至 2,147,483,647 的整数 Seed 合同。当前 compiler/preparer/runtime/CLI 六个相关测试文件共 263 个测试全部通过。
- Skill 实施授权的结构化共同结果固定为 10 个属性：`model_route`、`positive_prompt`、`negative_mode`、`negative_prompt`、`positive_avoidance`、`generation_purpose`、`aspect_ratio`、`width`、`height`、`megapixels`；三个 Builder 不得输出任何 Seed 属性。
- 三个 Builder 各自需要本地同构 schema、模型 profiles、语义合同与 validator；`comfyui-generate` 需要自己的同构 schema、Builder 结果消费合同、模板检查 CLI 九章参考和更新后的 generation CLI 参考。`SKILL.md` 只保留精确读取时机与阶段路由。
- 现有 Krea2 `SKILL.md` 仍以“只返回一个 Prompt 正文段落”为终态，`comfyui-generate` 仍直接从普通 Prompt 建立参数；两者必须改为结构化 Builder 结果交付/消费，否则与批准合同冲突。
- 实施方案第 5 章意外重复编号两次 Desktop 步骤，且第 10 章保留方案审批前的“尚未授权实施”原文；这是计划文档内部陈旧内容，实施记录应在最终提交前修正为用户已通过 `$implement` 授权。
## 2026-09-02 generation output validator implementation

- `generation-output-schema.json` uses `enum` without a redundant `type` for `negative_mode` and `generation_purpose`; the ANIMA and WAI validators therefore treat an omitted schema `type` as “no additional type restriction” and still enforce the enum.
- The existing ANIMA and WAI prompt-format validators remain available through `--prompt-format`; their default CLI mode now validates the ten-field Prompt Builder generation result.
- Krea2 has no pre-existing JavaScript output validator, so its new validator can implement only the shared ten-field generation-result contract without duplicating Krea2 semantic prompt construction in program logic.

## 2026-09-02 template inspection reference facts

- The public inspection result is exactly `{ parameters, size_candidates }`. Every parameter reports `parameter_id`, `kind`, `value_type`, `current_value`, plus present `minimum`, `maximum`, or `allowed_values` constraints.
- Width/height and selector candidates embed their two inspected parameter objects. Resolution-preset candidates expose `parameter`, deterministic `mapped_options` entries with `value`, `width`, and `height`, and report-only `unmapped_values`.
- The managed CLI route delegates inspection directly to `GenerationRuntime.inspectTemplateRuntimeParameters`; it does not resolve Workspace identity and does not create a Generation Run.

## 2026-09-02 connected size-target review

- A size parameter can be represented by an upstream scalar `value` widget connected to a downstream `width` or `height` input. In that case the two writable targets have different node IDs even though they belong to the same downstream size consumer.
- Pairing inspection candidates only by writable target node ID would omit that valid width/height pair. Candidate pairing must use the shared downstream consumer identity already visible in the Workflow graph and must return ambiguity when a writable target participates in more than one possible pair.

## 2026-09-02 Prompt Builder 历史查询职责边界

- Prompt Builder 可以按各自 Skill 的历史查询参考调用 `generation run-inputs --stdin`，读取或报告历史 Prompt 与 Actual Workflow。
- 历史查询返回的 `arguments.parameters` 可以包含 Seed。Prompt Builder 不解析、选择、校验、复用或输出该 Seed，也不为 Seed 决策发起历史查询。
- Prompt Builder 不依据当前或历史 Actual Workflow 的模板参数能力设计或调整目标尺寸。模板参数检查、尺寸适配、随机 Seed、历史 Seed、请求分配和提交均由 `comfyui-generate` 负责。
- `generation random-seeds --stdin` 使用普通 `Math.random()` 产生 31 位非负整数，并只保证同一次命令输出互不相同；该命令不提供或声称任何加密性质。
