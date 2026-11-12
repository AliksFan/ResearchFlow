# 本地验证指南

[返回首页](../README.md) · [已记录结果](VALIDATION.md)

先区分两个目标：

1. **检查源码能否生成类型、通过测试并构建。** 不需要真实业务数据库或外部邮件服务。
2. **运行完整多角色演示。** 需要另外准备隔离 PostgreSQL、对象存储和虚构账户。已完成的本地页面检查见验证记录，完整多角色端到端流程仍未验收。

## 环境

- Node.js 24，仓库声明为 >=24 <25。
- package.json 锁定的 pnpm 11.9.0。
- 从仓库根目录执行命令。
- 不要复用原系统的 .env、账户、对象存储或数据库。

依赖安装会访问软件包仓库。示例使用锁文件和禁用生命周期脚本的安装方式，随后显式生成 Prisma client：

```powershell
pnpm install --frozen-lockfile --ignore-scripts
```

## 不连接真实服务的源码检查

下面是 PowerShell 示例，只设置当前终端环境，不写入凭证文件。数据库 URL 指向 loopback 的非工作端口，仅满足 Prisma 配置解析；它不是已准备好的数据库。

```powershell
$env:DATABASE_URL = 'postgresql://demo_user:unused@127.0.0.1:1/researchflow_demo?schema=portfolio_demo'
$env:NEXTAUTH_URL = 'https://localhost:3443'
$env:NEXTAUTH_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$env:AUTH_HMAC_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:RF_ATTACHMENT_S3_TEST = '0'
$env:RF_SCHEMA_TEST_DATABASE = '0'
$env:ATTACHMENT_CLEANUP_ENABLED = '0'
$env:NOTIFICATION_WORKER_ENABLED = '0'
$env:NOTIFICATION_TRANSPORT = 'capture'

pnpm db:generate
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

每条命令都应检查退出状态；不要把最后一条成功当作前面所有步骤成功。默认数据库包测试排除了 tests/integration，两个真实 S3 测试在开关关闭时跳过。

这些命令不会启动 Web/Worker 服务。数据库配置校验、Prisma client 生成和生产构建，都不等于数据库已经迁移或业务已经运行。

## 完整演示的准备清单

以下是后续环境准备清单，**不是已验证的一键启动方案**：

- 新建可随时丢弃的本地 PostgreSQL 数据库与专用 schema。
- 根据 [.env.example](../.env.example)提供新生成的本地凭证；保持真实服务地址与客户信息不进入仓库。
- 对全新隔离库审阅并应用完整迁移集。当前有 25 条迁移，包括展示版编号约束。
- 创建虚构账户、角色和基础配置。现有 seed 脚本各有前提，不能任意交换使用。
- 如需附件演示，另建私有测试 bucket 并配置 S3-compatible 存储。
- 通过 Web 的三角色路径验证申请、退回、立项、进度、问题与结项。
- 若启用 Worker，理解 capture 传输不会发送真实邮件。清理和通知任务分别要求 `ATTACHMENT_CLEANUP_ENABLED=1`、`NOTIFICATION_WORKER_ENABLED=1`；至少启用其中一项数据库任务且未设置 `WORKER_HEARTBEAT_ENABLED=0` 时，才会注册数据库心跳。
- 检查清理/重置脚本的数据库、schema 和对象存储目标，确认仅涉及可丢弃数据。

不要直接把 [project-demo.json](../examples/project-demo.json)导入数据库。它是讲解材料，不满足 Prisma seed 的全部关系和账户要求。

## 容易误用的入口

- db:migrate / db:deploy 会改变数据库，不属于纯源码检查。
- 数据库集成、S3 和 Playwright 场景可能创建、清理或删除测试数据。
- seed-project-application-e2e.ts 要求特定隔离库命名和 schema，不能把限制去掉后对普通数据库执行。
- validate-phase2-upgrade.mjs 面向旧的五迁移子集，不是完整当前迁移集的验收脚本。
- .env.example 中的密码、密钥占位符不能用于实际登录或部署。

本次实测使用的版本、通过项与保留警告见[验证记录](VALIDATION.md)。没有托管演示地址，也没有公开测试账号。
