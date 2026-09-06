# 确定目录与记录类型

以用户指定的任务目录为根；未指定时，在当前 Workspace 下创建有明确任务含义的独立目录。记录中的产物路径相对任务根目录，外部材料保留原始来源路径。命令需要绝对路径时按任务根目录展开，查询 CLI 的工作目录仍为当前 Workspace。

```text
<任务目录>/
  task.json
  stages/<阶段ID>/
    input.json
    prompt.txt
    result.json
    design.json 或 builder-result.json、validation.json、config-result.json
  rounds/<轮号>/
    round.json
    review.md
    candidates/<候选ID>/
      requests/001.json
      runs/001.json
      queries/inputs-001.json
      queries/media-001.json
      media/001.png
      observations/001.json
  final/
    selection.json
    配方.md
```

先创建需要的目录，再写文件。首次调用 JSON 写入脚本前完整读取 `record-writer.md`。JSON 结构以 `../assets/record-contract.json` 的 `$defs` 为准；只读取当前记录对应定义及其引用。

主 Agent 首次只读取 task、settings、stage_input、stage_result 及其引用定义；子 Agent 按下表中的本阶段产物类型选择定义。用以下命令提取指定定义和全部引用，将命令末尾的定义名称替换为本次需要读取的定义名称：

```sh
node -e 'const fs=require("node:fs"); const [file,...names]=process.argv.slice(1); const source=JSON.parse(fs.readFileSync(file,"utf8")); const out={}; function add(name){if(Object.hasOwn(out,name))return; if(!source.$defs[name])throw Error("Unknown definition: "+name); out[name]=source.$defs[name]; function visit(v){if(!v||typeof v!=="object")return; if(v.$ref)add(v.$ref.split("/").pop()); Object.values(v).forEach(visit)} visit(out[name])} names.forEach(add); console.log(JSON.stringify({$defs:out},null,2))' "<本Skill目录>/assets/record-contract.json" task settings stage_input stage_result
```

| 文件 | 对应定义与写入者 | 内容来源 |
|---|---|---|
| task.json | task；主 Agent | 用户请求、用户确认原文、实际生效的配置值、阶段摘要、基线引用，以及实际调用和剩余额度 |
| input.json、prompt.txt | 主 Agent；input.json 对应 stage_input，prompt.txt 为文本 | input.json 保存阶段输入，prompt.txt 保存实际发送的委派消息原文 |
| result.json | stage_result；本阶段子 Agent | 阶段状态、产物路径、问题、简短结论和下一步；具体设计、请求和观察内容保存在各自产物文件中 |
| design.json | design；构图子 Agent | 材料事实、心理推导、构图选择和用户确认稿 |
| config-result.json | 模型查询的原生 JSON；配置子 Agent | 保留模型查询的原始输出和 skill_name；模板及 LoRA 查询各存独立 JSON，兼容性判断和这些路径写入 result.json |
| builder-result.json、validation.json | 原生 Builder 结果及校验输出；Prompt 子 Agent | 原有 Skill 的完整结果，不改造其属性 |
| round.json、review.md | 比较子 Agent；round.json 对应 round，review.md 为文本 | 本轮判断、假设、全部改动、统计、取舍与经验；review.md 用于阅读，不重复完整 Prompt |
| requests/001.json | 原生 Generation Request；生成子 Agent | 提交前完整请求；保存后不改写，参数变化时使用新请求序号或候选 |
| runs/001.json | run；生成子 Agent 首次写入，查询子 Agent 在交接后补充 | 生成阶段写提交状态及逐调用回执；查询阶段补充实际输入、Workflow、媒体和查询引用，并根据真实回执纠正未知提交状态 |
| queries/*.json | CLI 原生 JSON；查询子 Agent | 每次查询单独保存，命令级失败另存退出码、stdout 和 stderr |
| media/* | 原媒体后缀；查询子 Agent | 按 CLI file_path 复制图片，Run 记录保留原路径和副本路径 |
| observations/*.json | observation；观察子 Agent | 实际观察 prompt、provider、model、原始文本或错误；每次调用单独保存 |
| selection.json、配方.md | 归档子 Agent；selection.json 对应 selection，配方.md 为文本 | JSON 保存用户采用原文或自主选图授权、逐镜头选图、复验分组和最终状态；配方引用已有请求及图片 |

阶段结束后，原执行者不再修改已交接产物。主 Agent 可将 Run 记录明确交给查询子 Agent 按上表补充；其他已交接产物保持原内容。已确认 design.json 保持不变，新设计使用新阶段 ID；task.json 的目标版本保存设计引用与对应确认原文。阶段结果引用已有轮次产物，不另存同一设计、请求或观察结果的另一份可修改副本。

# 派发前后的状态与预算

主 Agent 在派发前保存输入及实际消息，并将 task.json 中对应 stages 项的 status 写为 pending，调用时改为 running。result.json 符合 stage_result 定义、stage_id 与本阶段一致且 artifacts 引用的文件存在后，主 Agent 将阶段 status 改为结果中的 completed、needs_input、failed 或 partial。completed 只表示本阶段完成，不等于图片生成完成或用户采用。

生成前主 Agent 根据计划图数及明确允许的重试次数，在 task.json 对应 stages 项的 reserved 中预留调用次数，并保证同时只有一个生成子任务；总额度须容纳已消耗次数与尚未结算的预留次数。生成子 Agent 先保存全部请求，将对应 Run 记录的 submission_status 写为 prepared。每次真实调用前在该 Run 记录的 attempts 中追加一项，将该项 status 和 submission_status 写为 submitting，占用一次额度。得到 Run ID 后将两处状态写为 accepted；明确未创建 Run 的错误写为 rejected；无法判断是否已受理写为 unknown，并停止本批剩余调用。

每次重试独立记入 attempts，额度包含拒绝的实际调用。实际调用次数以提交记录与回执为依据，不能由图片张数推算；缺少调用依据时报告无法结算，保持现有额度占用。submitting 是调用前保存的状态，仅凭该状态不能证明调用已经发生，恢复时结合调用回执核对。尚未调用的 prepared 请求不消耗额度。生成结果 consumed 包含所有实际调用，reserved_unknown 是其中未知结果的数量，不重复扣减。

# 根据记录恢复任务

恢复时主 Agent 读取 task.json 的当前目标、基线引用和阶段索引，委派查询子 Agent 检查未完成阶段引用的请求、调用回执、图片和观察记录；缺少 result.json 不能证明该阶段没有执行实际调用。

- accepted 且有 Run ID：查询实际请求与媒体，继续已有结果，不重发。
- submitting 或 unknown：先核对回执文件；有真实 Run ID 则查询，没有可查询 ID 则保留 unknown，并转交用户决定。
- prepared：只有确认前次子任务已经结束且没有对应调用记录，才可安排提交。
- rejected：保留原错误，原因修正后使用新调用序号并占用新额度。
- 已有图片或观察：继续观察或比较，不重新生成；完整查询与媒体引用保留。

查询子 Agent 将额度核对写入本阶段 result.json 的 budget_reconciliation。主 Agent 在核对完成前保留原预留，之后仅释放确认未调用的部分；已确认发生调用但受理结果未知的项目仍计入 consumed；尚不能确认是否发生调用的项目保留预留额度，并记录无法结算的原因。未执行生成调用的阶段，其原执行已结束但缺产物时，使用新阶段 ID 重试，保留旧阶段错误。

媒体查询不提供完整 Run 状态；没有图片时记录 no_saved_image，不能把它写成生成失败。观察失败和观察不确定分别保存，不据此自动增加生成次数。

# 写出最终配方

归档子 Agent 根据结构化记录写 `final/selection.json` 和 `final/配方.md`。配方按以下用途组织：

1. 画面目标与已确认的核心表达。
2. 最终图片、请求和配置的相对链接，以及对应 Run ID。
3. 每份配置的每个镜头在各复验批次中的计划图片数，以及同图满足核心表达和全部适用必需项的图片数。
4. 已采用与已省略要素的表达作用和理由。
5. 失败试验、改动效果、哪些改动在何种配置或镜头条件下仍可使用，以及尚未验证的改动和未验证原因。
6. 复现步骤与未解决项。

成功交付附用户采用记录或明确自主选图授权。未完成任务保存停止原因；已有候选时保存最佳候选的引用，没有候选时明确记录尚无候选。归档子 Agent 检查引用文件均存在，并核对每张图片记录中的请求引用和 Run ID。
