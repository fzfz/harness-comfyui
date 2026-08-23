# v0.1.3 发布调查

## 已确认

- 当前分支：`main`；当前 HEAD：`ad08322`；状态显示 `main...origin/main [ahead 42]`。
- 当前工作区存在 44 个 tracked path 变更和 9 个 untracked path，用户已明确要求全部提交。
- `origin` 指向 `https://github.com/fzfz/harness-comfyui.git`；远端已有 `v0.1.0-rc.7`，没有发现 `v0.1.3`。
- `package.json` 当前 version 已改为 `0.1.3`；现有 package script 没有本地创建 Git tag/GitHub Release 的命令。
- `scripts/release/preview.mjs` 要求待预览 commit 已经包含在 `refs/remotes/origin/main`；当前 HEAD 尚未推送到远端。
- PRD 13/14 要求从一次精确 commit 构建并验收同一个 tarball，且 Release Preview 后等待用户明确批准后才创建 tag、推送 tag 和创建 GitHub Release。

## 未决发布门禁

- 用户已确认当前全部工作区变更属于本次 v0.1.3 提交范围。

## 质量门禁结果

- `pnpm run quality:fast`：失败。
- `check:harness-boundary`：通过。
- `tsc --noEmit`：通过。
- `tests/unit` 与 `tests/integration`：208/208 通过。
- 覆盖率：lines 83.55%（要求 91%）、functions 91.89%（要求 100%）、statements 81.69%（要求 88%）。
- 未修改 coverage 阈值，也未把失败测试标记为通过。

## 发布 identity 与证据核对

- `origin/main` 为 `a149cd5cd9809a598235dbcc6f817130e36285c1`；当前 HEAD `ad08322` 不在 `origin/main` 历史中，因此当前 HEAD 不能通过 `release:preview` 的 commit gate。
- `skills/comfyui-generate/`、`skills/anima-prompt-builder/`、`skills/wai-sdxl-prompt-builder/`、`skills/lora-adjustment/` 均不存在。
- `tests/visual/evidence/issue-13/product-acceptance.json` 与 `.release/quality/qualification.json` 均不存在。
- 当前 status 共 53 个变更路径；其中已有 `.planning/`、`findings.md`、`progress.md`、`task_plan.md` 等用户工作文件，不能无范围确认 broad stage。
