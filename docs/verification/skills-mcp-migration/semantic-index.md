---
文档用途: 索引十九份独立语义审计报告及其待处理意见。
读取时机: 维护者评估审计意见并决定修订范围时。
---

# 独立语义审计报告索引

## 审计覆盖与意见状态

1. 十九名干净上下文 Reviewer 分别完成一个目标文件的全文逐行语义审计，共形成十九份报告。
2. 每份报告记录目标行号、判断依据及替换或删除建议。通过行的记录形式由各报告说明。
3. 当前所有修订意见均未实施。各报告中的接口、引用目标和默认行为建议需要维护者结合相应契约核实。

## 报告与需修改项索引

1. [ANIMA Skill](semantic-01-anima-skill.md)：M1、M2 涉及读取顺序和角色名单用途；M3、M5 涉及重复说明；M4 涉及列表格式。
2. [ANIMA 最终自检](semantic-02-anima-final-self-check.md)：第 8、10、11、13—14、16—18 行涉及术语归属、引用和重复标签范围；其余意见涉及文档头、列表和分隔线。
3. [ANIMA 人数与身份](semantic-03-anima-count-identity.md)：M2—M5 涉及执行主体、人数条件和重复定义；M1、M6 涉及文档头和列表。
4. [ANIMA 权重](semantic-04-anima-prompt-weighting.md)：A—I 涉及统计顺序、超限处理、来源权重与槽位约束、定义顺序、重复规则及文档头。
5. [Krea2 Skill](semantic-05-krea2-skill.md)：M6—M9 涉及规则引用、来源和交付主体；M1—M5 涉及列表结构与重复说明。
6. [Krea2 输入契约](semantic-06-krea2-input-contract.md)：M3、M4、M6 涉及术语、查询主体及精确查询与语义查询的区分；M1、M2、M5 涉及结构和重复定义。
7. [WAI Skill](semantic-07-wai-skill.md)：F01、F02 均涉及有序列表格式。
8. [WAI 画师采纳](semantic-08-wai-artist-adoption.md)：F03—F05 涉及章节引用、条件方向及混合来源排序；F01、F02、F06 涉及格式。F05 的排序建议需要维护者确认。
9. [WAI 构图决策](semantic-09-wai-composition-decision-tree.md)：S09-04、S09-06 涉及引用和属性保持与重算的冲突；其余意见涉及结构和重复说明。
10. [WAI 角色](semantic-10-wai-character.md)：第 13、28、35、43—60 行涉及缺少 Prompt 时的处理、作品输入入口及角色标识要求；其余意见涉及格式。
11. [WAI 非画师风格](semantic-11-wai-non-artist-style.md)：第 11—23 行涉及范围及执行主体；其余意见涉及元信息、列表和重复规则。
12. [WAI 槽位顺序](semantic-12-wai-prompt-position-order.md)：第 3、4 项涉及用户画面要求遗漏和被替换颜色重新写入；其余意见涉及定义、引用与重复说明。
13. [生成 CLI](semantic-13-generation-cli.md)：第 4、5、7 项涉及字段归属、路径基准和示例适用条件；其余意见涉及元信息、列表及重复规则。
14. [模板参数检查 CLI](semantic-14-template-parameter-inspection-cli.md)：第 3、5 项涉及路径基准和无效输入处理顺序；其余意见涉及文档头、列表及重复说明。
15. [工作台预设与 Skill 开发](semantic-15-workbench-preset-skill-development.md)：第 8—12 项涉及规范归属、主体、验收入口、审计定位和句式要求；其余意见涉及格式、重复定义及实现复述。
16. [Worktree 开发](semantic-16-worktree-development.md)：第 4、8 项涉及术语、证据读取与配置定位；其余意见涉及格式、重复说明及实现复述。
17. [架构](semantic-17-architecture.md)：第 3、10 项涉及查询入口一致性和术语；其余意见涉及格式、职责与实现复述。第 3 项需要维护者核实接口事实。
18. [配置](semantic-18-configuration.md)：第 2、7 项涉及 Profile 区分及 MCP 配置范围；其余意见涉及格式、章节职责、重复规则及实现复述。
19. [测试](semantic-19-testing.md)：第 2、3、5 项涉及测试入口、配置与夹具职责及验收条件；其余意见涉及文档头和过程记录。
