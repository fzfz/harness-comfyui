# v0.1.17 repository coverage remediation plan

## Goal

在不修改产品代码、coverage 阈值、coverage include/exclude、测试超时或既有断言语义的前提下，通过公开接口测试把当前仓库的全局 coverage 提升到 `config/quality-gates.json` 的 lines 91%、functions 100%、statements 88%、branches 79%，随后从同一精确 main commit 完成 artifact qualification、Release Preview、用户绑定批准、annotated tag 与 GitHub Release `v0.1.17`。

## Fixed point and scope

- 授权点与 review fixed point：`ee05caaeaa26b7c193ae5314910a1eb12c1c210f`。
- Coverage remediation 独立于已关闭 Issue #17；Issue #17 产品行为与验收证据不得修改或重新解释。
- 允许修改 `tests/unit/` 与 `tests/integration/` 中通过公开接口补齐真实行为分支的测试。
- 禁止修改 `src/**`、`config/quality-gates.json`、`vitest.config.ts`、package dependency、coverage ignore、阈值、测试选择器和 timeout 来制造 PASS。
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
| 3. 纵向切片 A：Client plugin lifecycle 与 layout controller | in_progress | `client-plugin.test.ts` + 新 `layout-contract.test.ts`；公开 rollback/controller 行为与定向 coverage PASS |
| 4. 纵向切片 B：Results/sidebar/theme public UI | in_progress | 三个既有 UI 测试文件；公开 callback/hook wrapper/theme ownership 行为与定向 coverage PASS |
| 5. 纵向切片 C：Session/config/tool/entrypoints | in_progress | 四个互斥测试文件与一个新 entrypoint 测试；公开状态/error/rollback/export 行为与定向 coverage PASS |
| 6. 主线程 diff review 与精确返修 | pending | 每个提交只含被授权测试文件；无生产/阈值/配置变化；diff check PASS |
| 7. 双轴独立审查 | pending | Standards 与授权 Spec 分别审查 `ee05caa...HEAD`；阻断 finding 完成修复 |
| 8. 最终 coverage 与 clean CI | pending | 完整 coverage 四项阈值 PASS；main clean CI PASS |
| 9. Artifact qualification 与 Release Preview | pending | 同一 commit 单次 build/pack；deploy/composition/e2e/release-smoke PASS；Preview 固定 manifest identity |
| 10. Release Approval 与发布 | pending | 用户按 exact identity 批准后创建 annotated tag、推送 tag、创建只附加同一 tarball 的 GitHub Release |

## Error ledger

| Error | Attempt | Resolution |
|---|---:|---|
| CI `32665629884` global coverage below thresholds after 240/240 tests PASS | 1 | 用户已授权独立 repository-wide remediation；保持阈值和产品代码不变，以测试补齐公开行为 |
