# v0.2 调研发现

## 用户要求

- 发布流程改为：修改版本、提交、push、CI/CD 通过、修改 README 与 release notes、发布 GitHub Release tag。
- 删除原 release 打包流程。
- 删除 deploy 流程文档、逻辑、测试和现有 deploy 包。
- 在 `docs/` 编写简洁的技术栈、系统架构、目录结构、配置、测试、版本发布和系统启动规范。
- 重写 README，并在 AGENTS.md 引用规范文档。
- 文档必须经过独立语义审核。
- 发布 `v0.2`。

## 审计发现

- 当前分支是 `main`，HEAD 与 `origin/main` 同步；工作区包含尚未提交的源码 production 实现和用户现有未跟踪资料。
- `package.json` 当前版本是 `0.1.17`，`bin.harness-comfyui` 指向 `scripts/deploy/cli.mjs`。
- 旧发布打包 scripts 包含 `package:*`、`release:*`、`quality:artifact`、`test:deploy`、`test:release-smoke`、`test:build-artifacts` 和 `test:packed-runtime`。
- 旧 deploy package 位于 `.release/quality/artifact.json` 与 `.release/quality/harness-comfyui-0.1.17.tgz`；runtime package 位于 `deployment/runtime/`。
- 旧 deploy/release 代码位于 `scripts/deploy/`、`scripts/release/`；测试位于 `tests/deploy/`、`tests/release-package/`，并扩散到 composition、e2e、release-smoke、security 和 unit 测试。
- `.github/workflows/deploy.yml` 是 artifact qualification workflow；`.github/workflows/release.yml` 消费 qualification artifact；`.github/workflows/ci.yml` 在 main push 后按路径分类调用 deploy workflow。
- 当前源码 production 仍从 `scripts/deploy/` 导入进程生命周期、健康检查、配置适配和 Agent Preset 运行时函数；删除 deploy 目录前必须把源码运行所需最小逻辑迁移到中性源码运行模块。
- `package.json.files`、`.npmignore`、CI 分类逻辑、质量门禁与多个测试仍引用 deployment runtime、release artifact 和 deploy CLI。

## 技术决策

| 决策 | 原因 |
| --- | --- |
| `package.json.version` 使用 `0.2.0`，tag 使用 `v0.2` | package 版本必须符合 SemVer；tag 精确遵守用户指定名称。 |

## 删除清单

- `.release/`
- `deployment/`
- `scripts/deploy/`
- `scripts/release/`
- `tests/deploy/`
- `tests/release-package/`
- `.github/workflows/deploy.yml`
- 仅服务于 artifact qualification、release preview、release smoke、artifact composition/e2e 的代码、测试和文档；最终清单待完成引用审计。

## 保留清单

- `scripts/production/` 与 `pnpm prod:*` 六个源码进程命令。
- `scripts/profile/` 中源码运行需要的 profile 启动能力。
- `src/`、`config/`、`profiles/`、`skills/`、`agent-presets/` 和当前产品测试。
- `.github/workflows/ci.yml`，但删除 artifact qualification 调用，只保留源码质量门禁。
- `.github/workflows/release.yml` 可删除；GitHub Release 改由经过 CI/CD 的手工 `gh release create` 流程执行。

## 依赖审计结论

- `scripts/production/cli.mjs` 和 `scripts/production/runtime.mjs` 仍直接导入 `scripts/deploy/` 的合同校验、进程状态、端口管理、日志、健康检查和 product-agent 配置逻辑。
- 删除 `scripts/deploy/` 前，必须把源码运行需要的职责迁入 `scripts/production/`，并删除 active release、installation、artifact、upgrade、rollback 分支。
- `.github/workflows/deploy.yml` 和 `.github/workflows/release.yml` 都以 `.tgz` artifact 为中心；删除这两个 workflow，并把 `.github/workflows/ci.yml` 收敛为源码质量检查。
- `deployment/runtime/`、`scripts/release/`、artifact qualification 脚本及相关 deploy/release/composition/e2e/release-smoke 测试都属于旧链路。
- `package.json` 应删除 `bin`、package allowlist、`package:*`、`release:*`、`deploy:*`、artifact 测试脚本，只保留源码开发、源码生产和源码质量命令。
- `tests/contract/engineering-baseline.test.ts`、`tests/unit/quality-gates.test.ts`、`tests/contract/workflows.test.ts` 与部分 security 测试固定断言旧 artifact 合同，必须同步改写或删除。
- `docs/operations/install-and-run.md`、`docs/operations/test-gates.md`、旧 release artifact ADR/PRD 描述的是待删除系统，不能继续作为当前规范。

## 源码生产迁移设计

- `scripts/production/contract.mjs` 负责唯一的源码运行合同校验，字段使用 `runtimeId` 和 `runtimeRoot`，不保留 installation 命名适配。
- `scripts/production/process.mjs` 负责 operation 记录、PID 身份、端口所有权、Host 环境、start/stop/status/logs；该模块只接受源码 runtime。
- `scripts/production/product-agent.mjs` 负责读取 `config/product-agent.json`、复制 Agent Preset 文件、写入 dsh settings 并验证源码运行目录。
- `scripts/production/health.mjs` 负责源码 Host、Agent Preset、ComfyUI 实例和目录健康检查。
- `scripts/production/cli.mjs` 直接使用以上 production 模块，删除 evidence 字段替换和 installation 适配层。
- 现有 production 测试覆盖配置读取顺序、环境覆盖、启动、状态、健康、日志、重启、停止、PID 身份和端口所有权；迁移时保留这些分支，并把测试内部的 `context.installation` 改为 `context.runtime`。
- 源码启动只要求根目录 `node_modules/.bin/dsh`、当前源码、运行配置和外部 Catalog/Source CLI 可读；不需要 pack、artifact install 或 upgrade。

## 删除后的质量门禁

- `scripts/security/check-manifest-lock.mjs`、`audit-lockfile.mjs`、`check-build-scripts.mjs` 当前重复检查根 workspace 与 `deployment/runtime/`；删除 runtime package 后只检查根 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` 和 dependency security policy。
- `config/quality-gates.json` 与 `scripts/ci/quality-policy.mjs` 的 qualification 段只服务 artifact qualification；删除该段，只保留 coverage 配置。
- `tests/contract/workflows.test.ts` 应重写为单一 `ci.yml` 源码质量 workflow 合同。
- `tests/contract/engineering-baseline.test.ts` 保留依赖、导出、开发和源码生产命令合同，删除 package allowlist、deploy 命令和 artifact 顺序合同。
- `tests/security/*` 保留根依赖安全测试，删除 `deployment/runtime/` fixture 与 runtime drift 分支。
- composition 和 browser e2e 中只有明确依赖 release artifact/runtime package 的测试属于删除范围；当前源码组合与 UI 行为测试继续保留。
