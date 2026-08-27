# “插入上下文”封面图样例画廊实施计划

## 计划状态

- 状态：用户已批准执行。
- 用户补充验收要求：封面预览按钮不能破坏每条记录原有的选择交互；封面预览按钮不得调用 `toggleOption()`，记录选择按钮必须继续维护 `aria-pressed`、待确认数量和最终插入结果。
- 独立语义审查：最终结论 PASS；Reviewer 的四项文档一致性问题已经全部修正并复验关闭。
- Harness 基线：`main` 提交 `eea9c4d307e90c6d68bd2da37b69fe0891a9992f`，tag `v0.30.5`，产品版本 `0.30.5`。
- 已完成的 Source 合同基线：提交 `a3d1a8ceea39edebde0e0b70dbbc07dd31e1b4a4`，tag `v0.84.0`，产品版本 `0.84.0`。
- Source 生产基线：提交 `a3d1a8ceea39edebde0e0b70dbbc07dd31e1b4a4`，tag `v0.84.0`，产品版本 `0.84.0`；生产 PID `14974` 当前健康，cwd 为 Source 生产 checkout，内部监听端口为 `18093`。
- Harness 必须固定消费的 Source 版本：`0.84.0`。
- 计划目标 Harness 版本：`0.30.7`。
- 如果用户批准执行时 Harness `main` 已经修改本计划涉及的 Client、Catalog 或 Source Contract 文件，计划执行者必须先更新本计划中的基线与受影响步骤，再交给用户确认。

## 必须要实现的目标

1. Client Module 必须保持“插入 ComfyUI 上下文”弹窗现有的 3×3 资源卡片布局、搜索、资源类型筛选、底模筛选、分页和多选行为。
2. 具有 `coverUrl` 的资源卡片必须提供独立的封面预览按钮。用户点击封面预览按钮时，Client Module 必须打开该记录的图片画廊，且不能改变该记录的选中状态。
3. 图片画廊必须先显示卡片封面，再按照 Source `item_images.sort_order, item_images.id` 的顺序显示该记录的其他样例图。
4. 用户必须能够点击左箭头或右箭头按钮切换图片，也必须能够按键盘 `ArrowLeft` 或 `ArrowRight` 切换图片。
5. 图片画廊必须采用非循环切换：第 1 张图片禁用左箭头，最后 1 张图片禁用右箭头；单图记录同时禁用两个箭头。
6. 图片画廊必须显示当前图片序号和图片总数，并为关闭、上一张、下一张和当前图片提供明确的辅助技术名称。
7. 用户关闭图片画廊后，Client Module 必须恢复原来的 Catalog 内容、当前资源类型、底模筛选、搜索词、页码和待确认选择，并把键盘焦点还给打开画廊的封面预览按钮。
8. 当前图片加载失败时，图片画廊必须显示明确的错误文案，同时保留关闭、上一张和下一张操作。用户切换到另一张图片时，Client Module 必须重新尝试加载新图片。
9. Harness Host 必须消费 Source `v0.84.0` 已提供的 `sample_image_urls: string[]`，并把该字段安全投影为 `CatalogItem.sampleImageUrls: readonly string[]`。
10. `CatalogContext` 和 composer 草稿序列化必须保持原合同；`coverUrl` 与 `sampleImageUrls` 不能进入 Message Context 或生成提示词。
11. 计划执行者必须让 Harness 固定消费已经完成并部署的 Source `0.84.0` 合同，并发布 Harness `0.30.7`。

## 已完成的 Source 前置产物

以下 Source 工作已经存在于 `v0.84.0`，计划执行者不得重复实施：

- `app/catalog/catalog-repository.mjs` 已提供 `listCatalogImagesByOwners(ownerKind, ownerIds)`。该方法对 owner ID 去重，并通过一条 `owner_kind = ? AND owner_id IN (...)` 查询读取当前页图片，排序为 `owner_id, sort_order, id`。
- `app/catalog/catalog-service.mjs` 已使用单一 `CATALOG_IMAGE_OWNER_KIND` 映射处理八个目标资源 operation，并让 search 与 resolve 使用统一图片投影。
- Source 投影已经排除 `cover_media_path`、去除重复 URL、保持 `sort_order, id` 顺序，并为没有其他图片的记录返回 `sample_image_urls: []`。
- `work` 结果只追加当前 work 的直接图片；work 的 `cover_url` 继续允许来自所属角色。
- `prompt-term` 结果固定返回 `sample_image_urls: []`。
- 根 `schema/api/openapi.yaml` 与 `docs/versions/v0.84.0/schema/api/openapi.yaml` 已提供 `CatalogSampleImageResultRecord`。八个目标 operation 的成功响应要求 `sample_image_urls`，base model 与 ComfyUI instance 的成功响应不要求该字段。
- Source 单元测试、集成测试和合同测试已经包含 generation model、LoRA、work、character、style、prompt term、artist prompt string、ComfyUI template、HTTP/CLI 和 OpenAPI 的新字段分支。
- `docs/versions/v0.84.0/变动范围.md` 已记录字段必填、空数组、封面排除、去重、排序和无数据库迁移等合同语义。
- `imagegen-semantic-query.mjs` 继续原样透传 Catalog HTTP 的 2xx JSON；该 wrapper 不需要字段级业务代码变更。
- `item_images` 已经包含其他样例图。本需求不需要数据库迁移、图片复制或新媒体端点。

Source 生产部署和 live 数据供给已经完成：

- Source 生产 checkout 的 `HEAD`、`v0.84.0^{}` 和根 `package.json.version` 分别为 `a3d1a8c`、`a3d1a8c` 和 `0.84.0`。
- `npm run prod:status` 报告 PID `14974` 健康，内部监听端口为 `18093`；该 PID 的 cwd 是 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV`。
- 八个目标 operation 的生产 CLI 第一页结果均显式包含数组类型的 `sample_image_urls`，且封面 URL 没有重复进入样例数组。
- generation model 第一页的单条最大样例数为 5；LoRA 第一页的单条最大样例数为 4。当前生产数据足以支持多图画廊验收。

## 实施前确认的 Harness 基线

### Client Module

- `src/client/workbench/native-surfaces.tsx` 中的 `WorkbenchDock` 负责“插入上下文”按钮、Catalog Modal、3×3 资源卡片和待确认选择。
- `src/client/workbench/contract.ts` 中的 `WORKBENCH_COPY` 是该界面的文案唯一来源。
- `src/client/styles.css` 使用三列 Grid、176px 卡片高度和 104px 封面高度。
- 当前整张资源卡片是一个 `Button`，封面 `<img>` 位于该 Button 内。实施不能在该 Button 内嵌套另一个预览 Button。
- `@deepseek-ai/dsh-client-ui-primitives@0.1.1-rc.2` 已公开 `Modal`、`Button`、`IconChevronLeftOutline14` 和 `IconChevronRightOutline14`，本需求不需要新增依赖。
- 当前 `Modal` 使用 document 级 Escape listener，但不负责初始聚焦、焦点陷阱或焦点恢复。同时打开两个 primitive Modal 会注册两个 Escape listener。

### Harness 数据链路

```text
src/client/index.tsx
  → remote.harnessComfyuiCatalog.search
  → src/host/catalog/catalog-service.ts
  → src/host/catalog/catalog-cli.ts
  → imagegen-semantic-query
  → Source Catalog HTTP operation
```

- 实施开始前，`src/host/catalog/catalog-cli.ts` 只把 Source `cover_url` 映射为 `CatalogItem.coverUrl`。
- `src/catalog/contract.ts` 对 `CatalogItem` 执行 exact-key 校验，并且只接受 `http://127.0.0.1/...` 图片 URL。
- `src/client/workbench/contract.ts` 只把 `CatalogContext` 写入 composer 草稿；`CatalogItem` 的展示字段不会进入 Message Context。
- 实施开始前，Harness Source Contract Identity 固定为 `0.82.2`，结构化合同文件是 `config/source-contract-v0.82.2.json`；Source 生产环境已经是 `0.84.0`。

## 数据合同

### Source `v0.84.0` Catalog 结果

八个目标 operation 是：

1. `querySemanticGenerationModelsForSkill`
2. `querySemanticLorasForSkill`
3. `querySemanticWorksForSkill`
4. `querySemanticCharactersForSkill`
5. `querySemanticStylesForSkill`
6. `querySemanticPromptTermsForSkill`
7. `querySemanticArtistPromptStringsForSkill`
8. `querySemanticComfyuiTemplatesForSkill`

具有封面的结果使用以下字段组合：

```json
{
  "cover_url": "http://127.0.0.1:18092/media/images/example-cover.webp",
  "sample_image_urls": [
    "http://127.0.0.1:18092/media/images/example-2.webp",
    "http://127.0.0.1:18092/media/images/example-3.webp"
  ]
}
```

- 各 operation 保持当前 `cover_url` 的存在性和可空语义；Prompt-term 继续不返回 `cover_url`。
- `sample_image_urls` 是必填数组；没有其他图片时返回 `[]`。
- `sample_image_urls` 不包含与 `cover_url` 相同的 URL，也不包含重复 URL。
- `sample_image_urls` 按对应 `item_images.sort_order, item_images.id` 排序。
- Source 不能为没有图片的记录生成占位 URL。

Source 资源类型到 `item_images.owner_kind` 的映射为：

| Harness 资源类型 | Source owner kind | 图片集合 |
|---|---|---|
| `model` | `model` | 当前模型的直接图片 |
| `lora` | `lora` | 当前 LoRA 的直接图片 |
| `work` | `work` | 当前作品的直接图片；`cover_url` 可以继续来自所属角色 |
| `character` | `character` | 当前角色的直接图片 |
| `style` | `style` | 当前风格的直接图片 |
| `artist-string` | `artist_prompt_string` | 当前画师串的直接图片 |
| `comfyui-template` | `template` | 当前模板的直接图片 |
| `prompt-term` | 无 | 固定返回 `[]` |

`querySemanticBaseModelsForSkill` 与 `querySemanticComfyuiInstancesForSkill` 不属于“插入上下文”资源结果，本计划不要求它们返回 `sample_image_urls`。

### Harness `CatalogItem`

`src/catalog/contract.ts` 中的展示合同必须修改为：

```ts
export interface CatalogItem {
  readonly context: CatalogContext
  readonly label: string
  readonly subtitle: string
  readonly coverUrl: string | null
  readonly sampleImageUrls: readonly string[]
}
```

Harness parser 必须执行以下校验：

- `sampleImageUrls` 必须是数组。
- 每个元素必须复用 `coverUrl` 的本机 HTTP、长度和 URL 解析规则。
- 数组内部不能包含重复 URL。
- 当 `coverUrl` 不为 `null` 时，数组不能再次包含 `coverUrl`。
- parser 必须冻结返回数组。
- Source `sample_image_urls` 缺失、为 `null`、不是数组、包含非法 URL、包含重复 URL或包含封面 URL时，Host 必须返回 `CATALOG_PROTOCOL_ERROR`；Host 不能静默补 `[]`。
- `CatalogContext`、`serializeWorkbenchContext()` 和 composer 草稿内容不能增加图片字段。

Client Module 只能在 `item.coverUrl !== null` 时使用 `[item.coverUrl, ...item.sampleImageUrls]` 构造画廊序列。Client Module 不能重新排序、去重或猜测缺失图片。

## 实施步骤

### 阶段 0：批准与 Harness 基线

1. 计划执行者必须等到用户明确批准本计划。
2. 计划执行者必须确认 Harness 原工作区的用户改动没有被覆盖，并确认独立 worktree 只包含本计划文件。
3. 计划执行者必须把 Harness 规划分支更新到批准时的 `main`。如果更新修改本计划列出的 Client、Catalog 或 Source Contract 文件，计划执行者必须先修订计划并报告差异。
4. Harness 不新增依赖；计划执行者不能执行依赖安装命令或修改依赖版本。

### 阶段 1：复核已运行的 Source `v0.84.0` 和 live 合同

计划执行者不得重复部署已经运行的 Source `v0.84.0`。该阶段只复核 Harness 即将消费的数据合同。

计划执行者必须在 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV` 执行以下只读核对：

```sh
git rev-parse HEAD
git rev-parse 'v0.84.0^{}'
git describe --tags --exact-match HEAD
node -p "require('./package.json').version"
npm run prod:status
SOURCE_PID="$(tr -d '[:space:]' < runtime/run/app.pid)"
lsof -a -p "$SOURCE_PID" -d cwd -Fn
```

两个 Git SHA 必须都是 `a3d1a8ceea39edebde0e0b70dbbc07dd31e1b4a4`，tag 必须是 `v0.84.0`，package 版本必须是 `0.84.0`，生产状态必须健康，PID cwd 必须是 Source 生产 checkout。如果任一条件不成立，计划执行者必须停止 Harness 实施并报告现场差异，不能在本计划内修改或回退 Source 生产 checkout。

计划执行者必须使用以下固定 path 集合复核 live Catalog CLI：

```sh
set -euo pipefail
SOURCE_CLI=/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/scripts/imagegen-semantic-query.mjs
SOURCE_PATHS=(
  /internal/semantic/generation-models
  /internal/semantic/loras
  /internal/semantic/works
  /internal/semantic/characters
  /internal/semantic/styles
  /internal/semantic/prompt-terms
  /internal/semantic/artist-prompt-strings
  /internal/semantic/comfyui-templates
)
for SOURCE_PATH in "${SOURCE_PATHS[@]}"; do
  node "$SOURCE_CLI" --port 18093 --path "$SOURCE_PATH" --mode search --query '' --page 1 --page_size 9 |
    jq -e '(.status == "ok") and ((.results | length) > 0) and all(.results[]; has("sample_image_urls") and (.sample_image_urls | type == "array"))'
done
node "$SOURCE_CLI" --port 18093 --path /internal/semantic/loras --mode search --query '' --page 1 --page_size 9 |
  jq -e 'any(.results[]; ((.sample_image_urls | length) > 0) and ((.cover_url // null) as $cover | all(.sample_image_urls[]; . != $cover)))'
node "$SOURCE_CLI" --port 18093 --path /internal/semantic/prompt-terms --mode search --query '' --page 1 --page_size 9 |
  jq -e 'all(.results[]; .sample_image_urls == [])'
```

所有 `jq -e` 命令必须退出 0。计划执行者不得在 Source 生产 checkout 手工编辑任何文件。

### 阶段 2：更新 Harness Source Contract 与 Host adapter

Source `v0.84.0` 完成生产部署和 live 验收后，计划执行者必须修改 Harness 独立 worktree：

- `config/source-contract-v0.84.0.json`
  - 以 `config/source-contract-v0.82.2.json` 为结构基线创建新合同。
  - 把 `$id` 更新为 `harness-comfyui/source-contract-v0.84.0.json`。
  - 把 `sourceReleaseVersion` 固定为 `0.84.0`。
  - 在 `catalog.normalization` 中增加以下结构；该结构记录跨仓库合同，但不替代 Host runtime parser：

```json
{
  "additionalRequiredResultFieldsByOperation": {
    "querySemanticGenerationModelsForSkill": ["sample_image_urls"],
    "querySemanticLorasForSkill": ["sample_image_urls"],
    "querySemanticWorksForSkill": ["sample_image_urls"],
    "querySemanticCharactersForSkill": ["sample_image_urls"],
    "querySemanticStylesForSkill": ["sample_image_urls"],
    "querySemanticPromptTermsForSkill": ["sample_image_urls"],
    "querySemanticArtistPromptStringsForSkill": ["sample_image_urls"],
    "querySemanticComfyuiTemplatesForSkill": ["sample_image_urls"]
  },
  "fieldMappings": {
    "sample_image_urls": {
      "target": "sampleImageUrls",
      "scope": "catalog-item-display",
      "includeInCatalogContext": false
    }
  }
}
```

- `config/base.json`
- `config/schema.ts`
- `scripts/production/contract.mjs`
- `tests/unit/config-loader.test.ts`
- `tests/production/source-production.test.mjs`
  - 把当前 Source 固定版本统一更新为 `0.84.0`。
- 新增 `tests/contract/source-contract.test.ts`
  - 读取 `config/source-contract-v0.84.0.json`。
  - 核对 `$id`、`sourceReleaseVersion`、八个 operation 的附加必填字段、字段映射、展示范围和 `includeInCatalogContext: false`。
  - 核对 base model 与 ComfyUI instance operation 不在附加必填字段映射中。
- `src/catalog/contract.ts`
  - 增加 `CatalogItem.sampleImageUrls`。
  - 复用本机图片 URL parser 验证数组元素。
  - 校验空数组、唯一性和不得包含 `coverUrl`。
- `src/host/catalog/catalog-cli.ts`
  - 增加 `sourceSampleImageUrls()`。
  - 把 Source `sample_image_urls` 映射为 Harness `sampleImageUrls`。
  - 缺失或非法字段必须映射为 `CATALOG_PROTOCOL_ERROR`。

计划执行者必须更新以下 Harness 测试和 fixture：

- `tests/unit/catalog-contract.test.ts`
- `tests/unit/catalog-cli.test.ts`
- `tests/unit/catalog-remote.test.ts`
- `tests/unit/client-plugin.test.ts`
- `tests/unit/workbench-controller.test.ts`

这些测试必须证明合法空数组和合法多图数组可以穿过 CLI adapter、strict Remote 和 Client API；缺失、`null`、非数组、非法远端 URL、重复 URL和重复封面 URL全部失败；`CatalogContext` JSON 不包含 `label`、`subtitle`、`coverUrl` 或 `sampleImageUrls`；strict Remote 拒绝缺少 `sampleImageUrls` 的旧 Host 结果。

### 阶段 3：实现 Client 卡片交互和单一 Modal 画廊

计划执行者必须修改：

- `src/client/workbench/contract.ts`
  - 在 `WORKBENCH_COPY` 中增加图片预览标题、打开预览、上一张、下一张、图片计数和图片加载失败文案。
- `src/client/workbench/native-surfaces.tsx`
  - 增加 `catalog | gallery` 两种内容模式，但继续只渲染一个 primitive `Modal`。
  - 增加当前 `CatalogItem`、图片 URL 数组、当前索引和打开者 HTMLElement ref。
  - 拆分卡片 shell、封面预览按钮和资源选择按钮，不能创建嵌套 Button。
  - 具有封面的卡片使用封面预览按钮；无封面卡片继续显示不可点击的“暂无封面”占位。
  - 资源选择按钮继续使用 `aria-pressed` 和现有 `toggleOption()`；“选择/已选择”文案必须位于资源选择按钮内。
  - 画廊打开时把焦点移动到可聚焦的当前图片区域。
  - 画廊关闭时恢复 Catalog 模式和打开者焦点，不能重置 Catalog 或待确认选择状态。
  - 只在 gallery 模式注册 `keydown` listener；处理 `ArrowLeft` 与 `ArrowRight` 后调用 `preventDefault()`，离开 gallery 模式时移除 listener。
  - 键盘和箭头按钮必须调用同一个非循环索引更新函数。
  - Modal 的 Escape、关闭按钮和 backdrop 在 gallery 模式都只返回 Catalog；用户再次关闭 Catalog 模式时才关闭整个 Catalog Modal。
  - 图片 `onError` 必须显示可见错误，并允许用户继续切换图片。
- `src/client/styles.css`
  - 保持三列、176px 卡片和 104px 封面几何结构。
  - 用 card shell 的结构化选中状态替代旧 Button 的 `[aria-pressed="true"]` 外框选择器。
  - 给封面预览按钮提供明确的 hover、focus-visible 和 cursor 状态。
  - 给画廊增加视口约束；大图使用 `max-width`、`max-height` 与 `object-fit: contain`。
  - 左右箭头必须在图片两侧保持可见，窄窗口不能让图片或按钮溢出 Modal。

画廊不能打开第二个 primitive Modal，不能复制 Harness 内部 attachment lightbox，也不能修改 Harness Core。

### 阶段 4：补齐 Harness 自动化测试

计划执行者必须扩展 `tests/unit/native-surfaces.test.tsx`，覆盖以下分支：

1. 点击有封面的资源卡片封面后打开画廊，并显示封面索引 `1 / N`。
2. 点击封面不会切换资源选择状态。
3. 点击资源选择区域仍切换 `aria-pressed` 和待确认数量。
4. 点击右箭头显示下一张；点击左箭头返回上一张。
5. `ArrowRight` 与 `ArrowLeft` 产生与箭头按钮相同的索引变化。
6. 第 1 张禁用左箭头，最后 1 张禁用右箭头，边界操作不循环。
7. 单图记录同时禁用两个箭头。
8. 无封面卡片没有预览按钮，但仍然可以选择。
9. 图片加载失败显示 `WORKBENCH_COPY` 中的错误文案，随后仍能切换到其他图片。
10. 关闭画廊恢复同一 Catalog 页、筛选条件、搜索结果和待确认选择。
11. 画廊关闭恢复打开者焦点；gallery 卸载后方向键 listener 不再响应。
12. Escape 在 gallery 模式只返回 Catalog，不同时关闭 Catalog Modal。
13. 点击封面不能改变待插入集合；点击记录选择按钮后，确认操作必须把该记录的准确 `CatalogContext` 写入既有插入目标；再次点击记录选择按钮取消选择后，确认操作不能插入该记录。

焦点与键盘测试必须使用现有依赖：

- `react-test-renderer.create()` 通过 `createNodeMock` 为封面预览按钮和 gallery 焦点目标提供不同的 `focus` spy。
- 测试断言打开 gallery 时调用 gallery 目标的 `focus()`，关闭 gallery 时调用原封面预览按钮的 `focus()`。
- 测试使用 `EventTarget` 形式的 document mock 派发 `ArrowLeft` 与 `ArrowRight`，并在 gallery 卸载后证明 listener 已经移除。
- 真实 `document.activeElement` 恢复结果由生产浏览器人工验收。本需求不增加 jsdom、happy-dom 或 `@vitest/browser` 依赖。

Harness 定向验证命令：

```sh
pnpm exec vitest run \
  tests/unit/catalog-contract.test.ts \
  tests/unit/catalog-cli.test.ts \
  tests/unit/catalog-remote.test.ts \
  tests/unit/client-plugin.test.ts \
  tests/unit/workbench-controller.test.ts \
  tests/unit/native-surfaces.test.tsx
pnpm exec vitest run tests/contract/source-contract.test.ts
pnpm quality
```

### 阶段 5：更新 Harness 文档、版本并发布

计划执行者必须把 Harness 版本更新为 `0.30.7`，并更新：

- `package.json`
- `tests/contract/engineering-baseline.test.ts`
- `CONTEXT.md`
- `docs/system/configuration.md`
- `docs/releasenotes.md`
- `README.md`
- `docs/v0.1/source-contract-v0.84.0.md`
- `docs/v0.1/PRDS/README.md`
- `docs/v0.1/PRDS/03-message-context-core.md`
- `docs/v0.1/PRDS/04-single-image-generation.md`
- `docs/v0.1/PRDS/05-full-catalog-context-and-route.md`
- `docs/v0.1/source-data-catalog-implementation.md`
- 新增 `docs/adr/0013-source-contract-v0.84.0.md`。该 ADR 必须声明 `v0.84.0` 取代 ADR 0009 中的当前版本决定，并明确 `sample_image_urls` 的 Source 所有权、`sampleImageUrls` 的 Harness 展示范围和 Source-first 部署顺序。
- `docs/system/releasing.md` 中的本次发布命令和版本号。

`docs/v0.1/source-contract-v0.82.2.md` 与 `config/source-contract-v0.82.2.json` 作为历史版本保留。当前文档入口必须只把 `v0.84.0` 标识为当前合同。独立 Reviewer 必须逐项审查 `rg '0\.82\.2|source-contract-v0\.82\.2'` 的剩余命中，确认每个命中是明确的历史记录，而不是当前性声明。

计划执行者必须让独立 Reviewer 审查所有用户可见文案、Source Contract 文档、ADR、README 和 release notes。Reviewer 必须输出逐项验收清单；计划执行者修正问题后必须让同一 Reviewer 重新验收。

Harness 发布顺序：

1. 执行 `pnpm quality`。
2. 提交并 push 源码、测试、合同与版本变更。
3. 等待 GitHub CI 成功。
4. 完成语义文档审查和修正。
5. 再次执行 `pnpm quality`。
6. 提交并 push 最终文档，等待最终 GitHub CI 成功。
7. 在最终提交 SHA 上创建并 push `v0.30.7` tag。
8. 创建不含附件的 GitHub Release。
9. 从最终发布提交更新 Harness 生产 checkout，保留生产专属配置和运行状态。
10. 执行 `pnpm prod:restart`、`pnpm prod:status` 和 `pnpm prod:health`。
11. 执行“真实界面验收”中的全部步骤。

## 真实界面验收

计划执行者必须在生产 Client Module 中记录资源记录 ID、资源类型、浏览器窗口尺寸和以下结果：

1. 打开中间列“插入上下文”，确认首屏仍为 3×3 资源卡片。
2. 选择一条至少有 2 张图片的 LoRA，点击封面，确认画廊从封面开始。
3. 点击右箭头浏览到最后一张，再点击左箭头返回封面。
4. 使用键盘 `ArrowRight` 与 `ArrowLeft` 重复相同浏览过程。
5. 确认首尾箭头禁用，确认切换不循环。
6. 关闭画廊，确认 Catalog 页码、资源类型、底模、搜索词和已选记录保持不变，并确认焦点返回原封面预览按钮。
7. 点击同一卡片的选择区域，确认选择状态改变；再次点击封面，确认选择状态不改变。
8. 点击确认，核对 composer 草稿新增的是所选记录的准确 `CatalogContext`；取消选择后再次确认，核对被取消的记录没有进入 composer 草稿。
9. 检查单图记录，确认大图可打开且两个箭头禁用。
10. 检查无封面记录，确认“暂无封面”不可打开画廊，但资源卡片仍可选择。
11. 在宽窗口和窄窗口各执行一次多图浏览，确认大图按比例完整显示，箭头、计数和关闭按钮都没有溢出。
12. 使用浏览器 DevTools 的 request blocking 临时阻断当前图片请求，确认错误文案可见且用户仍能切换图片；解除 request blocking 后重新加载页面。该验收不能修改生产数据库、Client 源码或 Source 响应。
13. 确认 composer 草稿中的上下文 JSON 不包含任何图片 URL。

## 验收清单

### Source 前置合同与部署验收

- [x] Source `v0.84.0` 的八个目标 operation 已在 search 和 resolve 结果中投影 `sample_image_urls`。
- [x] Source `v0.84.0` 已实现封面排除、URL 去重、`sort_order, id` 顺序和当前页批量图片查询。
- [x] Source `v0.84.0` OpenAPI 已对八个目标 operation 要求该字段，对 base model 和 ComfyUI instance 不作该要求。
- [x] Source `v0.84.0` 没有修改数据库 Schema、生产媒体文件或 `imagegen-semantic-query` raw-passthrough 实现。
- [x] Source 生产 checkout 已从 `v0.84.0^{}` 的提交 `a3d1a8c` 启动，生产 PID cwd 已核对。
- [x] Source 生产 live CLI 的八个目标 operation 显式返回 `sample_image_urls`，且 generation model 与 LoRA 第一页均存在其他样例图。

### Harness 数据合同验收

- [x] Host 把 `sample_image_urls` 映射为冻结的 `sampleImageUrls`。
- [x] Host 对缺失、非法、重复和包含封面 URL 的图片数组返回 `CATALOG_PROTOCOL_ERROR`。
- [x] strict Remote 要求 `sampleImageUrls`，不能兼容缺少字段的旧 Host。
- [x] `CatalogContext`、composer 草稿和生成提示词不包含图片 URL。
- [x] Harness 的固定 Source 版本、结构化合同、配置 schema、生产合同和测试全部一致为 `0.84.0`。

### Client 验收

- [x] 点击封面打开画廊，点击封面不改变资源选择。
- [x] 资源选择区域继续改变选择状态，并保持 `aria-pressed` 语义。
- [x] 点击确认只插入当前已选记录的准确 `CatalogContext`；封面预览和取消选择不能污染最终插入结果。
- [x] 左右箭头按钮和键盘左右方向键使用同一非循环规则。
- [x] 首图、末图、单图、多图、无封面和图片加载失败分支全部符合本计划。
- [x] gallery 模式与 catalog 模式只使用一个 primitive Modal。
- [x] 关闭 gallery 后保留 Catalog 状态并恢复打开者焦点。
- [ ] 3×3 资源卡片几何结构和窄窗口大图布局通过人工验收。

### 交付验收

- [ ] Harness 生产 checkout 只从最终发布提交更新，没有手工源码修补；Source 生产 checkout 在 Harness 实施前仍保持已核对的 `v0.84.0/a3d1a8c`。
- [ ] Harness 语义文档由独立 Reviewer 给出最终 PASS 和逐项验收清单。
- [ ] Harness `pnpm quality` 与 GitHub CI 在最终发布提交通过。
- [ ] Harness `v0.30.7` tag、GitHub Release、生产状态、生产健康检查和真实界面验收全部通过。

## 非本次目标

- 本次不修改已经发布的 Source `sample_image_urls` 业务代码、OpenAPI、测试、版本文档或 `v0.84.0` tag。
- Source 仓库的代码、测试、CI、发布和部署不属于本计划的实施范围；本计划把 Source `v0.84.0` 作为已经完成并已部署的数据供给合同。
- 本次不修改 3×3 Catalog 的资源类型、搜索、底模筛选、分页数量或多选确认流程。
- 本次不把作品下全部角色图片合并到作品画廊。
- 本次不提供跨记录图片浏览、图片上传、删除、排序或封面选择。
- 本次不增加触摸手势识别、拖拽切图、自动播放、循环切图、缩放、下载按钮或切换动画。“左右滑动”只表示通过左右箭头或键盘左右方向键切换当前图片。
- 本次不修改 Source 数据库 Schema、生产图片文件或媒体 HTTP 路由。
- 本次不修改 `imagegen-semantic-query` CLI 参数、退出码或 raw-passthrough 实现。
- 本次不实现 ADR 0009 描述但当前运行代码尚未执行的 live discovery validator；Host adapter 的业务字段 parser 和固定 Source 版本继续承担本需求的运行门禁。
- 本次不修改 Harness Core，不导入 Harness 内部 attachment lightbox，也不增加第三方 carousel/lightbox 依赖。

## 已获得的授权

- 用户已经授权创建独立 Harness worktree、读取 Harness 与本机 Source 数据合同、只读检查本机生产 Source 响应、编写并修订本实施计划。
- 用户已经告知计划编写者：Source `sample_image_urls` 实现已经完成，数据来自现有 `item_images`，无需数据库迁移。
- 用户已经批准执行本计划，并授权计划执行者修改 Harness 业务代码、测试、版本与发布文档，推送 Harness 远端提交，创建 Harness `v0.30.7` tag 与 GitHub Release，并从最终发布提交更新 Harness 生产 checkout。
- 用户没有授权且本计划不要求修改 Source 业务代码、测试、CI、版本、tag 或生产 checkout。
- 用户补充要求：封面预览不能破坏每条记录原有的选择交互。
