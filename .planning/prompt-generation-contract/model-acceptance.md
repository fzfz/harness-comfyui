# Prompt Builder 与 ComfyUI 真实模型验收记录

## 验收结论

三个 Prompt Builder 的结构化结果、生成目的、模板无关尺寸与模型负向策略已经通过真实 Desktop Agent 的语义分支验收。`comfyui-generate` 的模板实时检查、尺寸适配、普通随机 Seed、固定 Seed、历史 Seed、失败重试 Seed 和逐图 `batch_size: 1` 已经通过真实 managed CLI 与 Generation Run 验收。40 个尺寸配置均已生成可读图片。独立视觉 Reviewer 对最终候选逐图执行视觉模型调用；40 个配置的最终结果为 PASS 6、CONDITIONAL 34、FAIL 0，profile 决定为 RETAIN 40、DELETE 0。第一轮 10 个 FAIL 配置全部复用原 Seed 和尺寸进行 Prompt 修正与真实重跑，并在第二轮逐图终验中取得 1 个 PASS 和 9 个 CONDITIONAL。

## Desktop 环境

- worktree：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-prompt-generation-contract`
- 分支：`codex/prompt-generation-contract-plan`
- 验收基线：`08d54a5ef942a85b4b05a355f1b9b8bf6ac12603`
- Agent Preset：内部 ID 为 `harness-comfyui-cli-candidate`，界面名称为 `ComfyUI工作台预设`。
- Provider 与 Agent 模型：`opencode-go/deepseek-v4-flash`。
- 图片观察 Provider 与模型：`opencode-go/qwen3.7-plus`。
- Workspace：`/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness`；Workspace ID 为 `aecf96c5-e6af-41d1-86b8-784c34689549`。
- 启动方式：计划执行者在前台执行 `pnpm dev:start`；第一轮第二终端的 `pnpm dev:status` 返回 Desktop PID `33127` 与移动桥接端口 `65072`。补充验收重新以前台方式启动同一 worktree，第二终端返回 PID `30257` 与移动桥接端口 `59341`。
- 日志：`pnpm dev:logs` 确认 candidate generation 已链接，Harness endpoint 与本次开发 Desktop 动态端口一致。
- 媒体根目录：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-prompt-generation-contract/.local/desktop-development/saved-media`。
- 验收结束停止状态：第一轮 `pnpm dev:stop` 返回 `{"status":"stopped","pid":33127}`。补充验收结束后 `pnpm dev:stop` 返回 `{"status":"stopped","pid":30257}`，随后 `pnpm dev:status` 返回 `{"status":"stopped"}`；补充验收的前台 `dev:start` 进程收到预期 `SIGTERM` 后退出。

## 实际命令合同

产品合同的验收证据来自真实 Agent 在 Harness 前台 managed shell 中调用的以下项目 CLI：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation inspect-template-parameters --stdin
node "$DSH_HARNESS_COMFYUI_CLI" generation random-seeds --stdin
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin
node "$DSH_HARNESS_COMFYUI_CLI" generation resolve-media --stdin
node "$DSH_HARNESS_COMFYUI_CLI" image inspect --stdin
```

模板检查使用 `{"template_id":"<当前 Workflow ID>","instance_id":"2"}`。每项提交都使用一个独立 Generation Request、一个独立 shell Tool Call、一个明确整数 Seed 和 `batch_size: 1`。每个 Run 的完整正向 Prompt、负向 Prompt或正向规避、模型覆盖、LoRA、参数 ID 与实际值均保存在 Run Repository 的 `request_json`；本表中的 canonical `run_id` 是对应原始参数和 Actual Workflow 的查询标识。全部 40 项使用空 LoRA 数组。

## 三条模型路线的实际画面请求与 Prompt 策略

### ANIMA

- 画面请求：一名成年女剑士位于竹林石桥，双手分别握住一把完整长剑；Prompt 明确主体数量、两剑归属、手指、完整人物、鞋履、留白、薄雾和逆光。横幅 profile 使用横向环境布局，竖幅 profile 使用完整角色布局。
- 正向 Prompt：按十二槽 ANIMA 内部 Prompt 构造并通过 `--prompt-format` 校验，再写入结构化结果的 `positive_prompt`。
- 负向模式：`native_negative`。实际路线为 `anima-aesthetic-v1.1`；基础集合为 `worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration`，并只追加本轮双剑、肢体、手脚、重复主体和裁切风险。
- Workflow：模板 `39`、实例 `2`。模板默认模型为 `anima-aesthetic-v1.1.safetensors`，Generation Request 不覆盖模型。
- 模板检查：返回唯一 `positive_prompt`、`negative_prompt`、`seed`、`batch_size` 和 `width_height:width:height`；检查返回的具体参数能够由同一个 Workflow compiler 应用到 Actual Workflow。

### WAI-Illustrious-SDXL

- 画面请求：一名成年真人女性机械师站在工业工作台前，脸、自然皮肤和双手可见，机械设备位于工作台后方并与人物明确分离。横幅 profile 把人物与工作台安排在不同画面区域，竖幅 profile 保留完整人物。
- 正向 Prompt：使用 WAI 标签语法与简短质量前缀，明确 `adult human woman`、自然面孔、自然双手、服装、姿态和设备归属。
- 负向模式：`native_negative`。基础集合为 `bad quality, worst quality, worst detail, sketch, censor`，只追加当前机械师画面中的机器人身体、机械肢体、遮脸、畸形手脚、重复人物、裁切与模糊风险。
- Workflow：模板 `28`、实例 `2`。修正 Run 显式使用 Catalog 模型 ID `1` 与 `waiIllustriousSDXL_v170.safetensors`；已保留的早期 Run 使用同一路线的模板模型。
- 模板检查：返回唯一 `positive_prompt`、`negative_prompt`、`seed`、`batch_size` 和末端 `width_height:width_6:height_6`；检查排除上游被末端 LatentUpscale 覆盖的尺寸参数。

### Krea2

- 画面请求：一名成年芭蕾舞者位于镜墙练功房，实体人物加镜中恰好一个倒影；Prompt 明确双臂在下腹前方形成低位圆弧、每只手各有五根自然连接的手指、完整身体、鞋履、脚下余量以及实体与倒影分离。
- 正向 Prompt：使用自然语言并合并 `positive_avoidance`。Krea2 结果没有原生负向 Prompt；规避内容必须作为可见的正向约束进入同一 `positive_prompt`。
- 负向模式：`positive_rewrite`；`positive_avoidance` 保存需要自然写入正向 Prompt 的规避说明，`negative_prompt` 为 `null`。
- Workflow：最终可用图片使用模板 `27`、实例 `2`、Catalog 模型 ID `11`、`Krea2-MuseByStable_v15Turbo_fp8.safetensors`。模板 `27` 直接接受 Builder 的精确宽高，因此可以覆盖 `1:2`。
- 模板选择说明：计划执行者先检查并真实提交模板 `36` 的 10 个可表达 Selector 配置。模板 `36` 的 `aspect_ratio` 与 `megapixels` 参数均通过 Workflow compiler 写入 Actual Workflow，但远端 ComfyUI 同时报告模板保存的默认 `reference_image` 文件不存在，以及五个仍处于活动状态的 `SaveImage` 节点缺少 `images` 输入，因此拒绝全部 10 个 Run。模板 `21` 的实时检查返回相同的默认参考图，因此在不修改模板和不提供用户参考图的条件下同样不能生成。模板 `36` 与 `21` 的 Selector 也不包含 `1:2`，最近的 `9:16` 与 `1:2` 比例偏差为 12.5%，超过 5% 自动调整阈值。计划执行者没有修改模板、补造参考图或把 `1:2` 静默改为 `9:16`；最终图片使用支持精确宽高且与 Krea2 模型兼容的模板 `27`。这些事实属于当前模板兼容性结果，不属于模板无关的 Builder profile 失败。

## 40 个配置的 Generation Run 与媒体证据

表中“语义”表示独立语义 Reviewer 已确认画面请求、Prompt、负向策略、生成目的和 Builder 目标尺寸符合对应 Skill 参考文档。“视觉/profile”由独立图片 Reviewer 只根据对应图片填写。媒体路径以本记录前述媒体根目录为基准。

| 配置 | 路线 | 目的 | 画幅 | Builder/实际尺寸 | 模板/实例 | Seed | Run ID | 媒体相对路径 | 语义 | 视觉/profile |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| A01 | ANIMA | test | 1:1 | 512×512 | 39/2 | 1450367063 | `run_359c8220-bdb2-4f5f-9e69-6c1b19f35ef5` | `05/3f/media_053f29d5-d27a-4e22-a307-b81252c34add.png` | 通过 | CONDITIONAL / RETAIN |
| A02 | ANIMA | final | 1:1 | 1024×1024 | 39/2 | 1802551539 | `run_4b55b66e-a43f-4e86-be32-40f5acbd6f6d` | `68/ad/media_68ad7fec-c1c7-448a-a89a-5fe59028cb01.png` | 通过 | CONDITIONAL / RETAIN |
| A03 | ANIMA | test | 7:9 | 448×576 | 39/2 | 987292852 | `run_92689917-185f-48a4-ada3-37f34d0cf244` | `83/d1/media_83d13d0b-f840-4cb8-9d3a-dfdcae881186.png` | 通过 | CONDITIONAL / RETAIN |
| A04 | ANIMA | final | 7:9 | 896×1152 | 39/2 | 1298104030 | `run_31a281be-ce59-495f-ab6d-fc2d09924ed5` | `de/ad/media_dead5d94-686f-4ac2-a24d-f3ffc7789926.png` | 通过 | CONDITIONAL / RETAIN |
| A05 | ANIMA | test | 9:7 | 576×448 | 39/2 | 1822031797 | `run_4ada4843-bc6d-4eef-9b48-af7ebeb4bfb1` | `f3/fa/media_f3fa5690-d961-4c23-966f-185c6fe11454.png` | 通过 | CONDITIONAL / RETAIN |
| A06 | ANIMA | final | 9:7 | 1152×896 | 39/2 | 274869578 | `run_45fa2542-d721-4d18-8a3f-f2d6a0f7155b` | `1c/cb/media_1ccbcab8-9c23-439a-9b82-d93c60a55184.png` | 通过 | CONDITIONAL / RETAIN |
| A07 | ANIMA | test | 9:16 | 576×1024 | 39/2 | 1754238138 | `run_10bb20c3-8f07-4c4c-a306-d07aeba4fea1` | `58/59/media_585965b4-1dc0-4349-af46-d79d2b0de13f.png` | 通过 | CONDITIONAL / RETAIN |
| A08 | ANIMA | final | 9:16 | 864×1536 | 39/2 | 899344041 | `run_05a00eab-9f29-4195-abcc-0f8f9f4262b6` | `ae/14/media_ae14cffd-f540-4e00-a2ed-894c276feccb.png` | 通过 | CONDITIONAL / RETAIN |
| A09 | ANIMA | test | 16:9 | 1024×576 | 39/2 | 1752890807 | `run_36041212-1461-40de-abbd-24cf82d9b3cd` | `9e/82/media_9e82c274-72e9-4006-aeed-b47e035d9587.png` | 通过 | PASS / RETAIN |
| A10 | ANIMA | final | 16:9 | 1536×864 | 39/2 | 2103243034 | `run_09b3b13c-987f-41f4-9e9a-c8910dccc6f0` | `cc/19/media_cc1950eb-c3b6-4af2-badd-3121fc174ce3.png` | 通过 | PASS / RETAIN |
| W01 | WAI | test | 1:1 | 1024×1024 | 28/2 | 1743239296 | `run_8ab522a1-d6af-45f2-a918-dfb8fc404759` | `01/fa/media_01fa1340-2338-4622-929d-ddc9108b62df.png` | 通过 | CONDITIONAL / RETAIN |
| W02 | WAI | final | 1:1 | 1536×1536 | 28/2 | 649522919 | `run_cc41aa7e-0e94-4118-8bb9-24ccf6414f41` | `82/80/media_8280d93d-5c85-48d3-952b-3d23faeb85bc.png` | 通过 | CONDITIONAL / RETAIN |
| W03 | WAI | test | 7:9 | 896×1152 | 28/2 | 134564216 | `run_cb0e005f-b7da-44ef-aeaf-631848c641e6` | `ea/48/media_ea486e34-ae41-4d1d-9fd4-e97e7687cb85.png` | 通过 | CONDITIONAL / RETAIN |
| W04 | WAI | final | 7:9 | 1344×1728 | 28/2 | 1835120904 | `run_dfaa3bdc-bee4-4ae6-bfc6-2de69c07510e` | `bf/e6/media_bfe6e8db-8ea5-4d23-a7af-a8397e81b176.png` | 通过 | CONDITIONAL / RETAIN |
| W05 | WAI | test | 9:7 | 1152×896 | 28/2 | 776380514 | `run_363a1fd5-9416-4313-b344-7e4899b434c6` | `ce/b8/media_ceb8f7cf-9c4d-4937-846a-4773c0681fcb.png` | 通过 | CONDITIONAL / RETAIN |
| W06 | WAI | final | 9:7 | 1728×1344 | 28/2 | 1074850481 | `run_70cf3a70-facc-4cab-9043-35ccc7d3dad0` | `3e/da/media_3edac12e-715f-443b-9856-1abab151bcf7.png` | 通过 | CONDITIONAL / RETAIN |
| W07 | WAI | test | 13:19 | 832×1216 | 28/2 | 1620266177 | `run_315537ef-f02b-4ebb-a7f4-887e9630310b` | `0c/24/media_0c248dcb-3518-4bef-b6da-7682ec00afd9.png` | 通过 | CONDITIONAL / RETAIN |
| W08 | WAI | final | 13:19 | 1248×1824 | 28/2 | 131500385 | `run_d3861f69-6933-47ef-8b41-d75afe7eb168` | `c1/e4/media_c1e44efb-9fba-4003-8983-2aaabbe82252.png` | 通过 | CONDITIONAL / RETAIN |
| W09 | WAI | test | 19:13 | 1216×832 | 28/2 | 1207566519 | `run_b824d85e-d15e-4336-99e9-2b6cfb658bb7` | `f8/ed/media_f8edebb9-f6df-4e63-8d30-01ccc0941450.png` | 通过 | PASS / RETAIN |
| W10 | WAI | final | 19:13 | 1824×1248 | 28/2 | 265753330 | `run_01e102ef-3da7-44f5-b90f-bbad010dd61b` | `f0/d9/media_f0d9cc21-4bf6-4fad-8b42-5e9c9e7bfd80.png` | 通过 | CONDITIONAL / RETAIN |
| W11 | WAI | test | 4:7 | 768×1344 | 28/2 | 735917136 | `run_81f14550-9610-48cc-84c0-38d27bedf8ba` | `78/d6/media_78d6a4d5-3237-49df-9552-bdc44ada5a44.png` | 通过 | CONDITIONAL / RETAIN |
| W12 | WAI | final | 4:7 | 1152×2016 | 28/2 | 579414316 | `run_6b04bce0-080a-4b19-a78d-2425419170eb` | `05/d0/media_05d00791-9878-4e5e-9eb3-ac8195457f42.png` | 通过 | CONDITIONAL / RETAIN |
| W13 | WAI | test | 7:4 | 1344×768 | 28/2 | 2128705244 | `run_dd48f8c9-e84f-415d-95cc-80c155c0f5aa` | `c4/d3/media_c4d3b8b2-8c67-4cb9-a1fd-185b1d93c103.png` | 通过 | CONDITIONAL / RETAIN |
| W14 | WAI | final | 7:4 | 2016×1152 | 28/2 | 1116969248 | `run_493001f8-99a7-4c4d-a0a6-d7a7564164a0` | `3d/f2/media_3df20fef-522e-484d-bc31-136164fec0d7.png` | 通过 | CONDITIONAL / RETAIN |
| W15 | WAI | test | 9:16 | 864×1536 | 28/2 | 1384071151 | `run_f4d62d86-b7ed-424a-927f-bf5400f1bffc` | `d6/5d/media_d65db59d-fc38-466a-830e-7eabcc05a191.png` | 通过 | CONDITIONAL / RETAIN |
| W16 | WAI | final | 9:16 | 1152×2048 | 28/2 | 1623625900 | `run_64b66a6d-f634-4cdd-b743-51f919ed942a` | `32/af/media_32aff9ae-9216-4adb-8ec7-2e79f518f33d.png` | 通过 | CONDITIONAL / RETAIN |
| W17 | WAI | test | 16:9 | 1536×864 | 28/2 | 369592682 | `run_e0868952-c6bb-446f-8f66-13240060fc6b` | `02/f0/media_02f0d29a-d8f6-41de-b637-afb55fbe97c7.png` | 通过 | CONDITIONAL / RETAIN |
| W18 | WAI | final | 16:9 | 2048×1152 | 28/2 | 184720774 | `run_2b4c3661-85bb-4ebe-93e5-7b67d5a9439a` | `1b/35/media_1b350031-4ff6-416e-8607-404d7e41f662.png` | 通过 | CONDITIONAL / RETAIN |
| K01 | Krea2 | test | 1:1 | 1024×1024 | 27/2 | 342289265 | `run_0091f272-bcb7-4d70-9102-8ab1b7bb8a76` | `f9/06/media_f9062c37-e7e9-49e6-b54f-8ecb4688122d.png` | 通过 | PASS / RETAIN |
| K02 | Krea2 | final | 1:1 | 1440×1440 | 27/2 | 1752018808 | `run_fcbc06ab-2e05-4991-b49e-877abf3b7404` | `5c/25/media_5c251cb9-4913-4f5e-bb5c-7bc68e888cf0.png` | 通过 | CONDITIONAL / RETAIN |
| K03 | Krea2 | test | 1:2 | 704×1408 | 27/2 | 446618212 | `run_2f05d7e0-65ee-426e-829e-b42956fca798` | `94/a4/media_94a479bb-b20a-42c8-b248-ce776eec8196.png` | 通过 | CONDITIONAL / RETAIN |
| K04 | Krea2 | final | 1:2 | 1024×2048 | 27/2 | 1841090471 | `run_a96ce6c2-ab7e-40cd-b90a-bd87aef633cd` | `51/05/media_5105ce2c-8e54-4af8-85e9-5af67978b225.png` | 通过 | CONDITIONAL / RETAIN |
| K05 | Krea2 | test | 2:3 | 832×1248 | 27/2 | 1017534094 | `run_4c5f50c0-0f81-49c0-b52c-a0292177c17e` | `8d/c6/media_8dc69994-6314-4371-80a9-2490c3ee6285.png` | 通过 | CONDITIONAL / RETAIN |
| K06 | Krea2 | final | 2:3 | 1152×1728 | 27/2 | 2053643763 | `run_ad7a29f3-7e15-4734-a21c-6fd3a448441c` | `6a/2c/media_6a2c77f5-e28c-4337-9099-980b4f96a222.png` | 通过 | CONDITIONAL / RETAIN |
| K07 | Krea2 | test | 3:2 | 1248×832 | 27/2 | 36163189 | `run_cbca0666-c78a-46e9-9ab7-2d4847269a60` | `dc/5e/media_dc5ed6c7-a099-426b-9d4d-404a138e20b5.png` | 通过 | PASS / RETAIN |
| K08 | Krea2 | final | 3:2 | 1728×1152 | 27/2 | 303259861 | `run_fcf06a33-0461-45ce-adcc-06eb8db181e6` | `c7/13/media_c713a1b1-8374-4875-9e98-49f923f34d09.png` | 通过 | PASS / RETAIN |
| K09 | Krea2 | test | 9:16 | 864×1536 | 27/2 | 1026922462 | `run_623a9ef6-fc4d-4f3d-8bcd-8c097d313b7a` | `7b/bc/media_7bbcc14a-a9cd-499d-b15c-be5b626db0b4.png` | 通过 | CONDITIONAL / RETAIN |
| K10 | Krea2 | final | 9:16 | 1152×2048 | 27/2 | 1443054101 | `run_55db0ee4-0263-49a0-9622-098c87015490` | `a6/df/media_a6df9919-4692-4c03-b26b-a06aa0df6d63.png` | 通过 | CONDITIONAL / RETAIN |
| K11 | Krea2 | test | 16:9 | 1536×864 | 27/2 | 157770070 | `run_b61753b3-f1cc-4993-bc6b-bf3649b7d34e` | `4c/00/media_4c00c7a6-5d83-4fb6-9039-720e4db91624.png` | 通过 | CONDITIONAL / RETAIN |
| K12 | Krea2 | final | 16:9 | 2048×1152 | 27/2 | 506925948 | `run_0bb33f28-6f25-4f96-a6c5-9f92cc02a7c6` | `34/7a/media_347a7ba3-a718-4c0d-9b06-fa232a8ed806.png` | 通过 | CONDITIONAL / RETAIN |

全部 40 个 Run 的状态为 `succeeded`，实际媒体像素尺寸与表中尺寸一致。每项请求保存一个整数 Seed 和 `batch_size: 1`。

## 逐配置 CLI 与参数证据

上表的 40 行与下列 40 份证据一一对应。每份证据保存实际 `generation submit --stdin` 命令输入、实际 stdout、实际单项 `generation run-inputs --stdin` 命令、回读的完整 `arguments`，以及 Actual Workflow 中承载这些运行参数的具体节点、`widgets_values` 索引和值。提交 stdin 与回读 `arguments` 完整保留正向 Prompt、负向 Prompt、模型覆盖、空 LoRA 数组、Seed、尺寸参数和 `batch_size`。Actual Workflow 的版本化投影完整保留正向 Prompt、负向 Prompt、Seed、尺寸参数和 `batch_size` 对应的节点值，只省略与这些运行参数无关的固定模板拓扑。40 次提交和回读的退出码均为 `0`，stderr 均为空；每个单项回读均返回 `lookup_status: "available"` 与 `workflow_status: "available"`。

三组实际模板检查结果规定了提交参数 ID 与 Actual Workflow 投影位置：

| 检查合同 | 配置行 | 模板/实例 | 正向参数 ID | 负向参数 ID | Seed 参数 ID | 批量参数 ID | 尺寸参数 ID | Actual Workflow 位置 | 目标到实际 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `I39-2` | A01–A10 | 39/2 | `positive_prompt` | `negative_prompt` | `seed` | `batch_size` | `width`, `height` | 节点 3[0]、4[0]、31[0]、52[0]、39[0]、47[0] | 目标宽高原值提交；比例与面积偏差均为 0% |
| `I28-2` | W01–W18 | 28/2 | `positive_prompt` | `negative_prompt` | `seed` | `batch_size` | `width_6`, `height_6` | 节点 2[0]、3[0]、5[0]、4[2]、6[1]、6[2] | 目标宽高原值提交；比例与面积偏差均为 0% |
| `I27-2` | K01–K12 | 27/2 | `positive_prompt` | 不存在；请求不含负向参数 | `seed` | `batch_size` | `width`, `height` | 节点 164[0]、153[0]、156[2]、156[0]、156[1] | 目标宽高原值提交；比例与面积偏差均为 0% |

同一模板与实例的配置复用一次仍完整可见的检查结果；模板或实例改变时重新检查。ANIMA 和 WAI 的每份证据都包含非空 `negative_prompt`。Krea2 的每份证据都不包含 `negative_prompt`；Builder 的 `positive_avoidance` 语义已经合并到同一 `positive_prompt` 中。

### 40 份提交与 Actual Workflow 证据

<details>
<summary>A01 — ANIMA / test / 1:1 / 512×512</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"A01 correction same-seed","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":512,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, cropped, cropped weapon, missing sword tip","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), arms_at_sides, direct eye contact, composed, (full body), from front, facing viewer, symmetry, full_composition, bamboo_forest, bridge, railing, fog, lens flare, ethereal, she stands centered on the stone bridge facing the viewer with both shoes visible, each hand holds a complete longsword close beside her body almost vertical and pointing downward with the whole blade from hilt to tip inside the frame and clear margins on all four sides","seed":1450367063,"width":512},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_359c8220-bdb2-4f5f-9e69-6c1b19f35ef5"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_359c8220-bdb2-4f5f-9e69-6c1b19f35ef5"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"A01 correction same-seed","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":512,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, cropped, cropped weapon, missing sword tip","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), arms_at_sides, direct eye contact, composed, (full body), from front, facing viewer, symmetry, full_composition, bamboo_forest, bridge, railing, fog, lens flare, ethereal, she stands centered on the stone bridge facing the viewer with both shoes visible, each hand holds a complete longsword close beside her body almost vertical and pointing downward with the whole blade from hilt to tip inside the frame and clear margins on all four sides","seed":1450367063,"width":512},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":3,"widgets_values_index":0,"value":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), arms_at_sides, direct eye contact, composed, (full body), from front, facing viewer, symmetry, full_composition, bamboo_forest, bridge, railing, fog, lens flare, ethereal, she stands centered on the stone bridge facing the viewer with both shoes visible, each hand holds a complete longsword close beside her body almost vertical and pointing downward with the whole blade from hilt to tip inside the frame and clear margins on all four sides"},"negative_prompt":{"node_id":4,"widgets_values_index":0,"value":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, cropped, cropped weapon, missing sword tip"},"seed":{"node_id":31,"widgets_values_index":0,"value":1450367063},"batch_size":{"node_id":52,"widgets_values_index":0,"value":1},"width":{"node_id":39,"widgets_values_index":0,"value":512},"height":{"node_id":47,"widgets_values_index":0,"value":512}}`

</details>

<details>
<summary>A02 — ANIMA / final / 1:1 / 1024×1024</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"A02_final_1:1_1024x1024_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":1024,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":1802551539,"width":1024},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_4b55b66e-a43f-4e86-be32-40f5acbd6f6d"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_4b55b66e-a43f-4e86-be32-40f5acbd6f6d"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"A02_final_1:1_1024x1024_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":1024,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":1802551539,"width":1024},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":3,"widgets_values_index":0,"value":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated"},"negative_prompt":{"node_id":4,"widgets_values_index":0,"value":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres"},"seed":{"node_id":31,"widgets_values_index":0,"value":1802551539},"batch_size":{"node_id":52,"widgets_values_index":0,"value":1},"width":{"node_id":39,"widgets_values_index":0,"value":1024},"height":{"node_id":47,"widgets_values_index":0,"value":1024}}`

</details>

<details>
<summary>A03 — ANIMA / test / 7:9 / 448×576</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"A03_test_7:9_448x576_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":576,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":987292852,"width":448},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_92689917-185f-48a4-ada3-37f34d0cf244"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_92689917-185f-48a4-ada3-37f34d0cf244"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"A03_test_7:9_448x576_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":576,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":987292852,"width":448},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":3,"widgets_values_index":0,"value":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated"},"negative_prompt":{"node_id":4,"widgets_values_index":0,"value":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres"},"seed":{"node_id":31,"widgets_values_index":0,"value":987292852},"batch_size":{"node_id":52,"widgets_values_index":0,"value":1},"width":{"node_id":39,"widgets_values_index":0,"value":448},"height":{"node_id":47,"widgets_values_index":0,"value":576}}`

</details>

<details>
<summary>A04 — ANIMA / final / 7:9 / 896×1152</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"A04_final_7:9_896x1152_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":1152,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":1298104030,"width":896},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_31a281be-ce59-495f-ab6d-fc2d09924ed5"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_31a281be-ce59-495f-ab6d-fc2d09924ed5"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"A04_final_7:9_896x1152_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":1152,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":1298104030,"width":896},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":3,"widgets_values_index":0,"value":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated"},"negative_prompt":{"node_id":4,"widgets_values_index":0,"value":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres"},"seed":{"node_id":31,"widgets_values_index":0,"value":1298104030},"batch_size":{"node_id":52,"widgets_values_index":0,"value":1},"width":{"node_id":39,"widgets_values_index":0,"value":896},"height":{"node_id":47,"widgets_values_index":0,"value":1152}}`

</details>

<details>
<summary>A05 — ANIMA / test / 9:7 / 576×448</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"A05_test_9:7_576x448_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":448,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":1822031797,"width":576},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_4ada4843-bc6d-4eef-9b48-af7ebeb4bfb1"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_4ada4843-bc6d-4eef-9b48-af7ebeb4bfb1"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"A05_test_9:7_576x448_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":448,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":1822031797,"width":576},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":3,"widgets_values_index":0,"value":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated"},"negative_prompt":{"node_id":4,"widgets_values_index":0,"value":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres"},"seed":{"node_id":31,"widgets_values_index":0,"value":1822031797},"batch_size":{"node_id":52,"widgets_values_index":0,"value":1},"width":{"node_id":39,"widgets_values_index":0,"value":576},"height":{"node_id":47,"widgets_values_index":0,"value":448}}`

</details>

<details>
<summary>A06 — ANIMA / final / 9:7 / 1152×896</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"A06_final_9:7_1152x896_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":896,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":274869578,"width":1152},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_45fa2542-d721-4d18-8a3f-f2d6a0f7155b"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_45fa2542-d721-4d18-8a3f-f2d6a0f7155b"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"A06_final_9:7_1152x896_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":896,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":274869578,"width":1152},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":3,"widgets_values_index":0,"value":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated"},"negative_prompt":{"node_id":4,"widgets_values_index":0,"value":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres"},"seed":{"node_id":31,"widgets_values_index":0,"value":274869578},"batch_size":{"node_id":52,"widgets_values_index":0,"value":1},"width":{"node_id":39,"widgets_values_index":0,"value":1152},"height":{"node_id":47,"widgets_values_index":0,"value":896}}`

</details>

<details>
<summary>A07 — ANIMA / test / 9:16 / 576×1024</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"A07_test_9:16_576x1024_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":1024,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":1754238138,"width":576},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_10bb20c3-8f07-4c4c-a306-d07aeba4fea1"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_10bb20c3-8f07-4c4c-a306-d07aeba4fea1"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"A07_test_9:16_576x1024_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":1024,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":1754238138,"width":576},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":3,"widgets_values_index":0,"value":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated"},"negative_prompt":{"node_id":4,"widgets_values_index":0,"value":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres"},"seed":{"node_id":31,"widgets_values_index":0,"value":1754238138},"batch_size":{"node_id":52,"widgets_values_index":0,"value":1},"width":{"node_id":39,"widgets_values_index":0,"value":576},"height":{"node_id":47,"widgets_values_index":0,"value":1024}}`

</details>

<details>
<summary>A08 — ANIMA / final / 9:16 / 864×1536</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"A08_final_9:16_864x1536_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":1536,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":899344041,"width":864},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_05a00eab-9f29-4195-abcc-0f8f9f4262b6"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_05a00eab-9f29-4195-abcc-0f8f9f4262b6"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"A08_final_9:16_864x1536_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":1536,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":899344041,"width":864},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":3,"widgets_values_index":0,"value":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated"},"negative_prompt":{"node_id":4,"widgets_values_index":0,"value":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres"},"seed":{"node_id":31,"widgets_values_index":0,"value":899344041},"batch_size":{"node_id":52,"widgets_values_index":0,"value":1},"width":{"node_id":39,"widgets_values_index":0,"value":864},"height":{"node_id":47,"widgets_values_index":0,"value":1536}}`

</details>

<details>
<summary>A09 — ANIMA / test / 16:9 / 1024×576</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"A09_test_16:9_1024x576_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":576,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":1752890807,"width":1024},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_36041212-1461-40de-abbd-24cf82d9b3cd"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_36041212-1461-40de-abbd-24cf82d9b3cd"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"A09_test_16:9_1024x576_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":576,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":1752890807,"width":1024},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":3,"widgets_values_index":0,"value":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated"},"negative_prompt":{"node_id":4,"widgets_values_index":0,"value":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres"},"seed":{"node_id":31,"widgets_values_index":0,"value":1752890807},"batch_size":{"node_id":52,"widgets_values_index":0,"value":1},"width":{"node_id":39,"widgets_values_index":0,"value":1024},"height":{"node_id":47,"widgets_values_index":0,"value":576}}`

</details>

<details>
<summary>A10 — ANIMA / final / 16:9 / 1536×864</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"A10_final_16:9_1536x864_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":864,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":2103243034,"width":1536},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_09b3b13c-987f-41f4-9e9a-c8910dccc6f0"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_09b3b13c-987f-41f4-9e9a-c8910dccc6f0"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"A10_final_16:9_1536x864_竹桥女剑士","instance_id":"2","template_id":"39","model":null,"parameters":{"batch_size":1,"height":864,"negative_prompt":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres","positive_prompt":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated","seed":2103243034,"width":1536},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":3,"widgets_values_index":0,"value":"masterpiece, best quality, score_7, highres, safe, 1girl, solo, long hair, black hair, high ponytail, golden eyes, mature female, tall and slender, fair skin, hanfu, white hanfu, light armor, boots, standing, (dual_wielding), holding_sword, long_sword, (spread_fingers), direct eye contact, composed, (full body), from front, facing viewer, bamboo_forest, bridge, fog, lens flare, ethereal, she stands at the center of the stone bridge holding one complete longsword in each hand with all five fingers of each hand clearly separated"},"negative_prompt":{"node_id":4,"widgets_values_index":0,"value":"worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration, cropped, fused fingers, merged fingers, bad hands, extra limbs, extra arms, extra legs, duplicate, clone, multiple girls, lowres"},"seed":{"node_id":31,"widgets_values_index":0,"value":2103243034},"batch_size":{"node_id":52,"widgets_values_index":0,"value":1},"width":{"node_id":39,"widgets_values_index":0,"value":1536},"height":{"node_id":47,"widgets_values_index":0,"value":864}}`

</details>

<details>
<summary>W01 — WAI / test / 1:1 / 1024×1024</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W01 第三版同 Seed 探针","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1024,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, automotive repair workshop interior, organized tool wall, metal workbench behind the woman, diagnostic monitor and machinery clearly separate from her body, both complete boots inside the frame, simple balanced composition, no text","seed":1743239296,"width_6":1024},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_8ab522a1-d6af-45f2-a918-dfb8fc404759"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_8ab522a1-d6af-45f2-a918-dfb8fc404759"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W01 第三版同 Seed 探针","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1024,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, automotive repair workshop interior, organized tool wall, metal workbench behind the woman, diagnostic monitor and machinery clearly separate from her body, both complete boots inside the frame, simple balanced composition, no text","seed":1743239296,"width_6":1024},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, automotive repair workshop interior, organized tool wall, metal workbench behind the woman, diagnostic monitor and machinery clearly separate from her body, both complete boots inside the frame, simple balanced composition, no text"},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text"},"seed":{"node_id":5,"widgets_values_index":0,"value":1743239296},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":1024},"height_6":{"node_id":6,"widgets_values_index":2,"value":1024}}`

</details>

<details>
<summary>W02 — WAI / final / 1:1 / 1536×1536</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W02 v3 same-seed 1:1 final","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1536,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":649522919,"width_6":1536},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_cc41aa7e-0e94-4118-8bb9-24ccf6414f41"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_cc41aa7e-0e94-4118-8bb9-24ccf6414f41"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W02 v3 same-seed 1:1 final","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1536,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":649522919,"width_6":1536},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman."},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry"},"seed":{"node_id":5,"widgets_values_index":0,"value":649522919},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":1536},"height_6":{"node_id":6,"widgets_values_index":2,"value":1536}}`

</details>

<details>
<summary>W03 — WAI / test / 7:9 / 896×1152</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W03 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1152,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, automotive repair workshop interior, organized tool wall, metal workbench behind the woman, diagnostic monitor and machinery clearly separate from her body, both complete boots inside the frame, centered vertical composition, no text","seed":134564216,"width_6":896},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_cb0e005f-b7da-44ef-aeaf-631848c641e6"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_cb0e005f-b7da-44ef-aeaf-631848c641e6"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W03 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1152,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, automotive repair workshop interior, organized tool wall, metal workbench behind the woman, diagnostic monitor and machinery clearly separate from her body, both complete boots inside the frame, centered vertical composition, no text","seed":134564216,"width_6":896},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, automotive repair workshop interior, organized tool wall, metal workbench behind the woman, diagnostic monitor and machinery clearly separate from her body, both complete boots inside the frame, centered vertical composition, no text"},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text"},"seed":{"node_id":5,"widgets_values_index":0,"value":134564216},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":896},"height_6":{"node_id":6,"widgets_values_index":2,"value":1152}}`

</details>

<details>
<summary>W04 — WAI / final / 7:9 / 1344×1728</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W04 v3 same-seed 7:9 final","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1728,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":1835120904,"width_6":1344},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_dfaa3bdc-bee4-4ae6-bfc6-2de69c07510e"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_dfaa3bdc-bee4-4ae6-bfc6-2de69c07510e"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W04 v3 same-seed 7:9 final","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1728,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":1835120904,"width_6":1344},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman."},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry"},"seed":{"node_id":5,"widgets_values_index":0,"value":1835120904},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":1344},"height_6":{"node_id":6,"widgets_values_index":2,"value":1728}}`

</details>

<details>
<summary>W05 — WAI / test / 9:7 / 1152×896</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W05 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":896,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text","seed":776380514,"width_6":1152},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_363a1fd5-9416-4313-b344-7e4899b434c6"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_363a1fd5-9416-4313-b344-7e4899b434c6"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W05 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":896,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text","seed":776380514,"width_6":1152},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text"},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text"},"seed":{"node_id":5,"widgets_values_index":0,"value":776380514},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":1152},"height_6":{"node_id":6,"widgets_values_index":2,"value":896}}`

</details>

<details>
<summary>W06 — WAI / final / 9:7 / 1728×1344</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W06 v3 same-seed 9:7 final","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1344,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":1074850481,"width_6":1728},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_70cf3a70-facc-4cab-9043-35ccc7d3dad0"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_70cf3a70-facc-4cab-9043-35ccc7d3dad0"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W06 v3 same-seed 9:7 final","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1344,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":1074850481,"width_6":1728},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman."},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry"},"seed":{"node_id":5,"widgets_values_index":0,"value":1074850481},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":1728},"height_6":{"node_id":6,"widgets_values_index":2,"value":1344}}`

</details>

<details>
<summary>W07 — WAI / test / 13:19 / 832×1216</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W07 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1216,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, automotive repair workshop interior, organized tool wall, metal workbench behind the woman, diagnostic monitor and machinery clearly separate from her body, both complete boots inside the frame, centered vertical composition, no text","seed":1620266177,"width_6":832},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_315537ef-f02b-4ebb-a7f4-887e9630310b"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_315537ef-f02b-4ebb-a7f4-887e9630310b"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W07 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1216,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, automotive repair workshop interior, organized tool wall, metal workbench behind the woman, diagnostic monitor and machinery clearly separate from her body, both complete boots inside the frame, centered vertical composition, no text","seed":1620266177,"width_6":832},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, automotive repair workshop interior, organized tool wall, metal workbench behind the woman, diagnostic monitor and machinery clearly separate from her body, both complete boots inside the frame, centered vertical composition, no text"},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text"},"seed":{"node_id":5,"widgets_values_index":0,"value":1620266177},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":832},"height_6":{"node_id":6,"widgets_values_index":2,"value":1216}}`

</details>

<details>
<summary>W08 — WAI / final / 13:19 / 1248×1824</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W08 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1824,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, automotive repair workshop interior, organized tool wall, metal workbench behind the woman, diagnostic monitor and machinery clearly separate from her body, both complete boots inside the frame, centered vertical composition, no text","seed":131500385,"width_6":1248},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_d3861f69-6933-47ef-8b41-d75afe7eb168"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_d3861f69-6933-47ef-8b41-d75afe7eb168"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W08 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1824,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, automotive repair workshop interior, organized tool wall, metal workbench behind the woman, diagnostic monitor and machinery clearly separate from her body, both complete boots inside the frame, centered vertical composition, no text","seed":131500385,"width_6":1248},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, automotive repair workshop interior, organized tool wall, metal workbench behind the woman, diagnostic monitor and machinery clearly separate from her body, both complete boots inside the frame, centered vertical composition, no text"},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text"},"seed":{"node_id":5,"widgets_values_index":0,"value":131500385},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":1248},"height_6":{"node_id":6,"widgets_values_index":2,"value":1824}}`

</details>

<details>
<summary>W09 — WAI / test / 19:13 / 1216×832</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W09 v3 same-seed 19:13 test","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":832,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":1207566519,"width_6":1216},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_b824d85e-d15e-4336-99e9-2b6cfb658bb7"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_b824d85e-d15e-4336-99e9-2b6cfb658bb7"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W09 v3 same-seed 19:13 test","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":832,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":1207566519,"width_6":1216},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman."},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry"},"seed":{"node_id":5,"widgets_values_index":0,"value":1207566519},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":1216},"height_6":{"node_id":6,"widgets_values_index":2,"value":832}}`

</details>

<details>
<summary>W10 — WAI / final / 19:13 / 1824×1248</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W10 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1248,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text","seed":265753330,"width_6":1824},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_01e102ef-3da7-44f5-b90f-bbad010dd61b"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_01e102ef-3da7-44f5-b90f-bbad010dd61b"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W10 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1248,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text","seed":265753330,"width_6":1824},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text"},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text"},"seed":{"node_id":5,"widgets_values_index":0,"value":265753330},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":1824},"height_6":{"node_id":6,"widgets_values_index":2,"value":1248}}`

</details>

<details>
<summary>W11 — WAI / test / 4:7 / 768×1344</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W11 女性机械师未来车间 4:7 test","instance_id":"2","template_id":"28","model":null,"parameters":{"batch_size":1,"height_6":1344,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, cropped, out of frame, merged fingers, fused fingers, extra limbs, multiple girls, blurry, low clarity","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, (1girl:1.2), adult, orange work jacket, black pants, black work boots, standing upright, facing viewer, arms relaxed at sides, calm, full body shot, front view, centered, futuristic workshop interior, robotic arms, control screens, spatial depth, high-tech atmosphere, bright lighting, blue rim light","seed":735917136,"width_6":768},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_81f14550-9610-48cc-84c0-38d27bedf8ba"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_81f14550-9610-48cc-84c0-38d27bedf8ba"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W11 女性机械师未来车间 4:7 test","instance_id":"2","template_id":"28","model":null,"parameters":{"batch_size":1,"height_6":1344,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, cropped, out of frame, merged fingers, fused fingers, extra limbs, multiple girls, blurry, low clarity","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, (1girl:1.2), adult, orange work jacket, black pants, black work boots, standing upright, facing viewer, arms relaxed at sides, calm, full body shot, front view, centered, futuristic workshop interior, robotic arms, control screens, spatial depth, high-tech atmosphere, bright lighting, blue rim light","seed":735917136,"width_6":768},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, ultra-detailed, highres, (1girl:1.2), adult, orange work jacket, black pants, black work boots, standing upright, facing viewer, arms relaxed at sides, calm, full body shot, front view, centered, futuristic workshop interior, robotic arms, control screens, spatial depth, high-tech atmosphere, bright lighting, blue rim light"},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, worst detail, sketch, censor, cropped, out of frame, merged fingers, fused fingers, extra limbs, multiple girls, blurry, low clarity"},"seed":{"node_id":5,"widgets_values_index":0,"value":735917136},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":768},"height_6":{"node_id":6,"widgets_values_index":2,"value":1344}}`

</details>

<details>
<summary>W12 — WAI / final / 4:7 / 1152×2016</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W12 v3 same-seed 4:7 final","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":2016,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":579414316,"width_6":1152},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_6b04bce0-080a-4b19-a78d-2425419170eb"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_6b04bce0-080a-4b19-a78d-2425419170eb"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W12 v3 same-seed 4:7 final","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":2016,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":579414316,"width_6":1152},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman."},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry"},"seed":{"node_id":5,"widgets_values_index":0,"value":579414316},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":1152},"height_6":{"node_id":6,"widgets_values_index":2,"value":2016}}`

</details>

<details>
<summary>W13 — WAI / test / 7:4 / 1344×768</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W13 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":768,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text","seed":2128705244,"width_6":1344},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_dd48f8c9-e84f-415d-95cc-80c155c0f5aa"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_dd48f8c9-e84f-415d-95cc-80c155c0f5aa"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W13 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":768,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text","seed":2128705244,"width_6":1344},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text"},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text"},"seed":{"node_id":5,"widgets_values_index":0,"value":2128705244},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":1344},"height_6":{"node_id":6,"widgets_values_index":2,"value":768}}`

</details>

<details>
<summary>W14 — WAI / final / 7:4 / 2016×1152</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W14 v3 same-seed 7:4 final","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1152,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, woman standing on the left third, visible from head to below knees, wide environmental composition, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The workbench and control screens stand on the right of the frame, with the woman standing on the left third. The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":1116969248,"width_6":2016},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_493001f8-99a7-4c4d-a0a6-d7a7564164a0"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_493001f8-99a7-4c4d-a0a6-d7a7564164a0"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W14 v3 same-seed 7:4 final","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1152,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, woman standing on the left third, visible from head to below knees, wide environmental composition, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The workbench and control screens stand on the right of the frame, with the woman standing on the left third. The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":1116969248,"width_6":2016},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, woman standing on the left third, visible from head to below knees, wide environmental composition, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The workbench and control screens stand on the right of the frame, with the woman standing on the left third. The articulated equipment is mounted behind the workbench, clearly separate from the woman."},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry"},"seed":{"node_id":5,"widgets_values_index":0,"value":1116969248},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":2016},"height_6":{"node_id":6,"widgets_values_index":2,"value":1152}}`

</details>

<details>
<summary>W15 — WAI / test / 9:16 / 864×1536</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W15 v3 same-seed 9:16 test","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1536,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":1384071151,"width_6":864},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_f4d62d86-b7ed-424a-927f-bf5400f1bffc"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_f4d62d86-b7ed-424a-927f-bf5400f1bffc"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W15 v3 same-seed 9:16 test","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1536,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":1384071151,"width_6":864},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman."},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry"},"seed":{"node_id":5,"widgets_values_index":0,"value":1384071151},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":864},"height_6":{"node_id":6,"widgets_values_index":2,"value":1536}}`

</details>

<details>
<summary>W16 — WAI / final / 9:16 / 1152×2048</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W16 v3 same-seed 9:16 final","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":2048,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":1623625900,"width_6":1152},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_64b66a6d-f634-4cdd-b743-51f919ed942a"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_64b66a6d-f634-4cdd-b743-51f919ed942a"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W16 v3 same-seed 9:16 final","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":2048,"negative_prompt":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry","positive_prompt":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman.","seed":1623625900,"width_6":1152},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, ultra-detailed, highres, 1girl, (adult human woman:1.5), (visible detailed natural female face:1.5), long brown hair, brown eyes, natural skin, bare human hands, five fingers, normal adult female proportions, fitted orange cloth work jacket, black pants, black work boots, natural standing pose, facing viewer, arms relaxed at sides, calm, full body shot, centered composition, ample margins around the figure, industrial workbench, hand tools, control screens, articulated equipment mounted behind the workbench, clean high-tech atmosphere, bright workshop lighting, The articulated equipment is mounted behind the workbench, clearly separate from the woman."},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, worst detail, sketch, censor, robotic woman, mechanical female body, mechanical limbs attached to the woman, android, cyborg, mechanical head, featureless face, helmet, visor, mask, mechanical hands, armor, exoskeleton, doll head, chibi, childish, deformed hands, deformed feet, cropped, duplicate characters, blurry"},"seed":{"node_id":5,"widgets_values_index":0,"value":1623625900},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":1152},"height_6":{"node_id":6,"widgets_values_index":2,"value":2048}}`

</details>

<details>
<summary>W17 — WAI / test / 16:9 / 1536×864</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W17 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":864,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text","seed":369592682,"width_6":1536},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_e0868952-c6bb-446f-8f66-13240060fc6b"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_e0868952-c6bb-446f-8f66-13240060fc6b"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W17 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":864,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text","seed":369592682,"width_6":1536},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text"},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text"},"seed":{"node_id":5,"widgets_values_index":0,"value":369592682},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":1536},"height_6":{"node_id":6,"widgets_values_index":2,"value":864}}`

</details>

<details>
<summary>W18 — WAI / final / 16:9 / 2048×1152</summary>

- 负向路线：native_negative；`negative_prompt` 原样提交。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"W18 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1152,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text","seed":184720774,"width_6":2048},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_2b4c3661-85bb-4ebe-93e5-7b67d5a9439a"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_2b4c3661-85bb-4ebe-93e5-7b67d5a9439a"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"W18 最终修正版","instance_id":"2","template_id":"28","model":{"fileName":"waiIllustriousSDXL_v170.safetensors","id":"1"},"parameters":{"batch_size":1,"height_6":1152,"negative_prompt":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text","positive_prompt":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text","seed":184720774,"width_6":2048},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":2,"widgets_values_index":0,"value":"masterpiece, best quality, highres, solo, 1girl, mature adult woman, age 30, shoulder-length brown hair, brown eyes, visible natural face, natural skin, orange mechanic coverall with long sleeves ending at wrists, black work boots, full body head to toe, standing upright facing viewer on the left third of the frame, arms hanging naturally at her sides, left hand attached to left wrist and right hand attached to right wrist, hands resting beside her thighs, five natural fingers on each hand, organized automotive repair workshop, metal workbench with tools and diagnostic monitor on the right side, machinery clearly separate from her body, both complete boots inside the frame with floor visible below, balanced wide composition, no text"},"negative_prompt":{"node_id":3,"widgets_values_index":0,"value":"bad quality, worst quality, sketch, blurry, child, teen, young-looking, robot woman, android, cyborg, mechanical body, mechanical limbs, armor, exoskeleton, gloves, extra person, duplicate person, extra body, extra limb, extra arm, extra hand, multiple hands, disembodied hand, detached hand, hands on workbench, mannequin hand, extra foot, spare boots, extra shoes, fused fingers, extra fingers, missing fingers, deformed hands, cropped, cropped feet, kitchen, food, cooking utensils, text"},"seed":{"node_id":5,"widgets_values_index":0,"value":184720774},"batch_size":{"node_id":4,"widgets_values_index":2,"value":1},"width_6":{"node_id":6,"widgets_values_index":1,"value":2048},"height_6":{"node_id":6,"widgets_values_index":2,"value":1152}}`

</details>

<details>
<summary>K01 — Krea2 / test / 1:1 / 1024×1024</summary>

- 负向路线：positive_rewrite；没有 `negative_prompt`，规避约束已经写入 `positive_prompt`。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"K01 修正版真实生成 same-seed 1:1 1024x1024","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1024,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed, 精致动漫插画，干净线稿，赛璐璐上色与柔和层次阴影；明亮现代舞蹈排练室中只有一位明确成年、身形修长、比例自然和谐的女性芭蕾舞者，独自站在画面正中央；她面容清秀专注，视线平静地望向镜墙方向，浅亚麻色长发在后脑盘成利落的芭蕾发髻，几缕碎发自然垂落；她身穿白色修身连体练功服，外衬一片轻薄的浅蓝色长纱裙，裙摆随预备站姿自然垂落，脚穿浅粉色芭蕾舞鞋，双脚各一只完整入镜，鞋带与鞋尖清晰可见；她保持稳定自然的芭蕾准备位：双臂自然下垂，双手在下腹正前方围成清晰互不相碰的低位圆弧手位，两只手互不相碰，十根手指都清清楚楚地分开、指尖分明，手臂和手掌都远离髋部、绝不叉腰；双腿直立，双脚呈稳定外开的第一位置稳稳踩在木地板上，每一条手臂与每一条腿都是完整流畅的独立自然肢体，关节连接清晰自然，完全没有多余肢体；画面取近正面的方形全身构图，人物居中，头顶与脚下都留有充足边距，头顶、双手、双脚与全身从头到脚完全收在画框之内；背景是后墙整面落地镜与侧面落地大窗的明亮现代舞蹈排练室，排练室地面木地板纹路、墙边把杆与落地窗户都清晰可见，后墙落地镜中恰好映出这名舞者唯一、清晰、正常、与动作完全同步的全身倒影，镜像与真人肢体方向一致、遵循正确的左右镜像几何，身形比例与前景人物一一对应，镜外现实空间中只有这名舞者一个人，镜中也只有这同一名舞者的唯一倒影，镜里镜外都没有任何多余的人形；木地板与阳光投下的窗格光影构成清晰的前中后景空间纵深，柔和日光从侧面大窗洒入，光线明亮干净，主体轮廓与背景明暗层次分明，画面干净无任何文字；(full body:1.1), clean lineart, cel shading, soft shadow, detailed background, clear spatial depth, no text","seed":342289265,"width":1024},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_0091f272-bcb7-4d70-9102-8ab1b7bb8a76"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_0091f272-bcb7-4d70-9102-8ab1b7bb8a76"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"K01 修正版真实生成 same-seed 1:1 1024x1024","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1024,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed, 精致动漫插画，干净线稿，赛璐璐上色与柔和层次阴影；明亮现代舞蹈排练室中只有一位明确成年、身形修长、比例自然和谐的女性芭蕾舞者，独自站在画面正中央；她面容清秀专注，视线平静地望向镜墙方向，浅亚麻色长发在后脑盘成利落的芭蕾发髻，几缕碎发自然垂落；她身穿白色修身连体练功服，外衬一片轻薄的浅蓝色长纱裙，裙摆随预备站姿自然垂落，脚穿浅粉色芭蕾舞鞋，双脚各一只完整入镜，鞋带与鞋尖清晰可见；她保持稳定自然的芭蕾准备位：双臂自然下垂，双手在下腹正前方围成清晰互不相碰的低位圆弧手位，两只手互不相碰，十根手指都清清楚楚地分开、指尖分明，手臂和手掌都远离髋部、绝不叉腰；双腿直立，双脚呈稳定外开的第一位置稳稳踩在木地板上，每一条手臂与每一条腿都是完整流畅的独立自然肢体，关节连接清晰自然，完全没有多余肢体；画面取近正面的方形全身构图，人物居中，头顶与脚下都留有充足边距，头顶、双手、双脚与全身从头到脚完全收在画框之内；背景是后墙整面落地镜与侧面落地大窗的明亮现代舞蹈排练室，排练室地面木地板纹路、墙边把杆与落地窗户都清晰可见，后墙落地镜中恰好映出这名舞者唯一、清晰、正常、与动作完全同步的全身倒影，镜像与真人肢体方向一致、遵循正确的左右镜像几何，身形比例与前景人物一一对应，镜外现实空间中只有这名舞者一个人，镜中也只有这同一名舞者的唯一倒影，镜里镜外都没有任何多余的人形；木地板与阳光投下的窗格光影构成清晰的前中后景空间纵深，柔和日光从侧面大窗洒入，光线明亮干净，主体轮廓与背景明暗层次分明，画面干净无任何文字；(full body:1.1), clean lineart, cel shading, soft shadow, detailed background, clear spatial depth, no text","seed":342289265,"width":1024},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":164,"widgets_values_index":0,"value":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed, 精致动漫插画，干净线稿，赛璐璐上色与柔和层次阴影；明亮现代舞蹈排练室中只有一位明确成年、身形修长、比例自然和谐的女性芭蕾舞者，独自站在画面正中央；她面容清秀专注，视线平静地望向镜墙方向，浅亚麻色长发在后脑盘成利落的芭蕾发髻，几缕碎发自然垂落；她身穿白色修身连体练功服，外衬一片轻薄的浅蓝色长纱裙，裙摆随预备站姿自然垂落，脚穿浅粉色芭蕾舞鞋，双脚各一只完整入镜，鞋带与鞋尖清晰可见；她保持稳定自然的芭蕾准备位：双臂自然下垂，双手在下腹正前方围成清晰互不相碰的低位圆弧手位，两只手互不相碰，十根手指都清清楚楚地分开、指尖分明，手臂和手掌都远离髋部、绝不叉腰；双腿直立，双脚呈稳定外开的第一位置稳稳踩在木地板上，每一条手臂与每一条腿都是完整流畅的独立自然肢体，关节连接清晰自然，完全没有多余肢体；画面取近正面的方形全身构图，人物居中，头顶与脚下都留有充足边距，头顶、双手、双脚与全身从头到脚完全收在画框之内；背景是后墙整面落地镜与侧面落地大窗的明亮现代舞蹈排练室，排练室地面木地板纹路、墙边把杆与落地窗户都清晰可见，后墙落地镜中恰好映出这名舞者唯一、清晰、正常、与动作完全同步的全身倒影，镜像与真人肢体方向一致、遵循正确的左右镜像几何，身形比例与前景人物一一对应，镜外现实空间中只有这名舞者一个人，镜中也只有这同一名舞者的唯一倒影，镜里镜外都没有任何多余的人形；木地板与阳光投下的窗格光影构成清晰的前中后景空间纵深，柔和日光从侧面大窗洒入，光线明亮干净，主体轮廓与背景明暗层次分明，画面干净无任何文字；(full body:1.1), clean lineart, cel shading, soft shadow, detailed background, clear spatial depth, no text"},"seed":{"node_id":153,"widgets_values_index":0,"value":342289265},"batch_size":{"node_id":156,"widgets_values_index":2,"value":1},"width":{"node_id":156,"widgets_values_index":0,"value":1024},"height":{"node_id":156,"widgets_values_index":1,"value":1024}}`

</details>

<details>
<summary>K02 — Krea2 / final / 1:1 / 1440×1440</summary>

- 负向路线：positive_rewrite；没有 `negative_prompt`，规避约束已经写入 `positive_prompt`。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"Krea2 K02 final 1:1 1440x1440","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1440,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":1752018808,"width":1440},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_fcbc06ab-2e05-4991-b49e-877abf3b7404"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_fcbc06ab-2e05-4991-b49e-877abf3b7404"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"Krea2 K02 final 1:1 1440x1440","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1440,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":1752018808,"width":1440},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":164,"widgets_values_index":0,"value":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。"},"seed":{"node_id":153,"widgets_values_index":0,"value":1752018808},"batch_size":{"node_id":156,"widgets_values_index":2,"value":1},"width":{"node_id":156,"widgets_values_index":0,"value":1440},"height":{"node_id":156,"widgets_values_index":1,"value":1440}}`

</details>

<details>
<summary>K03 — Krea2 / test / 1:2 / 704×1408</summary>

- 负向路线：positive_rewrite；没有 `negative_prompt`，规避约束已经写入 `positive_prompt`。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"Krea2 K03 test 1:2 704x1408","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1408,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":446618212,"width":704},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_2f05d7e0-65ee-426e-829e-b42956fca798"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_2f05d7e0-65ee-426e-829e-b42956fca798"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"Krea2 K03 test 1:2 704x1408","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1408,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":446618212,"width":704},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":164,"widgets_values_index":0,"value":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。"},"seed":{"node_id":153,"widgets_values_index":0,"value":446618212},"batch_size":{"node_id":156,"widgets_values_index":2,"value":1},"width":{"node_id":156,"widgets_values_index":0,"value":704},"height":{"node_id":156,"widgets_values_index":1,"value":1408}}`

</details>

<details>
<summary>K04 — Krea2 / final / 1:2 / 1024×2048</summary>

- 负向路线：positive_rewrite；没有 `negative_prompt`，规避约束已经写入 `positive_prompt`。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"Krea2 K04 final 1:2 1024x2048","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":2048,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":1841090471,"width":1024},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_a96ce6c2-ab7e-40cd-b90a-bd87aef633cd"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_a96ce6c2-ab7e-40cd-b90a-bd87aef633cd"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"Krea2 K04 final 1:2 1024x2048","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":2048,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":1841090471,"width":1024},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":164,"widgets_values_index":0,"value":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。"},"seed":{"node_id":153,"widgets_values_index":0,"value":1841090471},"batch_size":{"node_id":156,"widgets_values_index":2,"value":1},"width":{"node_id":156,"widgets_values_index":0,"value":1024},"height":{"node_id":156,"widgets_values_index":1,"value":2048}}`

</details>

<details>
<summary>K05 — Krea2 / test / 2:3 / 832×1248</summary>

- 负向路线：positive_rewrite；没有 `negative_prompt`，规避约束已经写入 `positive_prompt`。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"Krea2 K05 test 2:3 832x1248","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1248,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":1017534094,"width":832},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_4c5f50c0-0f81-49c0-b52c-a0292177c17e"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_4c5f50c0-0f81-49c0-b52c-a0292177c17e"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"Krea2 K05 test 2:3 832x1248","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1248,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":1017534094,"width":832},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":164,"widgets_values_index":0,"value":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。"},"seed":{"node_id":153,"widgets_values_index":0,"value":1017534094},"batch_size":{"node_id":156,"widgets_values_index":2,"value":1},"width":{"node_id":156,"widgets_values_index":0,"value":832},"height":{"node_id":156,"widgets_values_index":1,"value":1248}}`

</details>

<details>
<summary>K06 — Krea2 / final / 2:3 / 1152×1728</summary>

- 负向路线：positive_rewrite；没有 `negative_prompt`，规避约束已经写入 `positive_prompt`。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"Krea2 K06 final 2:3 1152x1728","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1728,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":2053643763,"width":1152},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_ad7a29f3-7e15-4734-a21c-6fd3a448441c"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_ad7a29f3-7e15-4734-a21c-6fd3a448441c"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"Krea2 K06 final 2:3 1152x1728","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1728,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":2053643763,"width":1152},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":164,"widgets_values_index":0,"value":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。"},"seed":{"node_id":153,"widgets_values_index":0,"value":2053643763},"batch_size":{"node_id":156,"widgets_values_index":2,"value":1},"width":{"node_id":156,"widgets_values_index":0,"value":1152},"height":{"node_id":156,"widgets_values_index":1,"value":1728}}`

</details>

<details>
<summary>K07 — Krea2 / test / 3:2 / 1248×832</summary>

- 负向路线：positive_rewrite；没有 `negative_prompt`，规避约束已经写入 `positive_prompt`。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"K07 correction same-seed 芭蕾镜中同步倒影 3:2 1248x832","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":832,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed, 精致动漫插画，干净线稿，赛璐璐上色与柔和层次阴影；明亮现代舞蹈排练室中只有一位明确成年、身形修长优雅的女性芭蕾舞者，独自居于画面中央；她面容清秀专注，视线平静地望向镜墙方向，浅亚麻色长发在后脑盘成利落的芭蕾发髻，几缕碎发自然垂落；她身穿白色修身连体练功服，外衬一片轻薄的浅蓝色长纱裙，裙摆随预备站姿自然垂落，脚穿浅粉色芭蕾舞鞋，双脚各一只完整入镜，鞋带与鞋尖清晰可见；她保持稳定自然的芭蕾准备位：双臂自然下垂在身前围成低位的柔和圆弧手位，两只手各五指清晰分开、指尖分明，双腿直立，双脚呈稳定外开的第一位置稳稳踩在木地板上，每一条手臂与每一条腿都是完整流畅的独立自然肢体，关节连接清晰自然；画面取水平横式的全身构图，人物居中，头顶与脚下都留有完整空间，双手、双脚与全身从头到脚完全收在画框之内；背景是后墙整面落地镜与侧面落地大窗的明亮现代舞蹈排练室，后墙落地镜中恰好映出这名舞者唯一、正常、与动作完全同步的全身镜像，镜像位于她的正后方、遵循正确的左右镜像几何且身形比例与人物一一对应，镜外现实空间只有这一名舞者实体，镜中也只有这同一名舞者的唯一倒影，镜里镜外合计为一名实体加一名倒影共两处人形，画中不存在多余的身形；木地板、墙边把杆与阳光投下的窗格光影构成清晰的前中后景空间纵深，柔和日光从侧面大窗洒入，光线明亮干净，主体轮廓与背景明暗层次分明；(full body:1.1), clean lineart, cel shading, soft shadow, detailed background, clear spatial depth","seed":36163189,"width":1248},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_cbca0666-c78a-46e9-9ab7-2d4847269a60"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_cbca0666-c78a-46e9-9ab7-2d4847269a60"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"K07 correction same-seed 芭蕾镜中同步倒影 3:2 1248x832","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":832,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed, 精致动漫插画，干净线稿，赛璐璐上色与柔和层次阴影；明亮现代舞蹈排练室中只有一位明确成年、身形修长优雅的女性芭蕾舞者，独自居于画面中央；她面容清秀专注，视线平静地望向镜墙方向，浅亚麻色长发在后脑盘成利落的芭蕾发髻，几缕碎发自然垂落；她身穿白色修身连体练功服，外衬一片轻薄的浅蓝色长纱裙，裙摆随预备站姿自然垂落，脚穿浅粉色芭蕾舞鞋，双脚各一只完整入镜，鞋带与鞋尖清晰可见；她保持稳定自然的芭蕾准备位：双臂自然下垂在身前围成低位的柔和圆弧手位，两只手各五指清晰分开、指尖分明，双腿直立，双脚呈稳定外开的第一位置稳稳踩在木地板上，每一条手臂与每一条腿都是完整流畅的独立自然肢体，关节连接清晰自然；画面取水平横式的全身构图，人物居中，头顶与脚下都留有完整空间，双手、双脚与全身从头到脚完全收在画框之内；背景是后墙整面落地镜与侧面落地大窗的明亮现代舞蹈排练室，后墙落地镜中恰好映出这名舞者唯一、正常、与动作完全同步的全身镜像，镜像位于她的正后方、遵循正确的左右镜像几何且身形比例与人物一一对应，镜外现实空间只有这一名舞者实体，镜中也只有这同一名舞者的唯一倒影，镜里镜外合计为一名实体加一名倒影共两处人形，画中不存在多余的身形；木地板、墙边把杆与阳光投下的窗格光影构成清晰的前中后景空间纵深，柔和日光从侧面大窗洒入，光线明亮干净，主体轮廓与背景明暗层次分明；(full body:1.1), clean lineart, cel shading, soft shadow, detailed background, clear spatial depth","seed":36163189,"width":1248},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":164,"widgets_values_index":0,"value":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed, 精致动漫插画，干净线稿，赛璐璐上色与柔和层次阴影；明亮现代舞蹈排练室中只有一位明确成年、身形修长优雅的女性芭蕾舞者，独自居于画面中央；她面容清秀专注，视线平静地望向镜墙方向，浅亚麻色长发在后脑盘成利落的芭蕾发髻，几缕碎发自然垂落；她身穿白色修身连体练功服，外衬一片轻薄的浅蓝色长纱裙，裙摆随预备站姿自然垂落，脚穿浅粉色芭蕾舞鞋，双脚各一只完整入镜，鞋带与鞋尖清晰可见；她保持稳定自然的芭蕾准备位：双臂自然下垂在身前围成低位的柔和圆弧手位，两只手各五指清晰分开、指尖分明，双腿直立，双脚呈稳定外开的第一位置稳稳踩在木地板上，每一条手臂与每一条腿都是完整流畅的独立自然肢体，关节连接清晰自然；画面取水平横式的全身构图，人物居中，头顶与脚下都留有完整空间，双手、双脚与全身从头到脚完全收在画框之内；背景是后墙整面落地镜与侧面落地大窗的明亮现代舞蹈排练室，后墙落地镜中恰好映出这名舞者唯一、正常、与动作完全同步的全身镜像，镜像位于她的正后方、遵循正确的左右镜像几何且身形比例与人物一一对应，镜外现实空间只有这一名舞者实体，镜中也只有这同一名舞者的唯一倒影，镜里镜外合计为一名实体加一名倒影共两处人形，画中不存在多余的身形；木地板、墙边把杆与阳光投下的窗格光影构成清晰的前中后景空间纵深，柔和日光从侧面大窗洒入，光线明亮干净，主体轮廓与背景明暗层次分明；(full body:1.1), clean lineart, cel shading, soft shadow, detailed background, clear spatial depth"},"seed":{"node_id":153,"widgets_values_index":0,"value":36163189},"batch_size":{"node_id":156,"widgets_values_index":2,"value":1},"width":{"node_id":156,"widgets_values_index":0,"value":1248},"height":{"node_id":156,"widgets_values_index":1,"value":832}}`

</details>

<details>
<summary>K08 — Krea2 / final / 3:2 / 1728×1152</summary>

- 负向路线：positive_rewrite；没有 `negative_prompt`，规避约束已经写入 `positive_prompt`。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"Krea2 K08 final 3:2 1728x1152","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1152,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":303259861,"width":1728},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_fcf06a33-0461-45ce-adcc-06eb8db181e6"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_fcf06a33-0461-45ce-adcc-06eb8db181e6"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"Krea2 K08 final 3:2 1728x1152","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1152,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":303259861,"width":1728},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":164,"widgets_values_index":0,"value":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。"},"seed":{"node_id":153,"widgets_values_index":0,"value":303259861},"batch_size":{"node_id":156,"widgets_values_index":2,"value":1},"width":{"node_id":156,"widgets_values_index":0,"value":1728},"height":{"node_id":156,"widgets_values_index":1,"value":1152}}`

</details>

<details>
<summary>K09 — Krea2 / test / 9:16 / 864×1536</summary>

- 负向路线：positive_rewrite；没有 `negative_prompt`，规避约束已经写入 `positive_prompt`。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"Krea2 K09 test 9:16 864x1536","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1536,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":1026922462,"width":864},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_623a9ef6-fc4d-4f3d-8bcd-8c097d313b7a"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_623a9ef6-fc4d-4f3d-8bcd-8c097d313b7a"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"Krea2 K09 test 9:16 864x1536","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1536,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":1026922462,"width":864},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":164,"widgets_values_index":0,"value":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。"},"seed":{"node_id":153,"widgets_values_index":0,"value":1026922462},"batch_size":{"node_id":156,"widgets_values_index":2,"value":1},"width":{"node_id":156,"widgets_values_index":0,"value":864},"height":{"node_id":156,"widgets_values_index":1,"value":1536}}`

</details>

<details>
<summary>K10 — Krea2 / final / 9:16 / 1152×2048</summary>

- 负向路线：positive_rewrite；没有 `negative_prompt`，规避约束已经写入 `positive_prompt`。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"Krea2 K10 final 9:16 1152x2048","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":2048,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":1443054101,"width":1152},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_55db0ee4-0263-49a0-9622-098c87015490"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_55db0ee4-0263-49a0-9622-098c87015490"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"Krea2 K10 final 9:16 1152x2048","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":2048,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":1443054101,"width":1152},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":164,"widgets_values_index":0,"value":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。"},"seed":{"node_id":153,"widgets_values_index":0,"value":1443054101},"batch_size":{"node_id":156,"widgets_values_index":2,"value":1},"width":{"node_id":156,"widgets_values_index":0,"value":1152},"height":{"node_id":156,"widgets_values_index":1,"value":2048}}`

</details>

<details>
<summary>K11 — Krea2 / test / 16:9 / 1536×864</summary>

- 负向路线：positive_rewrite；没有 `negative_prompt`，规避约束已经写入 `positive_prompt`。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"Krea2 K11 test 16:9 1536x864","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":864,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":157770070,"width":1536},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_b61753b3-f1cc-4993-bc6b-bf3649b7d34e"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_b61753b3-f1cc-4993-bc6b-bf3649b7d34e"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"Krea2 K11 test 16:9 1536x864","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":864,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。","seed":157770070,"width":1536},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":164,"widgets_values_index":0,"value":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed —— 精致动漫插画，干净线稿，赛璐璐上色，柔和层次阴影。 画面中央只有一名气质优雅、明确已成年的女性芭蕾舞者独自站在明亮现代舞蹈排练室中央，她面容清秀，表情沉静专注，目光平视前方的落地镜墙。 她的芭蕾准备姿势稳定而自然：双腿绷直、双脚外开站稳成芭蕾一位，双臂在身前自然圆合下垂于芭蕾准备位，肩颈放松，全身重心均匀落在两脚之间。 她身穿合体的白色舞蹈练功服，外罩一条浅蓝色的长款薄纱舞裙，裙摆垂到小腿中部，脚穿系带芭蕾舞鞋，鞋带在脚踝上方整齐交叉。 完整全身清晰入镜，从头顶到芭蕾舞鞋鞋底全部可见，画面没有任何裁切；整个画面只有这一名舞者，没有重复身影或第二个相同人物。 她的一双手和一双脚都完整可见，每只手的手指根根分明、五指俱全，手臂与双腿都以自然关节连接，没有多余的肢体。 后墙是一整面落地镜墙，镜中只映出同一名舞者的正常同步倒影，动作与角度完全一致，镜中绝无任何额外人物；暖色木地板向画面深处延伸，大窗洒入的柔和日光在地板上缓缓铺开，光与影构成清晰的空间纵深，整个舞室明亮通透、干净现代。"},"seed":{"node_id":153,"widgets_values_index":0,"value":157770070},"batch_size":{"node_id":156,"widgets_values_index":2,"value":1},"width":{"node_id":156,"widgets_values_index":0,"value":1536},"height":{"node_id":156,"widgets_values_index":1,"value":864}}`

</details>

<details>
<summary>K12 — Krea2 / final / 16:9 / 2048×1152</summary>

- 负向路线：positive_rewrite；没有 `negative_prompt`，规避约束已经写入 `positive_prompt`。
- 实际提交命令与 stdin：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{"title":"K12 correction v2 same-seed 低位圆臂强化 2048x1152","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1152,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed, 精致动漫插画，干净线稿，赛璐璐上色与柔和层次阴影；明亮现代舞蹈排练室中只有一位明确成年、身形修长优雅的女性芭蕾舞者，独自居于画面中央；她面容清秀专注，视线平静地望向镜墙方向，浅亚麻色长发在后脑盘成利落的芭蕾发髻，几缕碎发自然垂落；她身穿白色修身连体练功服，外衬一片轻薄的浅蓝色长纱裙，裙摆随预备站姿自然垂落，脚穿浅粉色芭蕾舞鞋，双脚各一只完整入镜，鞋带与鞋尖清晰可见；她保持稳定的芭蕾第一位置准备站姿：双臂在腰腹正前方的低位圆合成准备手位，双肘柔和地向两侧外圆，双前臂自然向前弯弧，双手并拢悬于下腹正前方且与双腿、髋部保持清晰间隙，两只手各五指清晰分开、指尖分明且互不相碰，任何一条手臂都不沿身体两侧下垂；双腿绷直，双脚跟稳稳并拢，脚尖左右对称外开形成稳定的第一位置，整个站姿稳定自然；每一条手臂与每一条腿都是完整流畅的独立自然肢体，关节连接清晰自然；画面取水平横式的全身构图，人物居中，头顶与脚下都留有完整空间，双手、双脚与全身从头到脚完全收在画框之内；背景是后墙整面落地镜与侧面落地大窗的明亮现代舞蹈排练室，后墙落地镜中恰好映出这名舞者唯一、正常、与动作完全同步的全身镜像，镜像中的低位圆臂准备手位与第一位置站姿和前景主舞者完全一致并同步，镜像遵循正确的左右镜像几何且身形比例与人物一一对应，镜外现实空间只有这一名舞者实体，镜中也只有这同一名舞者的唯一倒影，镜里镜外合计为一名实体加一名倒影共两处人形，画中不存在多余的身形；木地板、墙边把杆与阳光投下的窗格光影构成清晰的前中后景空间纵深，柔和日光从侧面大窗洒入，光线明亮干净，主体轮廓与背景明暗层次分明；(full body:1.1), clean lineart, cel shading, soft shadow, detailed background, clear spatial depth","seed":506925948,"width":2048},"loras":[]}
JSON
```

- 实际提交 stdout：`{"run_id":"run_0bb33f28-6f25-4f96-a6c5-9f92cc02a7c6"}`；退出码为 `0`，stderr 为空。
- 实际单项回读命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_0bb33f28-6f25-4f96-a6c5-9f92cc02a7c6"]}
JSON
```

- 实际回读中的 `arguments`：`{"title":"K12 correction v2 same-seed 低位圆臂强化 2048x1152","instance_id":"2","template_id":"27","model":{"fileName":"Krea2-MuseByStable_v15Turbo_fp8.safetensors","id":"11"},"parameters":{"batch_size":1,"height":1152,"positive_prompt":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed, 精致动漫插画，干净线稿，赛璐璐上色与柔和层次阴影；明亮现代舞蹈排练室中只有一位明确成年、身形修长优雅的女性芭蕾舞者，独自居于画面中央；她面容清秀专注，视线平静地望向镜墙方向，浅亚麻色长发在后脑盘成利落的芭蕾发髻，几缕碎发自然垂落；她身穿白色修身连体练功服，外衬一片轻薄的浅蓝色长纱裙，裙摆随预备站姿自然垂落，脚穿浅粉色芭蕾舞鞋，双脚各一只完整入镜，鞋带与鞋尖清晰可见；她保持稳定的芭蕾第一位置准备站姿：双臂在腰腹正前方的低位圆合成准备手位，双肘柔和地向两侧外圆，双前臂自然向前弯弧，双手并拢悬于下腹正前方且与双腿、髋部保持清晰间隙，两只手各五指清晰分开、指尖分明且互不相碰，任何一条手臂都不沿身体两侧下垂；双腿绷直，双脚跟稳稳并拢，脚尖左右对称外开形成稳定的第一位置，整个站姿稳定自然；每一条手臂与每一条腿都是完整流畅的独立自然肢体，关节连接清晰自然；画面取水平横式的全身构图，人物居中，头顶与脚下都留有完整空间，双手、双脚与全身从头到脚完全收在画框之内；背景是后墙整面落地镜与侧面落地大窗的明亮现代舞蹈排练室，后墙落地镜中恰好映出这名舞者唯一、正常、与动作完全同步的全身镜像，镜像中的低位圆臂准备手位与第一位置站姿和前景主舞者完全一致并同步，镜像遵循正确的左右镜像几何且身形比例与人物一一对应，镜外现实空间只有这一名舞者实体，镜中也只有这同一名舞者的唯一倒影，镜里镜外合计为一名实体加一名倒影共两处人形，画中不存在多余的身形；木地板、墙边把杆与阳光投下的窗格光影构成清晰的前中后景空间纵深，柔和日光从侧面大窗洒入，光线明亮干净，主体轮廓与背景明暗层次分明；(full body:1.1), clean lineart, cel shading, soft shadow, detailed background, clear spatial depth","seed":506925948,"width":2048},"loras":[]}`
- Actual Workflow 对应值：`{"positive_prompt":{"node_id":164,"widgets_values_index":0,"value":"(masterpiece:1.2), (best quality:1.2), high resolution, ultra-detailed, 精致动漫插画，干净线稿，赛璐璐上色与柔和层次阴影；明亮现代舞蹈排练室中只有一位明确成年、身形修长优雅的女性芭蕾舞者，独自居于画面中央；她面容清秀专注，视线平静地望向镜墙方向，浅亚麻色长发在后脑盘成利落的芭蕾发髻，几缕碎发自然垂落；她身穿白色修身连体练功服，外衬一片轻薄的浅蓝色长纱裙，裙摆随预备站姿自然垂落，脚穿浅粉色芭蕾舞鞋，双脚各一只完整入镜，鞋带与鞋尖清晰可见；她保持稳定的芭蕾第一位置准备站姿：双臂在腰腹正前方的低位圆合成准备手位，双肘柔和地向两侧外圆，双前臂自然向前弯弧，双手并拢悬于下腹正前方且与双腿、髋部保持清晰间隙，两只手各五指清晰分开、指尖分明且互不相碰，任何一条手臂都不沿身体两侧下垂；双腿绷直，双脚跟稳稳并拢，脚尖左右对称外开形成稳定的第一位置，整个站姿稳定自然；每一条手臂与每一条腿都是完整流畅的独立自然肢体，关节连接清晰自然；画面取水平横式的全身构图，人物居中，头顶与脚下都留有完整空间，双手、双脚与全身从头到脚完全收在画框之内；背景是后墙整面落地镜与侧面落地大窗的明亮现代舞蹈排练室，后墙落地镜中恰好映出这名舞者唯一、正常、与动作完全同步的全身镜像，镜像中的低位圆臂准备手位与第一位置站姿和前景主舞者完全一致并同步，镜像遵循正确的左右镜像几何且身形比例与人物一一对应，镜外现实空间只有这一名舞者实体，镜中也只有这同一名舞者的唯一倒影，镜里镜外合计为一名实体加一名倒影共两处人形，画中不存在多余的身形；木地板、墙边把杆与阳光投下的窗格光影构成清晰的前中后景空间纵深，柔和日光从侧面大窗洒入，光线明亮干净，主体轮廓与背景明暗层次分明；(full body:1.1), clean lineart, cel shading, soft shadow, detailed background, clear spatial depth"},"seed":{"node_id":153,"widgets_values_index":0,"value":506925948},"batch_size":{"node_id":156,"widgets_values_index":2,"value":1},"width":{"node_id":156,"widgets_values_index":0,"value":2048},"height":{"node_id":156,"widgets_values_index":1,"value":1152}}`

</details>

独立视觉 Reviewer 的可见事实与 profile 决定如下：

- ANIMA 的 A09 与 A10 为 PASS；其余 8 项为 CONDITIONAL。主要偏差是长剑剑尖贴边或出框，以及长袍遮挡鞋履。A09 与 A10 的两把剑、完整人物和鞋履均在画框内。Reviewer 判断这些偏差来自本轮长剑长度、裙摆和留白描述，不是对应画幅稳定造成的结构失败，因此 10 个 profile 全部 RETAIN。
- WAI 的 W09 为 PASS，其余 17 项为 CONDITIONAL。第一轮 W01、W03、W05、W07、W08、W10、W13、W17 与 W18 曾出现机械手、幼态主体、脱离手掌、备用靴子、脚部裁切或横幅构图偏差；修正版复用各配置原 Seed 与尺寸后，九张图均只有一名成年自然人类女性，没有机械身体、脱离或额外肢体，双脚与两只靴子完整，车间设备可读。残留偏差是手指简化、手掌落在工作台、W07 坐姿和横幅人物居中，因此九项均为 CONDITIONAL，不再存在 FAIL。18 个 profile 全部 RETAIN。
- Krea2 的 K01、K07 与 K08 为 PASS；K02 至 K06、K09 至 K12 为 CONDITIONAL。K01 修正版复用原 Seed 与尺寸后，画面包含一名成年舞者和镜中同一人的一个倒影，双手在下腹前方形成非叉腰的低位圆弧，完整舞鞋与练功房设施可见。K01 的第一轮叉腰偏差已经关闭，12 个 profile 全部 RETAIN。
- Reviewer 对每张图片都给出可直接用于下一次生成的改进 Prompt。共同改进方向是：ANIMA 明确裙摆位于脚踝以上并为剑尖保留边距；WAI 统一强化成年真人、裸露自然五指、设备与人物分离、排除厨房器皿，并提高宽幅左侧三分线布局的权重；Krea2 明确倒影是实体动作的严格镜像，双手位于下腹中央低位圆弧并排除叉腰和背手。

## Prompt Builder 尺寸输入分支

三个 Builder 分别在没有 Workflow 模板上下文的真实 Desktop Session 中执行 S01 至 S11。独立语义 Reviewer 直接读取每次输入、结构化输出、validator stdout/stderr 与退出状态；程序没有解析 Prompt 或 Markdown 得出语义结论。

| 分支 | 输入 | 三个 Builder 的结果 | Reviewer |
| --- | --- | --- | --- |
| S01 | 不提供尺寸覆盖 | 根据画面和目的选择完整 profile | 通过 |
| S02 | 只提供 `aspect_ratio` | 保留画幅并按 test/final 回填宽、高和 MP | 通过 |
| S03 | 只提供 `width` | 停止并要求 `height` | 通过 |
| S04 | 只提供 `height` | 停止并要求 `width` | 通过 |
| S05 | 同时提供 `width + height` | 计算约分画幅与 MP，输出四个一致尺寸属性 | 通过 |
| S06 | 只提供 `megapixels` | 停止并要求 `aspect_ratio` | 通过 |
| S07 | 同时提供 `aspect_ratio + megapixels` | 按模型倍数生成匹配宽高，输出四个一致属性 | 通过 |
| S08 | 四个尺寸属性一致 | validator 接受 | 通过 |
| S09 | 四个尺寸属性比例冲突 | 停止并指出具体冲突 | 通过 |
| S10 | 四个尺寸属性面积偏差超过 5% | 停止并指出面积冲突 | 通过 |
| S11 | 其他部分组合 | 不丢弃已提供值；明确要求补齐或撤回形成合法组合 | 通过 |

S11 的 `width + megapixels` 分支明确给出两种可执行选择：补充 `height` 并撤回 `megapixels`；或者补充 `height + aspect_ratio` 后校验四个值。三个 Builder 的直接结构 validator 与 Prompt-format validator 均通过。

## Prompt Builder 生成目的分支

三个 Builder 分别在真实 Desktop Session 中执行 P01 至 P12；每次 Builder 只返回一个十属性结构化结果。

| 分支 | 用户上下文 | 结果 | Reviewer |
| --- | --- | --- | --- |
| P01 | 首次测试 Prompt 方向 | `test` | 通过 |
| P02 | 比较一个 Prompt 方案 | `test` | 通过 |
| P03 | 根据上一轮结果继续迭代 | `test` | 通过 |
| P04 | 继续测试修改后的 Prompt | `test` | 通过 |
| P05 | 快速预览 | `test` | 通过 |
| P06 | 批量筛选 | `test` | 通过 |
| P07 | 明确结束测试并正式成图 | `final` | 通过 |
| P08 | 旧测试链后开始无引用关系的新画面 | `final` | 通过 |
| P09 | 无法判断是否属于旧测试链 | 停止并要求确认 | 通过 |
| P10 | 比较多个方案 | 要求拆成多次 Builder 执行 | 通过 |
| P11 | 用户已经划分测试与正式任务 | 分别执行并分别返回 `test` 与 `final` | 通过 |
| P12 | 未划分的多方案或混合任务 | 停止并要求用户划分 | 通过 |

Krea2 首轮语义审核发现 Prompt 对手指和腕臂连接的描述不够逐手明确；真实 Agent 把该句改为“每只手各有五根清晰、自然并拢的手指，双手分别与对应手腕和手臂自然连接”，重新通过 validator 和独立语义 Reviewer。最终语义审核没有 P0、P1 或 P2。

## Seed 与请求数量分支

全部 Seed 决策只由 `comfyui-generate` 执行。三个 Builder 的结构化结果没有 Seed 属性，Builder 没有为 Seed 查询历史 Run。

| 分支 | 实际结果 | Run 证据 | Reviewer |
| --- | --- | --- | --- |
| SD01 默认两张 | 普通随机 Seed `815038079`、`2056717303`，两项均为 `batch_size: 1` | `run_6c8a7427-6458-48a7-b761-b9dfc1d359a0`、`run_7e29c6a0-6706-48b5-b3c8-64433e0a6e8f` | 通过 |
| SD02 固定两张 | 两项均使用 `11223344` | `run_4524cdf5-20f5-472e-b2f1-4af332696783`、`run_b7b07a11-cc36-4c87-a555-71664e72bd89` | 通过 |
| SD03 混合来源 | A 复用历史 Seed `1743239296`；B 使用随机 Seed `1643209710` | `run_262964ba-512c-4a89-a323-e69af604d3d4`、`run_ee663523-a972-45bc-807c-59fcc090ced3` | 通过 |
| SD04 默认 20 张 | 一次随机命令返回 20 个互不相同的整数；20 个 Run 均成功且 `batch_size: 1` | 标题 `SD04 WAI-20张-run01` 至 `run20` | 通过 |
| SD05 请求 21 张 | 在随机与提交以前拒绝；Run 数没有增加 | 无 Run | 通过 |
| SD06 历史整数 Seed | 新 Run 保存 `1743239296` | `run_b881e909-c6bd-4029-9734-6bd006e5f13d` | 通过 |
| SD07 历史 Run 无整数 Seed | 报告缺失且不提交 | 无 Run | 通过 |
| SD08 只说固定 Seed | 要求具体整数或 `run_id` 且不提交 | 无 Run | 通过 |
| SD09 修正重试 | 修正参数后继续使用首次 Seed `1310992045` | `run_ac390607-69c6-4065-9ac0-7173b8810fbc` | 通过 |
| SD10 用户要求新随机尝试 | 取得新 Seed `1515269921` | `run_4ad6f20b-51e1-43d5-a5ac-07faac04270a` | 通过 |

真实 Session 只调用四次 `generation random-seeds --stdin`，`count` 依次为 2、1、20、1。实现使用 `Math.random()` 与本次调用内的 `Set` 去重；没有加密随机源、随机服务、额外依赖或后台流程。

## 模板检查与尺寸适配分支

- 模板 `39` / 实例 `2`：唯一原生负向路线与精确宽高路线；ANIMA 10 项均按检查结果原值提交。
- 模板 `28` / 实例 `2`：唯一原生负向路线与末端精确宽高路线；WAI 18 项均按 `width_6` 与 `height_6` 原值提交。
- 模板 `27` / 实例 `2`：Krea2 12 项使用正向规避和精确宽高，不提交 `negative_prompt`。
- 模板 `36` / 实例 `2`：检查返回 `positive_prompt`、`seed`、`batch_size` 和 `aspect_ratio_megapixels:aspect_ratio:megapixels`；实际画幅枚举包含 `1:1`、`2:3`、`3:2`、`3:4`、`4:3`、`9:16`、`16:9`、`21:9`，MP 范围为 0.1 至 16。

真实适配 Session 对模板 `36` 与模板 `33` 只进行只读检查，没有创建 Run或取得 Seed。TA01 至 TA03 使用模板 `36`；TA04 使用模板 `33`：

| 分支 | Builder 目标 | 模板当前/允许值 | 结果 | Reviewer |
| --- | --- | --- | --- | --- |
| TA01 原值/用户允许调整 | 1:1、1000×1000、1 MP | 当前 9:16，可选 1:1 | 选择 1:1 与 1 MP；比例偏差 0%，面积偏差 0%；提交前停止探针 | 通过 |
| TA04 阈值内非零调整 | 2:3、832×1248、1.038336 MP | 模板 33 的 `resolution_preset` 映射候选 `832x1216 (0.68)` | 选择 832×1216；比例偏差 2.63%，面积偏差 2.56%；两项均大于 0 且未超过阈值，提交前报告允许提交 | 通过 |
| TA02 用户禁止调整 | 1:1、1000×1000、1 MP | 当前 9:16 | 当前值比例偏差 43.75%，拒绝且不创建 Run | 通过 |
| TA03 超阈值 | 1:2、704×1408、1 MP | 最近 9:16 | 比例偏差 12.5%，拒绝且不创建 Run | 通过 |

TA04 的计算为：目标比例 `832/1248 = 0.666667`，实际比例 `832/1216 = 0.684211`，比例偏差为 `|0.684211 - 0.666667| / 0.666667 = 2.63%`；目标面积为 `1,038,336`，实际面积为 `1,011,712`，面积偏差为 `|1,011,712 - 1,038,336| / 1,038,336 = 2.56%`。实际参数值来自模板 33 检查结果的 `mapped_options`，Agent 没有自行解析 Workflow。TA01 至 TA04 的只读检查没有创建 Run或取得 Seed，证明检查命令是无 Run 副作用的只读入口。

### Krea2 Selector 模板兼容性实证

模板 `36` / 实例 `2` 的检查结果包含 `positive_prompt`、`seed`、`batch_size` 和 `aspect_ratio_megapixels:aspect_ratio:megapixels`。计划执行者对除 `1:2` 外的 10 个 Krea2 profile 逐项提交了实际 Selector 值与既有整数 Seed。全部请求均完成 inspection、compile 和 Run 持久化；ComfyUI 在执行前校验时返回 `COMFYUI_PROMPT_REJECTED`。错误同时指出模板自带的 `LoadImage` 节点引用的默认参考图 `df24dae377e037202c446a46d0730d69d5f6124ef0e061d11dfa3068a2e3c472.jpg` 不存在，并指出五个仍处于活动状态的 `SaveImage` 节点缺少 `images` 输入。10 个兼容性 Run 为：

| Profile | Selector | Seed | Run ID | 结果 |
| --- | --- | ---: | --- | --- |
| 1:1 test | `1:1` / 1 MP | 342289265 | `run_59796c2a-9cfa-452f-9d6c-f71388792590` | `COMFYUI_PROMPT_REJECTED` |
| 1:1 final | `1:1` / 2 MP | 1752018808 | `run_d6513214-eb71-45aa-b05b-ba3ced71fcbb` | `COMFYUI_PROMPT_REJECTED` |
| 2:3 test | `2:3` / 1 MP | 1017534094 | `run_a2700ec5-41cf-4b71-9241-d6040e1833f6` | `COMFYUI_PROMPT_REJECTED` |
| 2:3 final | `2:3` / 2 MP | 2053643763 | `run_b791a43d-2786-479e-a88f-f74d002ad139` | `COMFYUI_PROMPT_REJECTED` |
| 3:2 test | `3:2` / 1 MP | 36163189 | `run_5d5d550d-1821-4226-9677-d03c73be116f` | `COMFYUI_PROMPT_REJECTED` |
| 3:2 final | `3:2` / 2 MP | 303259861 | `run_71214a3f-86cb-4326-84eb-8e99c0af41cb` | `COMFYUI_PROMPT_REJECTED` |
| 9:16 test | `9:16` / 1.33 MP | 1026922462 | `run_86ccdf70-627f-4f65-9e6d-b9a07d5e4083` | `COMFYUI_PROMPT_REJECTED` |
| 9:16 final | `9:16` / 2.36 MP | 1443054101 | `run_e74e247d-a680-4697-a25a-1e2ed0d1506c` | `COMFYUI_PROMPT_REJECTED` |
| 16:9 test | `16:9` / 1.33 MP | 157770070 | `run_4aa01cf7-69c1-4576-9ea9-705c623142d5` | `COMFYUI_PROMPT_REJECTED` |
| 16:9 final | `16:9` / 2.36 MP | 506925948 | `run_a2a25708-5759-41e9-9e20-54b9c1838636` | `COMFYUI_PROMPT_REJECTED` |

模板 `21` 的实时检查返回与模板 `36` 相同的 Selector 枚举、同一缺失的默认参考图和同一 Krea2 identity-edit 模板路线。计划执行者没有修改外部 Catalog 模板或补充不存在的用户参考图，也没有把无法执行的模板当作成功生成证据。模板 `27` 的 12 个成功精确宽高 Run 是本次 Krea2 profile 的可用图片证据。

## 负向策略与清晰度对照

### ANIMA 相同 Seed 对照

- 基础负向：`run_e95a88c8-9912-4a9e-b2a0-866cb2af762b`，Seed `1450367063`，512×512，媒体 `6d/3b/media_6d3bbdc8-b605-4d38-ab22-a0857507f8b5.png`。
- 目标负向原图：`run_353d4a71-f335-45a3-9db7-fb98c805af53`，相同 Seed 与尺寸，媒体 `db/28/media_db288335-7cb5-42dd-8b0f-95b07b93ee7b.png`。
- Prompt 修正图：`run_359c8220-bdb2-4f5f-9e69-6c1b19f35ef5`，相同 Seed 与尺寸；该图作为 A01 最终证据。
- 独立视觉结论：A01 修正图把两把剑完整收进画框；基础负向图与目标负向原图的剑尖仍贴近或略出左右下角。三张图的手指质量处于同一 512 测试档水平，三张图的脚都被长裙遮挡。该单 Seed 结果支持保留防裁切负向项和正向留白描述；脚部问题需要把裙摆位置写成脚踝以上，不能仅靠负向词修复。单个 Seed 对照不构成模型普遍保证。

### WAI 与 Krea2 风险策略

WAI 的同 Seed、同尺寸对照使用以下两项：

- 基础策略：`run_e8d1a8fa-ddf5-48e5-9429-7d30214650de`，Seed `1743239296`，1024×1024，媒体 `b9/54/media_b9540966-e5da-4991-a024-635f2fd4f162.png`。
- 目标策略：`run_8ab522a1-d6af-45f2-a918-dfb8fc404759`，相同 Seed 与尺寸，媒体 `01/fa/media_01fa1340-2338-4622-929d-ddc9108b62df.png`；该图作为 W01 最终证据。
- 基础图的年龄表现偏年轻，双手呈蓝色手套或机械手外观；目标图呈现明确成年女性、自然肤色手掌、完整双靴和可读的汽车维修车间，没有机械身体或脱离肢体。目标图仍有手指融合且双手落在工作台上的 CONDITIONAL 偏差。该对照证明针对本轮机械化与年龄风险的原生负向策略在相同 Seed 下改善了目标缺陷，同时没有把单个 Seed 结果表述为模型普遍保证。

Krea2 的同 Seed、同尺寸对照使用以下两项：

- 基础正向策略：`run_c8b2c7b9-d13a-4a02-8755-266c44b7d5d2`，Seed `342289265`，1024×1024，媒体 `1c/ae/media_1cae8942-68f8-430f-bd6b-1b544288bc86.png`。
- 目标正向规避：`run_0091f272-bcb7-4d70-9102-8ab1b7bb8a76`，相同 Seed 与尺寸，媒体 `f9/06/media_f9062c37-e7e9-49e6-b54f-8ecb4688122d.png`；该图作为 K01 最终证据。
- 基础图的双手垂在髋部和大腿外侧，没有形成下腹前低位圆弧；目标图的双手位于下腹正前方并形成互不相碰的低位圆弧，且没有叉腰、多主体、肢体错误或脚部裁切。两项请求都没有 `negative_prompt`；目标请求只通过同一 `positive_prompt` 中更明确的正向可见约束改变手位。该对照验证 Krea2 的 `positive_rewrite` 路线。

WAI 九个修正版和 K01 修正版全部复用对应 profile 的原 Seed 与尺寸。最终图片不存在因修正而改变 Seed 或尺寸的情况。

### K03 同 Prompt、同 Seed 清晰度对照

- 测试档：`run_2f05d7e0-65ee-426e-829e-b42956fca798`，Seed `446618212`，704×1408。
- 正式 2K：`run_38d01be4-312c-409f-9398-a7299e5add87`，同 Prompt、同 Seed，1024×2048，媒体 `2b/f3/media_2bf39f86-74e6-44df-9359-639322884fde.png`。
- 独立视觉结论：1024×2048 图的舞鞋、绑带和裙褶更清晰，但大图没有修复镜像手位不同步和交叠手指融合，反而使两项偏差更容易看见。清晰度 profile 的职责是提供更多可见细节，不承诺修复 Prompt 的镜像逻辑；K03 test 与 final profile 均保留。

## 未计入 profile 失败的远端 Detailer 重试

A03 至 A08 的原始 6 个 Run 均已成功并保留在 40 项证据中。计划执行者随后尝试使用相同 Seed 生成修正 Prompt。模板 `39` 的 NSFWDetailer 把许多约 30×20 像素的小区域识别为检测片段并持续逐片放大，远端队列运行超过一小时。计划执行者只取消这 6 个验收重试并清空对应远端队列，没有取消其他用户任务：

- A03：`run_7c9fba60-43e5-4ed3-b9f6-d09180c52cef`，`COMFYUI_REMOTE_ERROR`，远端状态为 cancelled。
- A04：`run_b7f5590d-94be-49e9-ab47-28414cfe0adb`，`COMFYUI_JOB_MISSING`。
- A05：`run_b0381e02-d2e8-4135-a8ce-332a473afd29`，`COMFYUI_JOB_MISSING`。
- A06：`run_0257b9c7-3a2c-41fc-83d4-318b83247630`，`COMFYUI_JOB_MISSING`。
- A07：`run_5f786363-7c56-4115-8528-46fb10052b90`，`COMFYUI_JOB_MISSING`。
- A08：`run_d90732b6-f2b3-4e5d-baa6-e1de7f80212c`，`COMFYUI_JOB_MISSING`。

这些失败发生在远端 Detailer 的修正重试，不改变原始 40 个成功 Run、Builder 结构合同、Seed 合同或尺寸 profile 的验收状态。

## 参考文档路由

真实 Desktop Agent 的独立语义审核确认以下读取顺序：

- ANIMA 首次结果构造读取 `references/generation-output-contract.md`、`references/generation-output-schema.json` 与 `references/generation-profiles.json`；内部 Prompt 校验读取现有 Prompt-format 参考并调用 `scripts/validate-output.mjs --prompt-format`；最终结果调用同一 validator 的结构化结果入口。
- WAI 首次结果构造读取同名三份 generation reference；内部 Prompt 校验读取 `references/prompt-format-validator.md` 并使用 `--prompt-format`；最终结果调用结构化结果入口。
- Krea2 首次结果构造读取同名三份 generation reference；内部自然语言 Prompt 规则来自 `references/krea2-prompt-rules.md`；最终结果调用 `scripts/validate-output.mjs`。
- `comfyui-generate` 解析 Builder 结果前读取自己的 `references/prompt-result-contract.md` 与 `references/prompt-result-schema.json`；解析模板、实例、模型和 LoRA 前读取 `references/catalog-cli.md`；首次模板检查前读取 `references/template-parameter-inspection-cli.md`；处理显式、历史或随机 Seed 与提交前读取 `references/generation-cli.md`。
- 相同模板与实例的一组请求复用本次执行仍完整可见的检查结果。任一 ID 改变时重新检查；上下文压缩导致参考内容或结果不再完整可见时，Agent 先完整重读对应 reference，再执行该阶段。
- 四个 `SKILL.md` 只保存上述读取时机和阶段路由；详细字段、尺寸矩阵、负向策略、Seed 数值合同和 CLI 接口位于各自 Skill 的 reference 文件。

独立语义 Reviewer 已确认 ANIMA、WAI 与 Krea2 的 S01-S11、P01-P12、validator、压缩后重读、模型负向分支和 40 份逐配置证据没有 P0、P1 或 P2。最终 Standards Reviewer 与 Spec Reviewer 同样确认没有 P0、P1 或 P2；真实 Desktop 与模型验收门禁通过。
