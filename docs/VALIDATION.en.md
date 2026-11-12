# Validation record

[中文](VALIDATION.md) | English

[Overview](../README.en.md) · [Reproduction steps and isolated environment setup](LOCAL_VALIDATION.en.md)

## Source checks: 2026-11-12

Environment: Windows, Node.js 24.18.0, pnpm 11.9.0, Prisma 7.8.0, and Next.js 16.3.3 (webpack). The source-check phase reused installed dependencies without reinstalling them or changing application source code.

The following commands ran sequentially from the showcase copy's root, with each exit code checked separately. All returned 0. They used temporary secrets generated in-process and an unreachable loopback database URL, with real S3 tests, database migration tests, and Worker business tasks disabled.

| Check | Result |
| --- | --- |
| `pnpm db:generate` | Prisma client generation passed. |
| `pnpm db:validate` | Schema validation passed. |
| `pnpm typecheck` | Workspace and E2E scenario source type checks passed. |
| `pnpm lint` | 0 errors and 4 known warnings. |
| `pnpm test` | 77 test files passed; 419 tests passed and 2 real S3 tests were skipped. |
| Static checks within the default tests | Schema contract (91 models), data-access boundaries, log redaction, and exclusion of patient-level data all passed. |
| `pnpm build` | Workspace and Next.js production builds passed, retaining 1 category of file-type dynamic-dependency warning. |
| Showcase documentation checks | Relative-link targets, UTF-8 text, fictional JSON, and dependency references passed checks; the diff had no whitespace errors. |

Documentation review also checked role navigation, application states, database constraints, Worker switches and defaults, and the referenced test scenarios. Source references identify implementations; they do not establish runtime acceptance.

## Additional local page checks: 2026-11-12

A separate temporary database was created using the installed PostgreSQL 18, listening only on a high loopback port. It used newly generated demonstration credentials and fictional E2E fixtures. Neither the original project nor an existing business database was connected.

- All 25 migrations applied successfully, including the showcase project-code constraint.
- Fictional accounts and projects were seeded successfully; the screenshot projects are DEMO-901/902.
- PMO login succeeded in Edge on localhost, and the project overview and DEMO-901 execution page were actually opened.
- Both PNG files were inspected from disk. They show the project overview, project details, and lifecycle swimlanes. See the [README](../README.en.md#screenshots) for the images.

This check covered only reading and displaying the pages above. It did not exercise the complete business state transitions or full Playwright E2E. The E2E fixtures used for screenshots and the explanatory example in examples/project-demo.json are separate; both use fictional data.

## Retained warnings

- 4 Next.js internal-navigation warnings: 3 uses of `window.location.assign()` in workflow-completion-panel.tsx and 1 in workflow-progress-panel.tsx.
- The production build reported a dynamic-dependency expression in file-type. The build completed, but this does not guarantee that every runtime file-detection path works.

Application behavior was not changed in this round merely to remove warnings.

## Unverified scope

The following remain unverified:

- Database upgrades against existing business data and the repository database integration suite.
- Full Playwright E2E and multi-role state transitions for applications, reviews, issues, completion, and project closure.
- Actual file uploads/downloads and real object-storage integration.
- SMTP/email-provider delivery. The current Worker wires only the capture test transport.

Default tests exclude the database integration suite. The two skipped S3 cases require an actual test storage service. Passing type checks for E2E source does not mean the Playwright scenarios ran. Build and unit-test results do not establish production readiness, full business acceptance, or security certification.

## Initial sanitization validation: 2026-11-11

During preparation of the first public copy, lockfile-based installation passed with lifecycle scripts disabled and the Prisma client generated separately. That day's type checks, lint, 419 unit tests, and build results matched this round.

The initial publication record also includes renewed hash checks for 379 selected original source/configuration files and byte-for-byte preservation of 24 historical migrations. The showcase copy adds 1 project-code constraint migration, for 25 in total. The original private project was not changed to prepare the public copy. This round reviewed only the current showcase copy and did not revisit the original private project.

## Continuous integration and reproduction

As of 2026-11-12, this repository has no GitHub Actions workflow. The table above records local execution and must not be described as a remote CI pass.

See the reproduction guide linked above for complete commands, environment variables, and further demonstration setup. Database migrations, fixture seeds, S3, and Playwright E2E must use separately prepared, disposable isolated environments, never shared or production resources.
