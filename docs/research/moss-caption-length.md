---
文档用途: 说明 MOSS 中文提示词长度实验对项目 Skill 写作规则的影响。
读取时机: 核对中文 Caption 的扩写依据或判断字数要求归属时。
---

# MOSS 中文提示词长度调研

## 1. 500 字以上的描述仍然有效

1. 作者为 6 个生活场景各写了 6 档中文提示词。每一档保留前一档的全文，再增加画面细节。同一场景固定随机种子，使用 8 个采样步和 CFG 3，输出尺寸为 1088 × 1936 像素。[作者的视频简介](https://www.bilibili.com/video/BV1YisB6bEST/) · [用户提供的实验记录](</Volumes/4Tdisk/work/AI2/视频转写/MOSS 中文提示词长度实验.md>)
2. 在书店场景中，作者在约 500 字时写清了人物姿态、光线和镜头效果。继续扩写后，样图中的布纹、环境反光和桌面纹理仍有变化。[样图对照记录](</Volumes/4Tdisk/work/AI2/视频转写/MOSS 中文提示词长度实验.md>)
3. 作者按相邻两档计算像素差，再对 6 个场景取平均值。从 500 到 1000 字、1000 到 1500 字、1500 到 2500 字，均值分别为 43.2、34.0、29.1。后几档的变化幅度逐渐减小。[作者的对照图表](https://www.bilibili.com/video/BV1YisB6bEST/?t=170)

## 2. 项目目前如何处理篇幅

1. 项目初版 `19abbfd` 和本次核对的版本 `cf53159` 都要求按画面需求决定详略，两版都没有规定 Caption 的字数。当前版本默认使用英文描述，用户可以指定其他语言。正文要求极简场景保持简洁、复杂场景补充可见细节，缺少给中文长 Caption 的具体写作指引。[项目 Skill](../../.agents/skills/moss-prompt-builder/SKILL.md)
2. 当前 Skill 目录包含正文、入口配置、编译脚本及其测试，目录中没有 `references/`。入口配置引导用户选择 Caption 或 Layout。Layout 一节提到的文字长度用于判断图中文字能否放进指定区域。[入口配置](../../.agents/skills/moss-prompt-builder/agents/openai.yaml) · [Layout 写作要求](../../.agents/skills/moss-prompt-builder/SKILL.md#layout)
3. CLI 帮助要求 Caption 为非空文本。脚本读取草稿后直接返回 Caption 正文，现有测试核对原文与换行。测试中另有一处 8192 字符的断言，检查对象是命令行帮助的输出。[编译脚本](../../.agents/skills/moss-prompt-builder/scripts/compile_prompt.py) · [编译器测试](../../.agents/skills/moss-prompt-builder/scripts/test_compile_prompt.py)
4. 本次用 50、200、500、1000、1500 和 2500 个字符的合成中文文本调用编译器。各档结果均逐字保留输入，文件末尾各有一个换行符。这个结果验证了从草稿到提示词文件的文本传递。

## 3. 建议修改的位置

1. 建议只修改项目 Skill 正文的 `Caption` 一节。OpenMOSS 写作指南也要求按画面需要补充可见细节。项目正文可以在此基础上明确中文长 Caption 的扩写内容和收笔条件。[OpenMOSS 写作指南](https://github.com/OpenMOSS/MOSS-Image/blob/main/skills/moss-image-prompt-enhancer/SKILL.md#develop-the-image) · [升级计划](../plans/moss-caption-length.md)
