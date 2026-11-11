# ResearchFlow

A de-identified source showcase for research-project workflows: applications and reviews, configurable workflow lanes, progress, attachments, issue decisions, completion, notifications, and audit history.

**Fictional project data only.** This is a source showcase, not a hosted demo or a production deployment package. No open-source license is included; public availability does not grant reuse rights beyond applicable platform terms and law.

## Included
- Next.js App Router web application and separate worker.
- TypeScript domain packages for authorization, applications, collaboration, and attachments.
- Prisma/PostgreSQL schema, forward migrations, Repository implementations.
- Unit, database-integration, and Playwright test sources.
- Fictional scenario: examples/project-demo.json.

## Engineering highlights
Server-side role and project-scope authorization; frozen application versions; return-and-clone editing; atomic establishment; dependency/cycle validation; transactions and optimistic concurrency; append-only corrections; private authorized attachments; notification Outbox, worker leases, retries, and audit history.

These are system capabilities, not a claim that one person authored every component.

## Source layout
apps/web: UI and server composition.
apps/worker: reminders, delivery, cleanup, heartbeat.
packages/auth: authentication and authorization.
packages/project-application: application lifecycle.
packages/collaboration: workflows, progress, issues, completion, notifications.
packages/attachments: validation and private storage.
packages/db: schema, migrations, repositories, validation.
e2e: fictional-data browser scenarios.

## Verification
Use Node.js 24 and pnpm pinned in package.json.
Install the pinned dependencies with pnpm install --frozen-lockfile. The validation install disabled lifecycle scripts; Prisma generation was invoked explicitly.
Supply a disposable local database URL, then use pnpm db:generate, pnpm db:validate, pnpm typecheck, pnpm lint, pnpm test, and pnpm build.
See [actual results](docs/VALIDATION.md). Existing test files or historical results do not establish that this candidate passes.

Integration tests, migrations, account bootstrap, browser E2E, and attachment tests can write or delete fixtures. Only use newly approved disposable local resources. Never connect this copy to shared or production systems.

The most complete business flow concerns project office, director, and project lead. Other role definitions do not establish complete delivery. No patient data belongs here.

The published source excludes customer archives, original business documents, real environment files, dumps, production deployment material, screenshots, binaries, installed dependencies, build output, and original Git history.

See [architecture](docs/ARCHITECTURE.md), [data/publication](docs/DATA_AND_PUBLICATION.md), and [fictional walkthrough](examples/README.md).
