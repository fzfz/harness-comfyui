# 版本发布规范

GitHub Release 只发布 Git tag 与 Release 记录，不构建或附加产品包。

发布负责人按以下顺序发布版本：

1. 把根 `package.json.version` 修改为目标 SemVer。
2. 执行 `pnpm quality`。
3. 提交并 push 版本与源码变更。
4. 等待该提交的 GitHub CI 成功。
5. 更新 `README.md`、`docs/releasenotes.md` 和受影响的系统文档。
6. 由独立 Reviewer 出具语义验收结论和问题清单。
7. 发布负责人根据问题清单修正 `README.md`、`docs/releasenotes.md` 和受影响的系统文档，并由独立 Reviewer 重新验收修正后的文档。
8. 再次执行 `pnpm quality`。
9. 提交并 push 文档变更，等待最终提交的 GitHub CI 成功。
10. 记录最终提交的完整 SHA，并确认目标标签和 GitHub Release 都不存在。
11. 在该完整 SHA 上创建并 push 目标 Git tag，再创建 GitHub Release。
12. 核对远端标签指向该完整 SHA，GitHub Release 指向该标签，并确认 Release 没有附件。
13. 生产部署负责人从该最终发布提交更新生产运行目录，保留生产专属配置和运行状态，使用 `pnpm prod:start` 或 `pnpm prod:restart` 启动该发布提交，然后执行 `pnpm prod:status`、`pnpm prod:health` 和真实实例验收。生产部署负责人不得直接编辑生产运行目录中的源码、测试、包元数据或发布文档。

`package.json.version` 是产品版本的唯一结构化来源。Git tag 必须使用 `v` 加完整 `package.json.version` 的形式；因此 `0.30.1` 对应 `v0.30.1`。发布负责人不得更新或删除已经发布的标签；最终提交发生变化时，发布负责人必须使用新的产品版本和标签。

本次发布命令：

```sh
git tag --annotate v0.30.7 <最终提交完整SHA> --message "Harness ComfyUI v0.30.7"
git push origin refs/tags/v0.30.7
gh release create v0.30.7 \
  --verify-tag \
  --title "Harness ComfyUI v0.30.7" \
  --notes-file docs/releasenotes.md
```

发布后必须核对 tag、目标 SHA、Release 标题、说明、URL 和空附件列表。
