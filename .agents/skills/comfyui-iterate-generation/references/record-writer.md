# 写入 JSON 记录的入口与输入

记录写入者首次调用前完整读取本文件。脚本为本 Skill 的 `scripts/write-json.mjs`。写入者根据实际 Skill 目录解析脚本路径，并在当前会话的 Workspace 工作目录中调用脚本。

```sh
node "<本Skill目录>/scripts/write-json.mjs" --path "<目标JSON文件路径>" --mode create <<'JSON'
{"example":"替换为本次完整记录"}
JSON
```

命令接受且只接受 `--path` 和 `--mode` 两个选项，每项各出现一次。path 为非空文件路径；相对路径按当前工作目录展开，委派时优先给出完整目标路径。mode 仅为 create 或 replace。标准输入必须是合法 JSON，脚本在写文件前检查 JSON 语法并保留输入格式。

目标路径来自本阶段允许写入的产物路径。写入者先创建父目录，再按 `../assets/record-contract.json` 中对应定义核对记录。脚本不检查业务语义或 JSON Schema。

# 创建、替换与返回结果

create 用于首次保存，排他创建目标；已有文件时报错且不覆盖。replace 用于替换明确归本阶段更新的已有记录；目标缺失时报错，不自动转为创建。不可变请求、原始查询和观察使用新序号及 create。

成功时退出码为 0，stderr 为空，stdout 为单行 JSON，只有 path 属性，值为实际目标绝对路径。成功表示文件写入完成，不表示记录中的业务任务完成。

失败时退出码为 1，stdout 为空，stderr 为单行 JSON，包含字符串 code 和 message。写入者保留真实错误，不将失败记录为已保存。

| code | 修正动作 |
|---|---|
| ARGUMENTS_INVALID | 按本文件修正两个选项和取值 |
| JSON_INPUT_INVALID | 修正标准输入 JSON 语法，再核对业务内容 |
| STDIN_READ_FAILED | 检查本次标准输入的传递方式 |
| PARENT_DIRECTORY_MISSING、PARENT_NOT_DIRECTORY | 检查目标路径，创建所需目录或选择正确的父目录 |
| TARGET_EXISTS | 读取既有记录；独立产物使用新路径，只有明确更新该文件时才改用 replace |
| TARGET_MISSING | 检查目标及恢复状态；首次创建时明确使用 create |
| FILESYSTEM_ERROR、TEMPORARY_FILE_CLEANUP_FAILED、CREATED_FILE_CLEANUP_FAILED、INTERNAL_ERROR | 报告 message，检查实际目标与临时文件状态；原因解决后再写入，不循环原样重试 |

# 更新已有记录中的指定属性

更新记录时，读取已有 JSON，只赋值本次需要改变的属性，再将完整结果传给 replace；保留其余属性。以下示例仅更新 task.json 的 status，执行者将路径和状态替换为本次实际值：

```sh
set -o pipefail
node -e 'const fs=require("node:fs");const task=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));task.status=process.argv[2];process.stdout.write(JSON.stringify(task,null,2)+"\n")' "<任务目录>/task.json" waiting |
  node "<本Skill目录>/scripts/write-json.mjs" --path "<任务目录>/task.json" --mode replace
```

# 写入失败后的恢复

写入失败后，写入者先核对文件实际状态，修正原因后再发起新调用；不得因记录写入失败重复提交生成请求。
