# Source v0.86.1 全部 Workflow 模板验证进度

## 2026-08-31

- 用户明确要求修复当前 Catalog 中的全部 Workflow 模板，不接受只验证模板 39。
- 正式矩阵红灯命令稳定在约 2 秒内返回 Catalog 模板 ID 与参数支持基线不一致错误。
- 本轮开始时 Catalog 已新增模板 43；修复前的仓库基线只包含模板 8 至 42。
- 已确认精确 ID 集合门禁由现有单元测试保护；本次保留该门禁，通过真实矩阵补齐模板 43 的结构化基线。
- 已使用临时最小基线让正式矩阵完成 19 个模板探测；19/19 组合编译和 19/19 Official API Workflow 验证通过。
- 已从正式矩阵报告读取模板 43 的 11 个实际支持参数，并用该集合替换临时占位值。
- 已使用正式基线重跑完整矩阵；当前 Catalog 19/19 模板全部通过参数基线、组合编译和 Official API Workflow 验证，命令退出码为 0。
- 已把产品版本、工程合同、README、发布说明和系统文档更新为 v0.37.5。
- 参数矩阵脚本单元测试与工程基线合同测试共 15 项通过。
- 完整 `pnpm quality` 通过：530 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试通过；覆盖率为 statements 93.15%、branches 86.41%、functions 100%、lines 95.74%；依赖审计为 critical 0、high 0、moderate 0、low 0。
- 为完整 Desktop 门禁停止了 v0.37.4 生产进程；v0.37.5 发布部署完成前保持生产进程停止。
- `$code-review` 的首轮 Standards 轴通过；Spec 轴发现 `CONTEXT.md` 仍声明 v0.37.4，已把 Product Version 与发布后 tag 更新为 v0.37.5。
- 已创建全量模板修复的持久计划、发现记录和进度记录。

## 命令结果

| 命令 | 结果 | 状态 |
|---|---|---|
| `pnpm verify:comfyui-workflows -- --instance-id 2` | 在模板编译前报告基线缺少模板 43 | 红灯 |
| 带模板 43 临时最小基线的完整矩阵 | 19/19 组合编译通过；19/19 Official 验证通过；仅模板 43 占位基线不一致 | 诊断完成 |
| 带模板 43 真实 11 参数基线的完整矩阵 | 19/19 全部通过，退出码 0 | 绿灯 |
| `pnpm exec vitest run tests/unit/comfyui-workflow-matrix-script.test.ts tests/contract/engineering-baseline.test.ts` | 2 个测试文件、15 项测试通过 | 绿灯 |
| `pnpm quality` | 全部仓库门禁通过 | 绿灯 |
