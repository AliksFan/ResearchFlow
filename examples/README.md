# 用一个虚构项目讲解 ResearchFlow

[返回首页](../README.md) · [完整业务流程](../docs/PRODUCT_WALKTHROUGH.md) · [设计证据](../docs/ENGINEERING_GUIDE.md)

这里的案例用于阅读代码、面试讲解或录制演示前的准备。所有名称和角色都是虚构的；它不是数据库 seed、运行截图或真实项目经历。

## 场景

[project-demo.json](project-demo.json)定义了一个示意项目：

- 项目：Fictional Research Workflow Demo
- 编号：DEMO-001
- 机构：Example Research Centre
- 角色：项目负责人、项目办公室、管理者
- 简化节点：准备计划 → 记录进度 → 审核完成

JSON 中的 ID 是便于阅读的标签，不是有效登录用户或完整数据库外键。DEMO-001 表示立项后的示意编号，不意味着草稿阶段已经分配正式编号。

## 五分钟讲解路线

| 顺序 | 讲什么 | 可以打开的证据 |
| --- | --- | --- |
| 1. 明确角色 | 同一项目在不同角色下可执行的动作不同 | [工作台导航](../apps/web/src/components/workspace/workspace-navigation.ts)、[授权服务](../packages/auth/src/authorization-service.ts) |
| 2. 提交申请 | 负责人提交后冻结版本，审核针对确定的内容 | [申请 Repository](../packages/db/src/project-application-repositories.ts) |
| 3. 退回修改 | 保留原提交，再克隆新版本；展示版本与审核意见的关系 | 同文件中的 executeReturn / cloneApplicationSwimlane |
| 4. 推进节点 | 依赖图校验，进度和正式完成分开处理 | [泳道策略](../packages/project-application/src/swimlane-policy.ts)、[完成服务](../packages/collaboration/src/workflow-completion-service.ts) |
| 5. 处理异常 | 问题由 PMO 协调，必要时升级并跟踪实施 | [问题服务](../packages/collaboration/src/issue-service.ts) |
| 6. 结束与追溯 | 结项、归档，以及附带的活动和审计记录 | [结项服务](../packages/collaboration/src/project-closure-service.ts)、[schema](../packages/db/prisma/schema.prisma) |

如果目前只讲代码，可以沿这张表阅读，不必假装已经启动了整套系统。

## 值得解释的三个取舍

1. **为什么不是直接改原申请？** 冻结版本让审核对象明确，退回后通过新版本保留差异。
2. **为什么“填了进度”不等于完成？** 完成还受审批、前置节点、问题和附件要求约束。
3. **为什么通知需要 Outbox？** 业务记录与后台处理职责分开，通过领取、租约和重试追踪处理状态；这并不等于邮件恰好投递一次。

## 实际页面截图

[README 的页面预览](../README.md#页面预览)来自独立本地环境中实际运行的项目总览和执行泳道，使用虚构 E2E fixture 的 DEMO-901/902。本页 DEMO-001 是另外一份讲解示例，不是截图的数据库 seed。

后续截图或录屏也应先完成[隔离环境准备](../docs/LOCAL_VALIDATION.md)，并检查页面、账户、附件和日志没有真实业务资料。实际检查范围见[验证记录](../docs/VALIDATION.md)。

## 如何描述项目经历

这里可以说明“系统怎样实现”，不能据代码快照推断“谁独立完成了什么”。个人职责、团队分工、使用规模、上线结果和性能指标，需要另由真实记录支持。
