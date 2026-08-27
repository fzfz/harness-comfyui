# Harness ComfyUI v0.30.7

v0.30.7 为“插入上下文”资源卡片增加封面与样例图片画廊，并保持每条记录原有的选择、取消选择和确认插入行为。

## 主要变更

- Harness 固定消费 Source Contract v0.84.0。Host 把八个可插入 Catalog operation 的 `sample_image_urls` 严格映射为只读 `CatalogItem.sampleImageUrls`，并拒绝缺失字段、非法本机图片 URL、重复 URL 和重复封面 URL。
- 资源卡片使用同级的封面预览按钮与记录选择按钮。点击封面只打开图片画廊，不改变待确认选择集合；选择按钮继续维护 `aria-pressed`、待确认数量和最终插入的 `CatalogContext`。
- 图片画廊在原 Catalog `Modal` 内显示封面和 Source 排序后的样例图。用户可以点击左右箭头或按键盘 `ArrowLeft`、`ArrowRight` 非循环切换图片；画廊显示当前序号，在首图、末图和单图状态禁用相应箭头。
- 关闭画廊会恢复资源类型、底模筛选、搜索词、页码和待确认选择，并把焦点还给原封面预览按钮。图片加载失败时，画廊保留关闭与切图操作并显示明确错误。
- 画廊继续使用 v0.30.6 的 Session 导航存储。打开或关闭画廊不会覆盖该 Session 已保存的底模、资源种类、搜索输入、已提交搜索词和页码。
- `coverUrl` 与 `sampleImageUrls` 只属于 Client 展示投影，不进入 `CatalogContext`、composer 草稿、`generation-context.v1` 或生成提示词。

## 验证

- Catalog 合同、CLI、Remote 和 Client 定向回归覆盖八个 operation、URL 拒绝分支、预览与选择隔离、准确 `CatalogContext` 插入、按钮与键盘切图、边界禁用、图片错误、焦点恢复、单图和无封面记录。
- 完整 `pnpm quality` 已通过：321 项 unit/integration、22 项 contract/security、14 项 production 和 27 项 prototype 测试全部通过；函数覆盖率为 100%。
- 本版本只发布 Git tag 与 GitHub Release 记录，不附加产品包。
