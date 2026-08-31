# Source v0.86.1 全部 Workflow 模板验证发现

## 已知事实

- 实例 2 的 `/object_info` 已恢复。
- 模板 39 已使用实时 `/object_info` 编译成功，活动输出节点为 `13`、`40`、`41`、`67`、`68`、`69`、`70`。
- 正式矩阵命令在任何模板编译前调用 `parseParameterSupportBaseline()`。
- 修复前的 Catalog 模板 ID 比仓库参数支持基线多出模板 43。
- 原始红灯为：`baseline=8,...,42, catalog=8,...,42,43`。
- `tests/unit/comfyui-workflow-matrix-script.test.ts` 明确断言参数支持基线必须精确覆盖 Catalog 模板 ID，说明精确 ID 集合门禁是受回归测试保护的设计约束。
- `scripts/verification/comfyui-workflow-matrix.mjs` 在读取 `/object_info` 和逐模板编译之前验证精确 ID 集合；因此该原始失败没有提供模板 43 的真实参数支持证据。
- 正确修复方向是保留精确 ID 集合门禁，并使用正式编译矩阵测得模板 43 的参数支持集合；删除门禁或静默跳过模板 43 会破坏新模板必须显式验收的约束。
- 临时最小基线使正式矩阵完成 19 个模板验证。模板 43 实际支持 `positive_prompt`、`negative_prompt`、`width`、`height`、`seed`、`cfg`、`steps`、`sampler_name`、`scheduler`、`denoise`、`batch_size`。
- 临时矩阵结果为：19/19 组合编译通过，19/19 Official API Workflow 验证通过，18/18 旧模板参数基线通过；唯一失败是模板 43 的临时占位基线与实际支持集合不一致。
- 所有参数探测结果只有 `passed` 或 `not_found`，没有编译错误状态。
- 正式基线写入模板 43 的 11 个实际支持参数后，`pnpm verify:comfyui-workflows -- --instance-id 2` 以退出码 0 完成 19/19 模板验证。

## 待验证问题

1. 完整仓库质量门禁和生产发布验证是否通过？

## 根因假设

| 排名 | 假设 | 可反驳预测 |
|---:|---|---|
| 1 | 参数支持基线缺少新模板 43，精确 ID 集合门禁因此在全部编译前失败。 | 为模板 43加入经过真实编译验证的参数集合后，矩阵会开始逐模板编译。 |
| 2 | 模板 43 本身包含当前 compiler 不支持的参数或节点。 | 绕过 ID 集合门禁单独运行模板 43 矩阵时会返回明确参数或编译错误。 |
| 3 | 实例恢复后的 `/object_info` 与已有模板基线存在新的不一致。 | 模板 43 进入基线后，其他已有模板会在参数或组合编译阶段失败。 |
| 4 | Official API Workflow 浏览器导出或缓存会使部分模板失败。 | 参数和组合编译通过后，`official.status` 会出现失败结果。 |
