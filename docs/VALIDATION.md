# Validation results

Verified on 2026-11-11 on Windows with Node.js 24.18.0 and pnpm 11.9.0.

| Check | Result |
| --- | --- |
| Frozen-lockfile dependency install | Passed. Lifecycle scripts disabled; Prisma generation invoked explicitly. |
| Prisma client generation | Passed (7.8.0). |
| Prisma schema validation | Passed. |
| Workspace and E2E source type checks | Passed. |
| ESLint | Passed with 0 errors and 4 warnings. |
| Default test command | 419 passed, 2 skipped, across 77 test files. |
| Workspace build / Next.js production build | Passed (Next.js 16.3.3, webpack). |
| Schema contract | Passed; 91 models. |
| Repository boundary, log-redaction, patient-data-ban checks | Passed. |

## Warnings retained
- Four Next.js navigation warnings: three in workflow-completion-panel.tsx and one in workflow-progress-panel.tsx use window.location.assign for internal navigation.
- The production bundle reports a dynamic-dependency warning from file-type. The build completes, but this warning is not a guarantee that every runtime file-inspection path works.

## What was not verified
No database was created or connected. Validation used a nonconnecting loopback database URL and fictional process-only secrets. No database migrations, repository integration tests, browser E2E scenarios, live login flow, SMTP delivery, or real file uploads were executed. The two skipped tests require an actual S3-compatible test service.

The new DEMO project-code migration was reviewed statically, not executed. Build success and unit tests do not establish complete business acceptance, production readiness, or security certification.

The original 379 selected source/config files were rehashed after preparation; none changed. The historical 24 migrations retain their original bytes. This source snapshot adds one showcase-only migration, for 25 total.

## Repeating checks
Use the pinned package manager. After installing dependencies and supplying a disposable local DATABASE_URL for Prisma configuration, run:

    pnpm db:generate
    pnpm db:validate
    pnpm typecheck
    pnpm lint
    pnpm test
    pnpm build

Default tests exclude database integration suites. Database migrations, fixture seeds, S3 integration, and Playwright E2E require a separately provisioned disposable local environment. Never use shared or production resources.