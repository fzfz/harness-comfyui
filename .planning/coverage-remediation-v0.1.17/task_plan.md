# v0.1.17 repository coverage remediation plan

## Goal

在不修改产品代码、coverage 阈值、coverage include/exclude、测试超时或既有断言语义的前提下，通过公开接口测试把当前仓库的全局 coverage 提升到 `config/quality-gates.json` 的 lines 91%、functions 100%、statements 88%、branches 79%。仓库缺少可在 Node coverage 进程内执行真实 React lifecycle 的 renderer，经双轴审查与安全审计后，只允许新增精确 devDependency `react-test-renderer@18.3.1` 及其 pnpm lock 解析；随后从同一精确 main commit 完成 artifact qualification、Release Preview、用户绑定批准、annotated tag 与 GitHub Release `v0.1.17`。

## Fixed point and scope

- 授权点与 review fixed point：`ee05caaeaa26b7c193ae5314910a1eb12c1c210f`。
- Coverage remediation 独立于已关闭 Issue #17；Issue #17 产品行为与验收证据不得修改或重新解释。
- 允许修改 `tests/unit/` 与 `tests/integration/` 中通过公开接口补齐真实行为分支的测试。
- 禁止修改 `src/**`、`config/quality-gates.json`、`vitest.config.ts`、coverage ignore、阈值、测试选择器和 timeout 来制造 PASS。Dependency 唯一例外是 exact devDependency `react-test-renderer@18.3.1` 与该 package 的 pnpm lock entries；不得新增第二个 direct dependency。
- `/Volumes/4Tdisk/work/AI2/deepseek-harness`、数据源仓库与用户环境保持只读；本任务不执行用户环境安装或部署。

## Test strategy

- CI `32665629884` 已证明 boundary、typecheck 和 `240/240` unit/integration PASS；不得在切片开发中重复全量门禁。
- 每个切片先以当前 coverage report 的未覆盖公开行为作为 RED，再只运行该切片的定向测试与定向 coverage probe。
- 已通过的切片测试不得由后续队员重复；主线程按 fixed-point diff 精确派发修复。
- 全部切片合并后只运行一次完整 `test:coverage`；仅当该候选通过才运行一次 GitHub clean CI 和一次 artifact qualification。
- Deploy、composition、E2E、release-smoke 只由最终 qualification 对同一 artifact 各运行一次；不重复 Issue #17 已经通过且未受测试-only diff影响的人工浏览器验收。

## Phases

| Phase | Status | Acceptance |
|---|---|---|
| 1. 恢复现场与固定授权边界 | complete | main/origin、Issue #17、coverage failure、发布 PRD 和 review fixed point 已记录 |
| 2. 建立 remediation worktree 与 coverage inventory | complete | 独立 worktree 基于 `ee05caa`；按模块列出未覆盖公开行为、目标测试文件和互斥所有权 |
| 3. 纵向切片 A：Client plugin lifecycle 与 layout controller | complete | `client-plugin.test.ts` + 新 `layout-contract.test.ts`；19/19 PASS，layout 100%，index lines 96.55% |
| 4. 纵向切片 B：Results/sidebar/theme public UI | complete | 三个既有 UI 测试文件；9/9 PASS，results/theme coverage 提升，未伪造缺少交互 renderer 的 callback 测试 |
| 5. 纵向切片 C：Session/config/tool/entrypoints | complete | 四个互斥测试文件与一个新 entrypoint 测试；51/51 PASS，binding functions 100%、tool lines 100% |
| 6. 主线程 diff review 与精确返修 | complete | 三个首轮 slice 与 residual 均由主线程逐 hunk 接受；residual 8/8 PASS、两个目标源文件 functions 100%，integration HEAD `2c51a02` |
| 7. 双轴独立审查 | complete | Standards final PASS、Spec final PASS；renderer lifecycle、dependency boundary 与 exact engineering contract 均无 finding |
| 8. 最终 coverage 与 clean CI | complete | Candidate `eb9c5c6` 完整 coverage 24/24 files、256/256 tests、四项阈值 PASS；clean main CI 与 qualification run `32683439210` success；候选 commit 为 `ff9aefaa211726fad12dd35436f43313a3f021a4` |
| 9. Artifact qualification 与 Release Preview | complete | qualified artifact 与 Preview 固定同一 manifest identity；Preview run `32684542046` success；release notes、四项 qualification gate、coverage 与 Issue #17 的 verified scope 已纳入发布证据 |
| 10. Release Approval 与发布 | complete | 用户查看 Preview exact identity 后明确批准中间版本发布；annotated tag `v0.1.17` 已推送并精确指向 `ff9aefaa211726fad12dd35436f43313a3f021a4`，GitHub Release 已创建并只附加同一 tarball；未重建、重打包或安装 |

## Error ledger

| Error | Attempt | Resolution |
|---|---:|---|
| CI `32665629884` global coverage below thresholds after 240/240 tests PASS | 1 | 用户已授权独立 repository-wide remediation；保持阈值和产品代码不变，以测试补齐公开行为 |
| 从 main worktree 执行 `git branch -d` 报告 slice branches 未合入 main | 1 | 三个 slice 实际已合入 remediation integration branch；切换到该 worktree 后用普通 `-d` 成功删除，没有使用强制删除 |
| 完整 coverage 第一次启动前 `node_modules/vitest/vitest.mjs` 不存在 | 1 | 没有测试运行；只读审计确认主 `.pnpm` store 完整，仅 5 个 direct dependency symlink 被 Slice A 的失败 `pnpm exec` 重写到已删除 worktree；使用现有 store 精确 relink 后再执行真正的唯一完整 coverage |
| 完整 coverage 进入 Vitest 后 8 个测试文件无法解析 DeepSeek direct dependencies | 1 | 198 个已加载测试 PASS，但 coverage 未生成；确认 pnpm 清理除重写 5 个链接外还移除了其余顶层 direct links。先完成版本/安全审计，再以固定 pnpm 11.7.0 offline+frozen+ignore-scripts 仅重建现有 store 链接 |
| `pnpm install --offline --frozen-lockfile --ignore-scripts` 因 no-TTY 拒绝 purge modules | 1 | 不设置 CI 自动 purge，也不重复命令；先验证现有 `.pnpm` 中每个 exact direct dependency target 的唯一性。全部唯一则机械补链；存在多义则改用隔离临时 `--modules-dir`，不触碰主 modules |
| 完整 coverage 的 functions 为 98.52%，其余三项阈值 PASS | 1 | Coverage map 精确定位 `results-panel.tsx:102` 与 `session-sidebar.tsx:156` 两个未执行回调；只追加对应公共交互测试并跑这两个定向测试/coverage |
| 读取 `coverage/coverage-final.json` 返回 ENOENT | 1 | 当前配置只生成 `coverage-summary.json`；使用已报告的精确 function locations 与源码固定残差，不为获取重复报告重跑 coverage |
| 双轴 review 判定 residual fake `useState` 不属于真实 public React behavior | 1 | 现有 Chrome seam 无法向 Node V8 coverage 回传；经安全审计后只新增 exact `react-test-renderer@18.3.1`，用真实 renderer lifecycle/click/rerender 替换两个 fake |
| Spec 复审发现 engineering baseline exact devDependencies 未含 renderer | 1 | 只在 `tests/contract/engineering-baseline.test.ts` 的唯一 expected devDependencies object 加入 exact `react-test-renderer: 18.3.1`，运行该 focused contract test |

## Final qualification and release boundary

- Phase 8 已完成。clean main CI 与 coverage qualification run `32683439210` 为 `success`；候选 commit 是 `ff9aefaa211726fad12dd35436f43313a3f021a4`。本地最终 coverage 为 24/24 test files、256/256 tests，四项固定阈值全部 PASS。
- qualified artifact `harness-comfyui-0.1.17.tgz` 的 byte length 是 `802398`，SHA-256 是 `c326d60352a50c48f8d180a3da9c3b67ecce5c1cd8c7eccb85a553a3fea1daba`。
- Phase 9 已完成 artifact identity Preview。Preview run `32684542046` 为 `success`，且 Preview 绑定版本 `0.1.17`、commit `ff9aefaa211726fad12dd35436f43313a3f021a4`、qualified artifact filename、byte length 与 SHA-256。
- 用户最新裁决确认：父 Issue #14/#15 的顺序约束适用于最终完整交付，不禁止已验收中间版本发布；用户在查看 Preview exact identity 后明确批准创建 `v0.1.17`。
- Release acceptance 已通过。annotated tag `v0.1.17` 的 tag object 是 `a75e4eba6ad0d3cb0294c6cbdb0e23780f4783d6`，peeled commit 是 `ff9aefaa211726fad12dd35436f43313a3f021a4`；GitHub Release 是 https://github.com/fzfz/harness-comfyui/releases/tag/v0.1.17。
- GitHub Release 的唯一 asset 是 `harness-comfyui-0.1.17.tgz`，大小 `802398` bytes，digest 是 `sha256:c326d60352a50c48f8d180a3da9c3b67ecce5c1cd8c7eccb85a553a3fea1daba`，下载地址是 https://github.com/fzfz/harness-comfyui/releases/download/v0.1.17/harness-comfyui-0.1.17.tgz。
- 本次发布没有重建、重打包或安装；v0.1.17 只声明 Issue #17 verified scope 与 repository-wide coverage remediation，不声明 Issues #4–#13 已由此中间版本实现，也不把这些 Issue 作为本次中间版本发布阻断。
