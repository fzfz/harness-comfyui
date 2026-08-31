# Source v0.86.1 全部 Workflow 模板验证修复计划

## 必须要实现的目标

- 计划执行者必须让当前 Catalog 中的全部 Workflow 模板进入 `pnpm verify:comfyui-workflows` 的参数、组合编译和 Official API Workflow 验证阶段。
- 计划执行者必须使用实例 2 的实时 `/object_info` 验证全部模板，不得只验证模板 39。
- 计划执行者必须修复全量矩阵暴露的 Source v0.86.1 TemplateBundle、Workflow compiler 或参数支持基线问题。
- 如果仓库产生发布后源码修改，计划执行者必须使用新版本 `v0.37.5`，等待 GitHub CI，发布并重新部署生产 checkout。

## 验收清单

- [x] `pnpm verify:comfyui-workflows -- --instance-id 2` 不再因 Catalog 模板 ID 与参数支持基线不一致而在编译前停止。
- [x] 当前 Catalog 返回的每个 Workflow 模板都有一项矩阵结果。
- [x] 当前 Catalog 全部 Workflow 模板的 Source bundle 读取、参数分支、组合编译与 Official API Workflow 验证通过。
- [ ] 完整质量门禁、独立审查与 GitHub CI 通过。
- [ ] v0.37.5 发布并部署生产 checkout。

## 非本次目标

- 本次不提交 D01–D12 批量 Generation Request。
- 本次不猜测模板 43 支持的参数，不为矩阵失败添加静默跳过或兼容降级。
- 本次不修改 Source 仓库、Source 数据库或 ComfyUI 实例配置。

## 已获得的授权

- 用户明确要求修复全部 Workflow 模板问题，并否定只验证模板 39 的范围判断。
- 用户此前已授权在独立 worktree 中修改、测试、提交、推送、发布补丁版本和部署生产 checkout。
- v0.37.4 已发布且 tag 不可移动；仓库发布规范要求后续修改使用 v0.37.5。

## 当前阶段

阶段 3：使用真实基线重跑全量矩阵并完成发布验证。

## 阶段

### 阶段 1：反馈环与根因确认

- [x] 使用正式矩阵命令稳定复现“Catalog 模板 43 不在基线，全部模板编译被阻断”。
- [x] 把失败最小化到参数支持基线与 Catalog ID 集合比较。
- [x] 验证模板 43 的真实参数支持和编译行为。

### 阶段 2：测试先行修复

- [x] 确认现有精确 ID 集合单元测试已经捕获 Catalog 新模板未验收问题。
- [x] 把模板 43 的真实参数支持集合写入矩阵基线，使当前 Catalog 全部模板进入编译。
- [x] 确认矩阵没有暴露其他模板编译或 Official API Workflow 问题。

### 阶段 3：全量验证与发布

- [x] 全量 Workflow 矩阵通过。
- [ ] 完整质量门禁与独立审查通过。
- [ ] 提交、推送并等待 GitHub CI。
- [ ] 发布和部署 v0.37.5。

## 错误记录

| 错误 | 次数 | 处理结果 |
|---|---:|---|
| v0.37.4 收尾时把模板 43 的基线漂移错误判断为范围外限制 | 1 | 用户明确纠正范围；本轮以当前 Catalog 全部模板通过为验收目标。 |
