# Local validation guide

[中文](LOCAL_VALIDATION.md) | English

[Overview](../README.en.md) · [Recorded results](VALIDATION.en.md)

Distinguish two goals first:

1. **Check that the source can generate types, pass tests, and build.** This does not require a real business database or an external email service.
2. **Run a complete multi-role demonstration.** This requires a separately prepared, isolated PostgreSQL database, object storage, and fictional accounts. Completed local page checks are documented in the validation record; the full multi-role end-to-end workflow has not yet been validated.

## Environment

- Node.js 24; the repository declares >=24 <25.
- pnpm 11.9.0, pinned in package.json.
- Run commands from the repository root.
- Do not reuse the original system's .env, accounts, object storage, or database.

Installing dependencies accesses package registries. This example uses the lockfile and disables lifecycle scripts, then generates the Prisma client explicitly:

```powershell
pnpm install --frozen-lockfile --ignore-scripts
```

## Source checks without connecting to real services

The PowerShell example below sets only the current terminal environment and does not write credential files. The database URL points to a non-working loopback port solely to satisfy Prisma configuration parsing; it is not a prepared database.

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

Check the exit status of every command. A successful final command does not establish that all earlier steps succeeded. The database package's default tests exclude tests/integration, and the two real S3 tests are skipped when their switch is off.

These commands do not start the Web or Worker services. Database configuration validation, Prisma client generation, and a production build do not establish that migrations have been applied or business workflows have run.

## Preparation checklist for a complete demonstration

The following is a checklist for further environment preparation, **not a verified one-command startup procedure**:

- Create a disposable local PostgreSQL database and a dedicated schema.
- Supply newly generated local credentials according to [.env.example](../.env.example). Keep real service addresses and customer information out of the repository.
- Review and apply the complete migration set to a fresh isolated database. There are currently 25 migrations, including the showcase project-code constraint.
- Create fictional accounts, roles, and baseline configuration. Existing seed scripts have different prerequisites and are not interchangeable.
- For an attachment demonstration, create a private test bucket and configure S3-compatible storage separately.
- Validate applications, returns, project establishment, progress, issues, and closure through the Web paths for all three roles.
- If enabling the Worker, understand that capture transport does not send real email. Cleanup and notification tasks require `ATTACHMENT_CLEANUP_ENABLED=1` and `NOTIFICATION_WORKER_ENABLED=1` respectively. A database heartbeat is registered only when at least one of these database tasks is enabled and `WORKER_HEARTBEAT_ENABLED=0` is not set.
- Check the database, schema, and object-storage targets of cleanup/reset scripts to ensure they affect only disposable data.

Do not import [project-demo.json](../examples/project-demo.json) directly into a database. It is explanatory material and does not satisfy all relational and account requirements for a Prisma seed.

## Entry points that are easy to misuse

- db:migrate and db:deploy change the database and are not part of source-only checks.
- Database integration, S3, and Playwright scenarios may create, clean up, or delete test data.
- seed-project-application-e2e.ts requires specific isolated database names and a schema. Do not remove its safeguards and run it against an ordinary database.
- validate-phase2-upgrade.mjs targets an older five-migration subset. It is not an acceptance script for the full current migration set.
- Password and secret placeholders in .env.example must not be used for actual login or deployment.

See the [validation record](VALIDATION.en.md) for the versions used, passed checks, and retained warnings. There is no hosted demonstration URL or public test account.
