# Architecture
Request flow: page/endpoint → input validation → session and authorization → domain service → Repository → Prisma/PostgreSQL.
Domain policies and interfaces are separated from web protocols and persistence. Repositories own scope filtering, transactions, concurrency, and audit writes.
The worker uses durable Outbox/reminder leases and bounded retries. Attachments require parent-business authorization against private object storage. Messages do not grant access.
The schema separates people and roles; applications and frozen versions; workflow templates and project plans; progress/corrections; issue decisions; completion/archives; attachments; delivery attempts; dictionaries; and audit records.
Static inventory: 91 model declarations, 25 migration directories (24 preserved historical migrations and 1 showcase adaptation). Counts are not quality or performance claims.
Project-level fictional data only. No patients, subjects, medical records, CRF/EDC data, or production exports.
