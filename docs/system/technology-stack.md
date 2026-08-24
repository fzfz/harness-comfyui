# 技术栈

| 层 | 技术 | 当前版本或用途 |
| --- | --- | --- |
| 运行时 | Node.js | `.node-version` 固定 `22.19.0`；`package.json` 允许 `^22.19.0` 或 `>=24.0.0` |
| 包管理 | pnpm | `11.7.0` |
| 语言 | TypeScript | `6.0.3`；NodeNext ESM，严格类型检查 |
| 宿主 | DeepSeek Harness | `@deepseek-ai/dsh-*` `0.1.1-rc.2` |
| 插件生命周期 | Cordis | `4.0.1` |
| 持久运行索引 | Node SQLite | Node 内置 `node:sqlite`；SQLite 保存 Run、远端输出和 Media 索引 |
| 配置校验 | Schemastery | `3.18.1` |
| Web UI | React / React DOM | `18.3.1` |
| 自动化测试 | Vitest / V8 coverage | `4.1.8`；阈值来自 `config/quality-gates.json` |
| Client 模块转换 | tsdown | `0.22.2`；`prod:start` 和 `prod:restart` 生成本地浏览器模块，自动化测试验证 ModuleLoader 与 import policy |
| CI | GitHub Actions | 对 pull request 和 `main` push 执行同一套源码质量门禁 |

所有直接依赖在 `package.json` 中使用精确版本，完整解析结果保存在 `pnpm-lock.yaml`。

当前 Node 24.14.0 会为内置 `node:sqlite` 输出 ExperimentalWarning；项目没有为 SQLite 增加第三方依赖。
