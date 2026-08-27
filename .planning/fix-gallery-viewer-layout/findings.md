# 图片画廊布局缺陷调研记录

## 用户报告

- 左右箭头图标没有稳定居中，会在按钮中上下变化。
- 右上角关闭按钮有时可见、有时不可见。
- 图片无法查看全貌，查看区域缺少水平和垂直滚动条。

## 已知边界

- 修复对象是 `src/client/workbench/native-surfaces.tsx` 与 `src/client/styles.css` 中的单一 Modal 画廊模式。
- `src/client/workbench/contract.ts` 继续提供画廊文案唯一来源。
- `tests/unit/native-surfaces.test.tsx` 已覆盖预览与选择隔离、按钮和键盘切图、图片错误、焦点恢复及 Session 切换。
- Source `sample_image_urls` 数据合同不属于本次缺陷。

## 调研发现

- 当前画廊 DOM 由 `.harness-comfyui-gallery-stage`、两个 `.harness-comfyui-gallery-arrow` Button 和中间 `.harness-comfyui-gallery-current` 组成。
- 当前 Modal 根元素和内容元素分别追加 `.harness-comfyui-gallery-modal` 与 `.harness-comfyui-gallery-modal-content`；关闭按钮由 primitive Modal 渲染，不在 `native-surfaces.tsx` 中直接定位。
- 当前功能测试覆盖事件和状态，但没有验证箭头几何中心、关闭按钮 viewport 可见性或双轴 overflow。
- primitive Modal 把标题和关闭按钮渲染在内容容器内部；`.harness-comfyui-gallery-modal-content` 因此同时控制 header、关闭按钮和画廊 body 的裁剪边界。
- primitive Modal 的关闭按钮不是 `native-surfaces.tsx` 自己渲染的元素，修复必须保留 primitive Modal 的 `onClose` 与无障碍标签。
- primitive `.dialog` 使用 `overflow: hidden`，`.content` 包含 header 与 body；因此画廊内容区域如果超出 `.dialog` 的有效高度，关闭按钮所在 header 也可能被整体尺寸约束影响。
- primitive Button 已使用 `inline-flex`、`align-items: center` 和 `justify-content: center`；箭头漂移更可能来自画廊 stage/body 高度在不同图片比例下变化，而不是按钮图标缺少 flex 居中。
- 当前仓库没有浏览器端端到端测试依赖；红色反馈回路应使用现有 Vitest 对画廊 CSS 不变量做精确断言，并另用本地浏览器夹具检查真实几何与滚动行为。

## 原因假设

1. `.harness-comfyui-gallery-modal-content` 的 body 没有占用 header 剩余高度，图片固有尺寸会改变 stage 的有效高度并使箭头纵向位置变化。
2. primitive Modal 的 header 与会膨胀的 body 位于同一裁剪容器，较矮 viewport 下 body 会影响关闭按钮的可见区域。
3. `.harness-comfyui-gallery-current` 的 `overflow: hidden` 和图片的双轴 `max-*: 100%` 共同禁止了自然尺寸浏览与滚动条。
4. 箭头 SVG 的行盒基线可能产生亚像素视觉偏移；primitive Button 已完成 flex 居中，因此该假设的优先级低于 stage 尺寸变化。

## 修复后浏览器测量

- 1280×720 viewport 中，横图和竖图切换前后的两个箭头按钮中心 Y 均为 375px，箭头 SVG 与按钮中心的 X/Y 偏差均为 0px。
- 1280×720 viewport 中，关闭按钮矩形为 left 1078px、top 90px、right 1106px、bottom 118px，完整位于 viewport 内。
- 横图查看区域为 795×433px，滚动范围为 2400×1600px；竖图滚动范围为 1600×2400px。两个场景均同时产生水平和垂直溢出。
- 浏览器截图显示关闭按钮、两个箭头和双轴滚动条均可见，图片保持固有尺寸。
- 480×420 iframe viewport 中，横图和竖图切换前后的箭头按钮中心 Y 均为 225px，箭头 SVG 中心偏差为 0px；关闭按钮矩形 right 441px、bottom 108px，完整位于 viewport 内。
- 480×420 viewport 的图片查看区域为 265×153px；横图滚动范围为 2400×1600px，竖图滚动范围为 1600×2400px。
