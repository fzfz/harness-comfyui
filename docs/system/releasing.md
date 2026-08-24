# 版本发布规范

GitHub Release 只发布 Git tag 与 Release 记录，不构建或附加产品包。

发布负责人按以下顺序发布版本：

1. 把根 `package.json.version` 修改为目标 SemVer。
2. 执行 `pnpm quality`。
3. 提交并 push 版本与源码变更。
4. 等待该提交的 GitHub CI 成功。
5. 更新 `README.md`、`docs/releasenotes.md` 和受影响的系统文档。
6. 由独立 Reviewer 完成语义验收并修正文档。
7. 再次执行 `pnpm quality`。
8. 提交并 push 文档变更，等待最终提交的 GitHub CI 成功。
9. 记录最终提交的完整 SHA，并确认目标标签和 GitHub Release 都不存在。
10. 在该完整 SHA 上创建并 push 目标 Git tag，再创建 GitHub Release。
11. 核对远端标签指向该完整 SHA，GitHub Release 指向该标签，并确认 Release 没有附件。

`package.json.version` 是产品版本的唯一结构化来源。正式版本使用 `x.y.0`，对应 Git tag `vx.y`；因此 `0.2.0` 对应 `v0.2`。发布负责人不得更新或删除已经发布的标签；最终提交发生变化时，发布负责人必须使用新的产品版本和标签。

本次发布命令：

```sh
git tag --annotate v0.2 <最终提交完整SHA> --message "Harness ComfyUI v0.2"
git push origin refs/tags/v0.2
gh release create v0.2 \
  --verify-tag \
  --title "Harness ComfyUI v0.2" \
  --notes-file docs/releasenotes.md
```

发布后必须核对 tag、目标 SHA、Release 标题、说明、URL 和空附件列表。
