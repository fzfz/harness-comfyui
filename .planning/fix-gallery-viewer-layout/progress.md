# 图片画廊布局缺陷修复进度

## Session：2026-08-27

### Phase 1：建立红色反馈回路

- **Status:** in_progress
- 已创建独立修复分支与持久化计划文件。
- 已确认实际画廊 DOM 类名、Modal class 注入点和现有测试缺少的布局断言。
- 已确认 primitive Modal 的 header 和关闭按钮位于被画廊内容 class 修饰的内容容器内。
- 已读取 primitive Modal 与 Button 的实际 CSS；Button 本身已居中图标，Modal card 会裁剪溢出内容。
- 已新增 `tests/unit/gallery-layout.test.ts`，三个布局测试在 v0.30.7 样式上稳定失败。
- 已完成最小 CSS 修复；布局测试和原有画廊/选择交互测试共 19 项通过。
- 已完成 1280×720 真实浏览器验收；横竖图切换时箭头位置不变，关闭按钮可见，大图提供双轴滚动。
- 已完成 480×420 固定尺寸 iframe 验收；横竖图切换后箭头位置不变，关闭按钮完整可见，双轴溢出成立。
- 已删除临时浏览器夹具；`pnpm quality` 在 v0.30.8 源码提交前完整通过。
- 下一步：提交并 push 源码、测试和版本变更，等待第一轮 GitHub CI。

## 测试结果

| 测试 | 预期 | 结果 | 状态 |
|---|---|---|---|
| `pnpm exec vitest run tests/unit/gallery-layout.test.ts` | 3 个布局测试在修复前失败 | 3 failed | red |
| `pnpm exec vitest run tests/unit/gallery-layout.test.ts tests/unit/native-surfaces.test.tsx` | 布局和选择交互全部通过 | 19 passed | green |
| 浏览器 1280×720 横图/竖图几何测量 | 箭头偏差 ≤1px、关闭按钮在 viewport 内、双轴溢出 | 箭头偏差 0px；关闭按钮在内；双轴溢出成立 | passed |
| 浏览器 480×420 横图/竖图几何测量 | 箭头偏差 ≤1px、关闭按钮在 viewport 内、双轴溢出 | 箭头偏差 0px；关闭按钮在内；双轴溢出成立 | passed |
| `pnpm quality`（源码提交前） | 所有仓库门禁通过 | 324 unit/integration、22 contract/security、14 production、27 prototype；函数覆盖率 100% | passed |

## 错误记录

| 错误 | 尝试 | 处理 |
|---|---:|---|
| worktree 未挂载根仓库 `node_modules`，primitive CSS 相对路径读取失败 | 1 | 后续从根仓库的只读依赖目录检查 primitive CSS；测试前再建立临时依赖符号链接。 |
| 浏览器页面脚本不允许通过 `document.innerHTML` 或 `document.createElement` 动态建立窄 viewport iframe | 2 | 使用本地静态 iframe 夹具完成相同尺寸验收。 |
