# 关键设计与代码导读

中文 | [English](ENGINEERING_GUIDE.en.md)

[返回首页](../README.md) · [业务流程](PRODUCT_WALKTHROUGH.md) · [架构](ARCHITECTURE.md) · [验证记录](VALIDATION.md)

下面每一项都给出可打开的实现和测试入口。测试文件代表验证意图；只有[验证记录](VALIDATION.md)明确列出的范围，才是此展示副本已经运行的检查。数据库集成测试与浏览器 E2E 尚未执行。

## 1. 权限不只在按钮上

**问题：** 隐藏按钮不能防止用户直接调用服务端操作。

[AuthorizationService.authorize](../packages/auth/src/authorization-service.ts)依次检查会话、账户状态、当前角色、动作权限、项目范围与上下文条件。角色分配改变后，旧会话不能仅凭过去的页面状态继续获得权限。

[授权测试](../packages/auth/tests/authorization-service.test.ts)覆盖“客户端显示控制按钮时服务端仍拒绝动作”和“先拦截范围外项目”等场景。它不是对全部 API 的独立安全审计。

## 2. 事务、行锁与版本检查各司其职

**问题：** 两位审核者可能同时基于旧页面执行相互冲突的决定。

[申请 Repository](../packages/db/src/project-application-repositories.ts)的 run 使用 Serializable 事务，lockProject 使用 FOR UPDATE，相关锁定函数检查 expectedRowVersion。commandId 用于识别业务命令。

[申请数据库集成测试](../packages/db/tests/integration/project-application-repositories.test.ts)包含并发 PMO 审核只提交一次立项的场景。**这是未运行的集成测试入口，不是已测吞吐或并发保证。**

## 3. 冻结申请，退回后克隆

**问题：** 审核中的材料如果原地变化，就难以解释某次决定依据的是哪个版本。

[申请 Repository](../packages/db/src/project-application-repositories.ts)在提交时设置 FROZEN；executeReturn 和 cloneApplicationSwimlane 创建新可编辑版本，保留旧版本及其结构。数据库迁移还包含冻结内容保护相关约束。

[申请集成测试](../packages/db/tests/integration/project-application-repositories.test.ts)覆盖退回/重提和冻结后子记录写入被拒绝的场景。数据库触发器仍需通过真实隔离库验证。

## 4. 立项是一组关联写入

**问题：** 项目编号、计划、节点、角色和审核结果不能只写成功一部分。

[executeApproval / finalizeReviewAction](../packages/db/src/project-application-repositories.ts)在事务中建立相关记录并写入活动、通知等数据。[集成测试](../packages/db/tests/integration/project-application-repositories.test.ts)包含通知持久化失败后回滚立项写入、负责人资格失效后回滚等场景。

这里的原子性指数据库事务内记录，不包括任意外部服务副作用。

## 5. 泳道是依赖图，而不只是视觉排列

**问题：** 排在左边不一定代表真实前置关系，无效依赖也可能导致流程无法推进。

[validateApplicationSwimlane / hasCycle](../packages/project-application/src/swimlane-policy.ts)检查严格字段形状、引用、唯一 ID、日期、自依赖、重复依赖与环。

[泳道策略测试](../packages/project-application/tests/swimlane-policy.test.ts)覆盖交叉引用错误、非法日期、环、未知字段和运行时枚举注入。此处是结构与业务规则验证，不是自动排程算法。

## 6. 完成审核有业务门槛

**问题：** 单独把状态改成“完成”可能绕过前置事项。

[完成服务](../packages/collaboration/src/workflow-completion-service.ts)与[对应 Repository](../packages/db/src/workflow-completion-repositories.ts)区分申请、补充、审核、问题门槛同步及正式完成撤销。

[完成服务测试](../packages/collaboration/tests/workflow-completion-service.test.ts)覆盖前置节点、问题、必需附件门槛，变更版本检查及 PMO 专属撤销操作。角色和校验逻辑的单测不替代浏览器全流程验证。

## 7. 更正历史保留原始事实

**问题：** 进度被修改后，仍需要知道原记录是什么、为何修正。

[correctProgress / mapProgress](../packages/db/src/workflow-progress-repositories.ts)追加 workflowUpdateCorrection，并用 expectedLatestSequenceNo 检查更正顺序，再计算有效视图。

[进度服务测试](../packages/collaboration/tests/workflow-progress-service.test.ts)覆盖显式清空金额和拒绝无实际变更的更正。准确名称是“追加式更正历史”，不是完整 Event Sourcing 系统。

## 8. 附件授权与内容校验分开

**问题：** 获准上传一个文件，不代表任意文件内容或后续下载都可以信任。

[AttachmentService](../packages/attachments/src/attachment-service.ts)分为 prepareUpload、completeUpload 与 authorizeDownload 等阶段。上传完成时比对元数据、检测类型和服务器哈希；下载时重新调用 Repository 检查当前业务权限。

[附件服务测试](../packages/attachments/tests/attachment-service.test.ts)覆盖检测结果一致后才标记可用、哈希不符时拒绝并删除对象、每次下载都重新授权。这里没有声称病毒扫描、完整 DLP 或合规认证。

## 9. Outbox 明确处理失败

**问题：** 后台任务可能并发、超时或在处理途中退出。

[通知 Worker Repository](../packages/db/src/notification-worker-repositories.ts)的 claim 使用 FOR UPDATE SKIP LOCKED，领取到期 PENDING 或租约过期 PROCESSING 记录。deliver、fail、retryDelayMs 与 createFinalFailureAlerts 管理尝试、退避、最终失败和 PMO 提示。

[Outbox 任务测试](../apps/worker/tests/outbox-delivery-task.test.ts)检查租约参数与有界领取；[capture 传输测试](../apps/worker/tests/capture-email-transport.test.ts)检查不连接外部服务、相同幂等键只保留一条进程内消息。这些测试不覆盖真实数据库上的并发领取与重试持久化。

租约与重试不等于恰好一次投递。当前 [capture 传输](../apps/worker/src/capture-email-transport.ts)只保存进程内测试消息；真实邮件供应商仍需要单独接入和验证。

## 10. 后台循环有界并可停止

**问题：** 后台进程需要控制每批工作量，并响应停止信号。

[OutboxDeliveryTask.run](../apps/worker/src/outbox-delivery-task.ts)默认每批 20 条、租约 60 秒、轮询 10 秒；[任务注册与运行](../apps/worker/src/worker.ts)使用 AbortSignal 协调退出。

[任务测试](../apps/worker/tests/outbox-delivery-task.test.ts)覆盖稳定租约、有界批次和开始关闭后不再领取工作。默认参数只是代码配置，不代表经过生产容量评估。

## 阅读顺序与表述边界

如果只有十分钟，建议先看授权、申请退回克隆、泳道校验和 Outbox；它们分别体现权限、版本、图结构和异步处理。

文档不推断作者个人职责、贡献比例、团队规模、上线效果或性能数字。不把源码存在称为完整交付，不把模型数量称为复杂度成果，也不把单元测试通过称为生产就绪。
