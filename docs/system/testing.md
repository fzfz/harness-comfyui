# 测试规范

## 系统验证

源码运行、配置变更和界面联调统一使用生产进程命令：

```sh
pnpm prod:start
pnpm prod:status
pnpm prod:health
pnpm prod:logs
pnpm prod:stop
```

系统没有独立的开发或测试启动命令。生产进程自动化验证使用：

```sh
pnpm prod:test
```

`prod:test` 使用临时目录和端口调用同一套生产进程逻辑，并启动一次真实 DSH Host，验证真实 Client 路由通过 ModuleLoader 注册；该命令不提供独立的开发或测试启动流程。

## 自动化测试

| 命令 | 范围 |
| --- | --- |
| `pnpm test:unit` | Host、Agent、Client、配置和测试辅助模块 |
| `pnpm test:integration` | Host 插件组合与逐媒体同源 HTTP 路由 |
| `pnpm test:contract` | package、Git 跟踪、CI 和安全合同 |
| `pnpm prod:test` | start、stop、restart、status、health、logs、PID、端口和真实 Client ModuleLoader 分支 |
| `pnpm test:prototype` | 静态原型结构与数据关系 |
| `pnpm test:coverage` | unit 与 integration 覆盖率 |
| `pnpm quality` | 依赖检查、类型检查和全部必需测试 |

覆盖率阈值由 `config/quality-gates.json` 唯一定义：lines 91%、functions 100%、statements 88%、branches 79%。

新功能和缺陷修复必须覆盖成功、拒绝、清理和错误分支。语义文档由独立 Reviewer 阅读验收，不使用脚本判断语义质量。

Generation 自动化测试使用 fake Source、fake Comfy transport 与临时 SQLite/文件目录覆盖项目 Tool 注册、实例 ID 安全投影、Run 幂等、状态转换、重启恢复、connected runtime binding、目标冲突、bypass LoRA 激活、序列化值节点、派生分辨率、BOOLEAN widget、临时预览过滤、`extra_data.extra_pnginfo.workflow` 提交、媒体分片、逐媒体 Workflow 和 Client 单一投影。Catalog 自动化测试覆盖 Source v0.84.0 的 `sample_image_urls` 严格映射、非法 URL 拒绝、封面与样例去重、封面预览不改变选择集合、箭头和键盘导航、图片错误状态、焦点恢复、画廊 header/body 高度分配、箭头居中和图片双轴滚动，以及确认后只插入原 `CatalogContext`。真实实例验收使用生产 Source CLI 与 ComfyUI `/object_info`、`/prompt` 和 Jobs API 验证全部数据源模板的声明参数编译、异步运行、媒体保存、Actual/API Workflow 参数一致性、图片内容与尺寸，以及实例错误展示。

## CI

`.github/workflows/ci.yml` 是唯一 GitHub Actions workflow。pull request 和 `main` push 都执行：

1. `pnpm quality:preinstall`
2. `pnpm install --frozen-lockfile`
3. `pnpm quality:fast`

CI 不生成发布包。
