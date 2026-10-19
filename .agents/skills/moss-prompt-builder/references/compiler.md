---
文档用途: 说明 MOSS-Image 提示词编译器的调用、输入输出和错误处理。
读取时机: 首次编译 Caption 或 Layout 草稿前。
---
# Prompt compiler

## Invocation

1. From the directory containing `SKILL.md`, run `python3 scripts/compile_prompt.py --help` before the first compilation.
2. Compile one draft per invocation.

## Input and output

1. The required positional argument `draft` is a file path or `-`. A file contains UTF-8 JSON; `-` reads the JSON from stdin. Use the Caption draft defined in [SKILL.md](../SKILL.md#caption) or the Layout draft defined in [layout.md](layout.md).
2. The optional `--output` argument is the prompt file path. Omit it to write `prompt.txt` in a newly created temporary directory. Relative paths resolve from the command's working directory. Keep the output separate from the draft.
3. On success, the compiler exits with code `0` and writes the absolute output path to stdout. Read that file for the prompt. Caption output is plain text; Layout output is compact JSON as described in [SKILL.md](../SKILL.md#compile-and-deliver).
4. Repeating a command with the same `--output` replaces that result file. Omitting `--output` creates a separate result for each invocation. Give concurrent invocations distinct explicit output paths or omit the option.

## Command examples

1. Compile a saved draft to a chosen result file:

   ```bash
   python3 scripts/compile_prompt.py draft.json --output prompt.txt
   ```

2. Read a draft through stdin and let the compiler choose the result path:

   ```bash
   cat draft.json | python3 scripts/compile_prompt.py -
   ```

## Errors and retries

1. A nonzero exit code means compilation failed. Read stderr for the invalid field, command argument or filesystem error and the corresponding correction.
2. For invalid JSON or draft fields, correct the named input and retry. For file errors, correct the path or permissions and retry. When the output path equals the draft path, choose a separate result path.
3. After a failed write, rerun the command successfully before using the output file. After success, reuse the result until the draft changes.
