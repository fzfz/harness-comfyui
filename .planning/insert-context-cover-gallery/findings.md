# “插入上下文”封面图样例画廊：调研记录

## Requirements

- 中间列“插入上下文”按钮打开的弹窗继续展示 3×3 卡片。
- 用户点击卡片封面图后，界面弹出该封面图的大图预览。
- 大图预览能够显示该记录的其他样例图。
- 用户能够点击左右箭头图标切换样例图。
- 用户能够按键盘左右方向键切换样例图。
- 调研必须确认 CLI 是否需要提供其他样例图 URL。
- 用户审评实施计划并明确批准后，计划执行者才开始实施。

## Research Findings

- 独立 worktree 最初从提交 `1d40cd9` 创建；首次调查期间快进到 `64149eb`；本次修订又快进到 Harness `v0.30.5` 提交 `eea9c4d`，并与当前 `main`、`origin/main` 对齐。
- 原工作区包含大量未提交删除和新增文件；本次工作使用独立 worktree，避免修改或覆盖这些用户改动。
- 独立 worktree 位于 `/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-insert-context-cover-gallery`。
- 独立分支为 `codex/plan-insert-context-cover-gallery`。
- 运行时 Client 源码位于 `src/client/`；`prototype/` 不是运行时数据来源，因此计划不能以原型文件作为实施目标。
- Catalog CLI adapter、查询 Tool 和 Catalog Remote 位于 `src/host/catalog/`；共享的运行媒体合同位于 `src/generation/`。
- 仓库没有独立开发启动命令；实现后的系统联调必须使用 `pnpm prod:start|restart`、`pnpm prod:status`、`pnpm prod:health` 和 `pnpm prod:logs`。
- 自动化质量门禁由 `pnpm quality` 执行；功能分支测试主要位于 `tests/unit/`，Host 组合与 HTTP 路由测试位于 `tests/integration/`。
- 新功能测试必须覆盖成功、拒绝、清理和错误分支；语义文档必须由独立 Reviewer 验收，不能使用脚本判断语义质量。
- 当前前端技术栈为 React 18.3.1；测试栈为 Vitest 4.1.8；所有直接依赖必须使用精确版本。
- 发布流程要求源码与版本提交、质量门禁、GitHub CI、发布文档语义审查、最终 CI、Git tag、GitHub Release 和生产部署；计划执行阶段不能用手工编辑生产 checkout 代替仓库修复。
- 仓库领域名词将浏览器插件称为 **Client Module**，将 `src/host/plugin.ts` 称为 **Host Plugin**，将外部目录数据合同称为 **Source Contract Identity**；正式计划必须沿用这些名称。
- 当前 Source Contract Identity 固定为 `imagegen-source-contract` 版本 `0.82.2`，唯一结构化合同文件是 `config/source-contract-v0.82.2.json`。
- ADR 0007 要求数据源仓库使用一个权威 OpenAPI schema，并投影 Agent 安全的 Catalog Operation 与 Host 专用 Source Operation；“插入上下文”目录卡片预计属于 Catalog Operation，最终仍须以代码追踪结果确认。
- ADR 0009 要求 Host adapter 严格校验 discovery、OpenAPI、operation metadata、统一分页 envelope 和业务字段；如果增加样例图字段，计划必须同时更新结构化合同和 adapter 校验，不能猜测字段或静默兼容旧 wrapper。
- ADR 0012 禁止修改或复制 Harness Core；图片预览只能在本项目公开 Client slot 中实现。
- ADR 0003 将 Message Context 与 Execution Route 分离；本需求只改变 Catalog 记录的图片浏览，不应把 ComfyUI 实例或其他执行路由写入 Message Context。
- “插入上下文”运行时 UI 位于 `src/client/workbench/native-surfaces.tsx` 的 `WorkbenchDock`；文案唯一来源是 `src/client/workbench/contract.ts` 的 `WORKBENCH_COPY`。
- `WorkbenchDock` 使用 `@deepseek-ai/dsh-client-ui-primitives` 的 `Modal` 打开“插入 ComfyUI 上下文”弹窗；资源区使用 `.harness-comfyui-catalog-items` 的三列 CSS Grid，每个卡片固定高度 176px，封面区域固定高度 104px。
- 当前 `CatalogItem` 只有 `context`、`label`、`subtitle` 和 `coverUrl`；`coverUrl` 为 `null` 时显示“暂无封面”。
- 当前整张资源卡片是一个 `Button`，卡片 `onClick` 直接调用 `toggleOption(option)`；封面 `<img>` 位于该 Button 内。因此直接在图片上增加第二个 Button 会形成嵌套交互元素，实施计划必须先拆分“选择资源”与“预览图片”的交互边界，不能创建 button-in-button DOM。
- 当前卡片用 `aria-pressed` 表达资源选择状态，封面右上角 `.harness-comfyui-card-selection` 同时显示“选择/已选择”；预览交互不能破坏现有选择语义。
- `WorkbenchDock` 已经维护目录弹窗、过滤、搜索、分页和待确认选择状态；图片画廊状态应限定在 Client Module 中，并在目录弹窗关闭、切换目录页或切换资源类型时有明确清理规则。
- `tests/unit/native-surfaces.test.tsx` 使用 `react-test-renderer` 和本地 primitive mocks 测试目录弹窗；现有“loads covered cards...”用例只断言一张封面图和无封面占位，并通过点击整张卡片测试多选。
- 当前 Client Module 样式由单一 `src/client/styles.css` 提供；封面图片使用 `object-fit: contain`。
- 项目已经直接依赖并使用 `IconChevronLeftOutline14` 与 `IconChevronRightOutline14`；`src/client/workbench/results-drawer.tsx` 用这两个 icon 构建媒体分页按钮，因此本需求不需要为了左右箭头新增图标依赖。
- 项目已经用同一个 primitive `Modal` 实现 Catalog 弹窗和运行错误详情弹窗；计划可以复用该 primitive 构建图片预览层，但必须验证嵌套 Modal 的焦点、Escape 关闭和遮罩事件是否符合预期。
- 代码库中没有现成的 lightbox、carousel 或 `ArrowLeft`/`ArrowRight` 键盘处理实现；新的键盘切换逻辑需要由 Client Module 明确定义并测试。
- 现有 `ProjectionMediaGallery` 的左右 chevron 只做分页，使用禁用首尾按钮而不是循环；该行为不能自动决定本需求是否循环切图，实施计划必须明确首尾行为。
- 现有媒体预览错误通过 `onError` 进入可见错误状态；Catalog 封面目前没有 `onError`。图片画廊需要定义单张样例加载失败时保留预览层、显示哪张图片的错误以及能否继续切换。
- `tests/unit/results-drawer.test.tsx` 证明项目会直接检查 `object-fit: contain` 样式，并对 chevron 按钮的 `aria-label`、禁用状态和翻页行为做组件测试；本需求的样式与交互测试可以沿用这些测试模式。
- `package.json` 将 `@deepseek-ai/dsh-client-ui-primitives`、React、React DOM 和 React Test Renderer 全部固定为精确版本；primitive 版本为 `0.1.1-rc.2`，React 系列版本为 `18.3.1`。
- 新 worktree 没有自己的 `node_modules`，但原工作区存在与锁文件对应的本地 pnpm 安装，可作为只读的 primitive 实现与类型证据来源；本次调研不需要安装依赖。
- `find-docs` 默认依赖 Context7 CLI；仓库安全规则不允许未经用户批准下载或运行该外部 CLI，因此本次采用已安装本地包和仓库测试作为版本级文档来源。
- 本地 `@deepseek-ai/dsh-client-ui-primitives@0.1.1-rc.2` 包清单确认 `Button`、`Modal` 和图标都是纯 React primitive；`Modal` 通过 `closeLabel` 接收用户可见的关闭文案。
- primitive README 提到 Harness 的 attachment UI 内部存在图片灯箱，但该灯箱不在当前项目导入的 primitive 清单中；ADR 0012 也禁止复制或导入 Harness 内部实现。因此计划应使用公开 `Modal`、`Button` 和 chevron icon 组合项目自有的 Catalog 图片预览，而不是依赖 Harness 内部灯箱。
- primitive 包只将 `lib/index.js` 和 `lib/types/index.d.ts` 定义为公开入口；正式实施不得使用 `./src/*` 公共逃生口导入内部模块，因为项目 ADR 已限定只使用 Harness 公共 package export 与服务接口。
- 本机安装包公开导出 `Modal`、`IconChevronLeftOutline14`、`IconChevronRightOutline14`、`IconCloseOutline16` 和 `IconFullscreenOutline16`；图片预览所需视觉 primitive 已齐全，不需要增加依赖。
- `Modal` 的公开类型包含 `open`、`onClose`、`title`、`closeLabel`、`description`、`footer`、`className`、`contentClassName` 和 `headless`；当前版本渲染 `aria-modal="true"`。
- `Modal@0.1.1-rc.2` 通过 `document.addEventListener('keydown', ...)` 监听 Escape，并通过 body portal 渲染遮罩和 `role="dialog"`；实现没有焦点陷阱、初始聚焦或关闭后的焦点恢复。
- 同时打开两个 primitive `Modal` 会让两个实例都注册 document 级 Escape listener；按 Escape 时可能同时关闭图片预览和底层 Catalog 弹窗。因此计划不应把第二个 primitive Modal 直接嵌套在保持打开的 Catalog Modal 之上。
- 推荐的 Client 交互结构是在同一个 `Modal` 实例中增加 `catalog` 与 `gallery` 两种内容模式：打开画廊时保留 Catalog 查询、分页和待确认选择状态，只替换 Modal 的标题、关闭回调、内容、footer 与尺寸 class；关闭画廊后恢复原目录内容。该结构只注册一个 Escape listener，也不需要复制 modal 遮罩实现。
- 计划必须增加项目自有的打开者 ref 与显式聚焦：画廊打开后把焦点放到画廊标题或当前图片区域，画廊关闭后把焦点还给原封面预览按钮。primitive Modal 不会代替项目完成这两项操作。
- 3×3 不是仅由 CSS 偶然形成：`src/catalog/contract.ts` 的 `CATALOG_PAGE_SIZE` 固定为 9，Host Catalog CLI 调用也使用该值，并且 Client 用该值计算目录页数。
- Catalog Modal 宽度为 `min(860px, calc(100vw - 48px))`，最大高度为 `calc(100vh - 48px)`；目录网格没有额外媒体查询。画廊样式必须使用视口约束和 `object-fit: contain`，不能以固定像素宽高假设桌面窗口。
- 当前卡片的 176px 高度和封面区域的 104px 高度是既有 3×3 布局合同；拆分预览按钮和选择按钮时必须保持该几何结构，除非用户另行批准视觉重排。
- 当前前端数据链路已经定位为 `src/client/index.tsx` → `remote.harnessComfyuiCatalog.search` → `src/host/catalog/catalog-service.ts` → Catalog adapter → `src/host/catalog/catalog-cli.ts` → 外部 Catalog CLI。
- Host adapter 在 `src/host/catalog/catalog-cli.ts` 把 CLI 原始字段 `cover_url` 映射成 Client 合同字段 `coverUrl`；`src/catalog/contract.ts` 对 `CatalogItem` 执行 exact-key 校验，所以 CLI 即使额外返回样例图字段，当前 Client 也不会自动得到该字段。
- `CATALOG_REMOTE` 目前只有 `search` 与 `baseModels` 两个 descriptor；最小方案应扩展现有 `search` 结果项，而不是增加一个逐卡片图片请求，否则 3×3 页面会引入额外请求和状态管理。
- Catalog CLI search 已经一次返回当前 9 张卡片的完整 `results` 数组；Host adapter 对每条原始记录做安全投影，主动剔除 `workflow_json` 等 Host/Agent 不应获得的数据。样例图 URL 可以作为显示专用字段加入这次安全投影，不需要进入 `CatalogContext` 或消息草稿。
- `CatalogContext` 只保存 Agent 可见的领域身份与提示词数据；现有测试明确断言其中不含 `label`、`subtitle` 或 `coverUrl`。新的样例图 URL 也必须只存在于 `CatalogItem`，不能被 `serializeWorkbenchContext` 写入消息。
- Client 合同的 URL parser 只接受长度不超过 2,000 的 `http://127.0.0.1/...` URL；样例图 URL 数组应复用同一 URL parser，保证封面和样例图采用相同本机媒体来源约束。
- Host adapter 当前把缺失、`undefined` 或 `null` 的 `cover_url` 都归一化为 `coverUrl: null`。新 Source 版本必须对八个“插入上下文”资源 operation 的每条记录显式提供 `sample_image_urls` 数组；没有其他图片时返回空数组。Host 遇到缺失、`null`、非数组、重复或非法 URL 时必须返回协议错误，不能为旧 Source 响应静默补空数组。
- `config/source-contract-v0.82.2.json` 记录 CLI envelope、10 个 Catalog Operation、路径和过滤器，但业务记录字段由 live OpenAPI discovery 与 Host adapter 共同校验；必须继续追踪 discovery validator，确认新增字段需要变更哪些 source contract 断言。
- 生产配置把 Catalog CLI 定位到相邻环境的 `../NoobAI-XL-FZ-PROD-ENV/scripts/imagegen-semantic-query.mjs`，端口为 `18093`；本仓库不拥有 CLI 实现。
- `src/host/plugin.ts` 在 Host 启动时直接构造 `CatalogCli`，没有调用 `--discovery-json`；全仓库对 `--discovery-json` 的唯一引用在 `config/source-contract-v0.82.2.json`。这与 ADR 0009 所述“Host adapter 启动时读取 live discovery 并校验业务字段”不一致。
- `config/source-contract-v0.82.2.json` 当前也没有列出各 Catalog Operation 的结果字段，只记录路径、operationId 和过滤器。实施计划不能假称现有运行时代码会自动验证新增样例图字段；必须把实际 adapter parser 和单元测试作为当前运行门禁，并单独记录是否需要同步 Source Contract 版本。
- 上述 discovery 实现差异只在本需求必须升级外部 CLI 合同时处理；本次需求计划不会顺便设计一套新的 discovery validator，因为那是独立架构缺口，不是图片画廊的必要结果。
- 相邻 Source 环境中的 `imagegen-semantic-query.mjs` 版本为 `2.0.0`。该 CLI 通过 HTTP 调用本机 Catalog service，并明确承诺对 2xx body 做严格 UTF-8、单 JSON 值与原始字节透传；它明确不校验 2xx 响应字段或 response schema。
- 因为 CLI 是 raw-passthrough wrapper，新增样例图 URL 不需要修改 CLI 参数解析或输出代码。真正的数据生产变更应发生在相邻 Source 仓库的 Catalog service 查询/投影和 OpenAPI 合同中；CLI 会原样把新字段传给本仓库 Host adapter。
- 相邻 Source OpenAPI 当前把单条目录结果描述为通用数据库记录，并说明 service 可能把 `cover_media_path` 替换为 `cover_url`。需要继续定位实际查询投影、媒体表和排序规则，确定样例图的权威来源与字段名。
- 相邻 Source 仓库已经存在按 `owner_kind`、`owner_id` 关联的图片集合，管理/媒体 service 的 snapshot 同时包含 `cover_media_path` 与 `images`；数据库并不缺少同一记录的其他图片。
- 相邻 Source 测试覆盖 generation model、LoRA、work、character、style、artist prompt string 和 ComfyUI template 的多图/封面关系；prompt term 当前检索结果没有 `cover_url`，因此应自然返回空图片数组。
- Source `item_images` 表已经提供统一的 `owner_kind`、`owner_id`、`media_path` 和 `sort_order`；`catalog-repository.mjs` 现有 `imagesByOwner` 查询按 `sort_order, id` 稳定排序。
- 初次调查时运行中的 Source `v0.82.9` 只把 `cover_media_path` 转为 `cover_url`，没有把 `item_images` 的其他路径投影到语义 Catalog 响应；Source 开发仓库的 `v0.84.0` 已经补齐该投影。
- 最小 Source 改动应复用 `item_images` 和现有本机媒体 URL 生成函数，新增 `sample_image_urls`：排除 `cover_media_path`，其余图片按 `sort_order, id` 输出。Harness Host 将它映射为 `sampleImageUrls`，Client 画廊列表使用 `[coverUrl, ...sampleImageUrls]`，从索引 0 打开封面。
- `sample_image_urls` 排除封面可以同时保证封面始终为画廊首图、避免重复 URL，并保留 Source 数据库定义的其他图片顺序。
- `item_images.owner_kind` 当前支持 `work`、`character`、`style`、`model`、`lora`、`artist_prompt_string` 和 `template`，与 Harness 目录中可显示封面的七类记录一一对应；`prompt-term` 没有媒体 owner kind。
- `item_images` 用 `UNIQUE(owner_kind, owner_id, sort_order)` 保证单记录内顺序唯一；同顺序的 id 仅作为确定性补充排序。
- Source 数据库对 `template` 建立单图片唯一索引，所以 Workflow 模板当前最多只有封面图；Client 必须支持打开单图画廊并禁用或隐藏左右箭头。
- `work.cover_media_path` 的数据库约束允许封面来自该作品自己的 `work` 图片，也允许来自该作品下属角色的 `character` 图片。作品画廊固定以 `cover_url` 为首图，并且只追加 owner 为当前 work 的直接图片；计划不把作品下全部角色图片隐式并入作品画廊。
- live Catalog discovery 当前为 OpenAPI 3.1；8 类目录 search 都能成功返回第一页。
- live generation model、LoRA、work、character、style、prompt term 和 artist prompt string 响应均没有 `sample_image_urls`。Workflow 模板 search 还会返回完整 `workflow_json`，第一页原始输出约 7 万 token；Host adapter 随后才剔除该字段。
- live discovery 的媒体 origin 为 `http://127.0.0.1:18092`，与 Harness `coverUrl` parser 的本机 HTTP 约束一致。
- live 第一页封面覆盖率为：generation model 2/9、LoRA 9/9、work 7/9、character 4/9、style 0/9、prompt term 0/9、artist prompt string 9/9、Workflow template 0/9。画廊入口必须只在 `coverUrl !== null` 时可用，不能把无封面占位变成可点击预览。
- live 8 类响应的 `sample_image_urls` 出现次数均为 0，确认当前链路没有隐藏的多图字段可直接复用。
- Source 应用配置把业务数据库固定为 `data/app.sqlite`。本次使用 `/usr/bin/sqlite3 -readonly` 检查生产数据，确认单条记录最大图片数为：generation model 6 张、LoRA 8 张、artist prompt string 2 张、character 1 张、style 1 张；当前没有 work 或 template owner 图片行。
- 初次生产调查时，Source 生产 checkout 位于 tag `v0.82.9`、commit `a589ffde74c306c6adc36f8001f17d6790cac9f4`；本次修订期间该 checkout 已由外部流程更新到 `v0.84.0/a3d1a8c`。Harness 当前结构化消费合同仍固定为 `0.82.2`，且必须等 Source 发布门禁恢复后才能切换为 `0.84.0`。
- 当前生产数据已经包含本需求需要的其他样例图，不需要数据库迁移、图片复制或新的媒体端点。

## Technical Decisions

| Decision | Rationale |
|---|---|
| 先追踪现有响应，再决定是否修改 CLI | 用户提出 CLI 可能需要提供其他图片 URL；计划必须基于实际数据契约，而不是假设。 |
| 本轮不修改任何业务代码或测试 | 用户要求先审评计划。 |
| Catalog 与图片画廊复用一个 primitive Modal，并切换内容模式 | 避免两个 document 级 Escape listener 同时关闭两层弹窗，并保留 Catalog 状态。 |
| 样例图 URL 只扩展 `CatalogItem`，不扩展 `CatalogContext` | 样例图是 Client 显示数据，不是需要写入 Message Context 的 Agent 领域资源。 |
| 使用空数组表达“该记录没有可预览图片” | 单一数组类型可以直接支持 0、1、多图分支，避免 `null` 与数组双重状态。 |
| 不修改 `imagegen-semantic-query.mjs` raw-passthrough wrapper | wrapper 已经原样透传 service 2xx JSON；数据字段应由 Source Catalog service 和 OpenAPI 生产。 |
| Source 输出 `sample_image_urls`，Host 输出 `sampleImageUrls` | 字段只表达封面以外的样例图；Client 可以用 `coverUrl` 加该数组构造唯一且确定的画廊顺序。 |
| Source 先发布并部署，Harness 后切换固定版本 | 新 Harness 把 `sample_image_urls` 视为必填业务字段；Source 先行可以避免部署窗口中的协议错误，也不需要旧字段兼容逻辑。 |
| 作品画廊只追加 work 直接图片 | `cover_url` 已能保留角色来源封面；把作品下全部角色图片并入会扩大“同一记录的其他样例图”语义并增加不必要数据量。 |
| Source 仓库状态不构成 Harness 实施门禁 | 用户明确 Source 是另一个仓库；Harness 只固定消费已经完成并部署的 `v0.84.0` 数据合同。 |
| 封面预览与记录选择使用同级按钮 | 当前整张卡片 Button 调用 `toggleOption()`；新结构必须让封面按钮只打开画廊，让记录选择按钮继续承担 `aria-pressed`、待确认数量和最终插入行为，不能嵌套按钮。 |

## 2026-08-27 Source 已完成实现复核

- Source 开发仓库 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ` 的 `main`、`origin/main`、分支 `codex/source-catalog-sample-image-urls` 和 tag `v0.84.0` 当前都指向提交 `a3d1a8c`。
- Source 根 `package.json.version` 为 `0.84.0`；发布提交信息为 `release: publish v0.84.0 source catalog sample images`。
- Source `v0.84.0` 已在 `app/catalog/catalog-service.mjs` 的八个目标资源投影中输出 `sample_image_urls`。
- Source 根 `schema/api/openapi.yaml` 和 `docs/versions/v0.84.0/schema/api/openapi.yaml` 已声明 `sample_image_urls`。
- Source 单元、集成和合同测试已经包含 generation model、LoRA、work、character、style、prompt term、artist prompt string、ComfyUI template、HTTP/CLI 和 OpenAPI 的新字段断言。
- Source `docs/versions/v0.84.0/变动范围.md` 已明确：字段必填、空数组语义、排除封面、去重、`sort_order,id` 排序、Prompt-term 无 `cover_url`、work 只追加直接图片，以及 base model/ComfyUI instance 不增加字段要求。
- 本次 Source 复核开始时，生产 checkout 仍为 `v0.82.9/a589ffde`；独立 Reviewer 复验时生产 checkout 已变为 `v0.84.0/a3d1a8c`。最终计划以复验后的生产状态为准。
- 修订后的 Harness 计划固定消费 Source `0.84.0`，删除 Source 开发、测试、CI、版本编写、tag 创建和重复生产部署步骤，只保留 Source 生产提交与 live CLI 的只读合同证据。
- Source `catalog-repository.mjs` 已新增 `listCatalogImagesByOwners(ownerKind, ownerIds)`；该方法对 owner ID 去重，并使用一条 `owner_kind = ? AND owner_id IN (...)` 查询，排序为 `owner_id, sort_order, id`。
- Source `catalog-service.mjs` 已新增单一 `CATALOG_IMAGE_OWNER_KIND` 结构化映射和统一的 Catalog 图片投影；八个 mapper 都接收投影后的 `sampleImageUrls`。
- Source OpenAPI 已新增 `CatalogSampleImageResultRecord`：`sample_image_urls` 为 required array、`uniqueItems: true`，每个元素必须匹配带有效端口的 `http://127.0.0.1/...` URI。
- `v0.82.9..v0.84.0` 的变更还包含独立的 v0.83.0 管理弹窗修复；Harness 只消费已发布 Source `v0.84.0` 合同，不需要把 Source 管理页面改动纳入本需求。
- Harness 规划 worktree 已从 `64149eb` fast-forward 到 `eea9c4d`；新增提交涉及 README、release notes、系统文档和 Workflow compiler，没有修改本需求的 Client 或 Catalog 运行文件。当前 Harness 产品版本为 `0.30.5`。
- 修订计划列出的 Harness 现有实现、测试和文档路径均已核对。`tests/contract/source-contract.test.ts` 当前不存在，因此计划必须把它明确写成新增的结构化 Source Contract 合同测试，而不能写成更新现有文件。
- `config/source-contract-v0.82.2.json` 的版本身份同时由文件名、根 `$id` 和根 `sourceReleaseVersion` 表达；新建 `config/source-contract-v0.84.0.json` 时必须同步更新三处，并由新增的合同测试锁定。
- 独立 Reviewer 复验时发现 Source 生产状态在本轮调研期间发生变化。计划编写者随后复核 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV`：`HEAD`、`v0.84.0^{}` 均为 `a3d1a8ceea39edebde0e0b70dbbc07dd31e1b4a4`，`package.json.version` 为 `0.84.0`。
- Source `npm run prod:status` 当前报告 PID `14974` 健康且内部监听端口为 `18093`；`lsof -a -p 14974 -d cwd -Fn` 确认 cwd 为 Source 生产 checkout。Source `v0.84.0` 已经部署并运行，修订计划必须删除从 `v0.82.9` 重复部署 `v0.84.0` 的步骤。
- Harness 当前 ADR 编号存在 `0002` 至 `0012`，其中没有 `0011`，最大编号为 `0012`；本需求的新 ADR 使用确定路径 `docs/adr/0013-source-contract-v0.84.0.md`，避免重用历史缺号。
- Source 生产 PID 文件的权威路径是 `runtime/run/app.pid`；计划可以通过该文件读取 PID，并用 `lsof -a -p "$SOURCE_PID" -d cwd -Fn` 核对进程工作目录。
- 使用 Source 生产 CLI 对八个目标 operation 的第一页进行只读复核：每类均返回 9 条结果，每条都显式提供数组类型的 `sample_image_urls`，封面重复计数均为 0；generation model 单条最大样例数为 5，LoRA 单条最大样例数为 4。
- 修订计划中的 Source Git/tag/version、`npm run prod:status`、PID cwd 和三组 live CLI 命令已经按计划文本逐条执行；live CLI 的 10 个 `jq -e` 断言全部退出 0。

## Issues Encountered

| Issue | Resolution |
|---|---|
| 原工作区不是干净工作树 | 从当前 `main` 创建独立 worktree，保留原工作区全部未提交状态。 |
| 首次使用了错误的 `stop-that-shit` 文件路径 | 根据技能清单修正为插件缓存中的实际路径。 |
| 首次按常见项目布局搜索相邻 Source 仓库的 `src/` | 相邻仓库没有 `src/`；改用实际根目录和媒体相关命中定位模块。 |
| 首次汇总 live CLI 响应时，工具在超大 Workflow 模板响应前加入截断提示 | 已让 `jq` 在 CLI 后先投影字段摘要，成功获得 8 类 live 字段和封面计数。 |
| 首次误把工具截断提示判断成 Node warning | 对 8 类响应逐一检查前缀，确认只有 Workflow 模板响应因为完整 `workflow_json` 触发截断。 |
| 修正 live CLI 错误日志时补丁上下文不匹配 | 读取三个规划文件的精确段落后分文件修正。 |
| 更新 live 调研记录时混用了 `findings.md` 与 `progress.md` 的补丁上下文 | 分文件使用独立补丁更新。 |
| 读取预期的 `docs/versions/v0.84.0/quality/release-acceptance.md` 时发现文件不存在 | 改为读取实际存在的 v0.84.0 版本目录、`变动范围.md` 和 `tests/contract/v0.84.0-release.test.mjs`，不能把旧版本目录布局套到新版本。 |
| 一个补丁同时对 `implementation-plan.md` 执行删除和新增操作，`apply_patch` 拒绝同路径多操作 | 将删除和新增拆成两个补丁调用，完成计划整体改写。 |
| 路径核对发现计划中的 `tests/contract/source-contract.test.ts` 当前不存在 | 把该项改为“新增 `tests/contract/source-contract.test.ts`”，其余计划列出的 Harness 现有路径均存在。 |
| 独立 Reviewer 发现 Source 生产 checkout 已在调研期间从 `v0.82.9` 变为 `v0.84.0` | 重新核对提交、tag、package 版本、生产状态和 PID cwd；计划将生产部署改为现状核对与 live 验收，不重复部署，也不擅自回退。 |

## Resources

- 工作仓库：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-insert-context-cover-gallery`
- 调研计划：`.planning/insert-context-cover-gallery/task_plan.md`
- 调研进度：`.planning/insert-context-cover-gallery/progress.md`
- 系统架构：`docs/system/architecture.md`
- 目录结构：`docs/system/directory-structure.md`
- 测试规范：`docs/system/testing.md`
- 技术栈：`docs/system/technology-stack.md`
- 版本发布规范：`docs/system/releasing.md`
- 领域上下文：`CONTEXT.md`
- Source Contract 双读取表面：`docs/adr/0007-one-source-contract-with-two-read-surfaces.md`
- Source Contract 版本门禁：`docs/adr/0009-source-contract-version-gate.md`
- Harness Core 不可变边界：`docs/adr/0012-harness-core-is-immutable.md`
- Client Module 目录弹窗：`src/client/workbench/native-surfaces.tsx`
- Client Module 文案合同：`src/client/workbench/contract.ts`
- Client Module 样式：`src/client/styles.css`
- 目录弹窗单元测试：`tests/unit/native-surfaces.test.tsx`
- 现有 chevron 与 Modal 用法：`src/client/workbench/results-drawer.tsx`
- 现有媒体预览测试：`tests/unit/results-drawer.test.tsx`
- 本地 UI primitive 包说明：`/Volumes/4Tdisk/work/AI2/harness-comfyui/node_modules/@deepseek-ai/dsh-client-ui-primitives/README.zh.md`

## Visual/Browser Findings

- 尚未进行浏览器或图片检查。
