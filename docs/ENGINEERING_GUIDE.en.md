# Key design decisions and code guide

[中文](ENGINEERING_GUIDE.md) | English

[Overview](../README.en.md) · [Product walkthrough](PRODUCT_WALKTHROUGH.en.md) · [Architecture](ARCHITECTURE.en.md) · [Validation record](VALIDATION.en.md)

Each section links to implementation and test entry points. Test files show what the tests are intended to verify; only the scope explicitly listed in the [validation record](VALIDATION.en.md) has been checked in this showcase copy. Database integration tests and browser E2E have not been run.

## 1. Authorization goes beyond buttons

**Problem:** Hiding a button does not prevent a user from calling a server-side action directly.

[AuthorizationService.authorize](../packages/auth/src/authorization-service.ts) checks the session, account status, active role, action permission, project scope, and contextual conditions in sequence. After role assignments change, an old session cannot retain access merely because an earlier page state allowed it.

[Authorization tests](../packages/auth/tests/authorization-service.test.ts) cover cases such as the server rejecting an action even when the client displays its control, and rejecting out-of-scope projects first. They are not an independent security audit of every API.

## 2. Transactions, row locks, and version checks have distinct roles

**Problem:** Two reviewers may make conflicting decisions at the same time based on stale pages.

In the [application repository](../packages/db/src/project-application-repositories.ts), run uses a Serializable transaction, lockProject uses FOR UPDATE, and the relevant locking functions check expectedRowVersion. commandId identifies business commands.

The [application database integration tests](../packages/db/tests/integration/project-application-repositories.test.ts) include a scenario in which concurrent PMO reviews commit project establishment only once. **This is a link to an unrun integration test, not a measured throughput or concurrency guarantee.**

## 3. Freeze submissions and clone them when returned

**Problem:** If material under review changes in place, it becomes difficult to identify the version on which a decision was based.

The [application repository](../packages/db/src/project-application-repositories.ts) sets FROZEN on submission. executeReturn and cloneApplicationSwimlane create a new editable version while preserving the previous version and its structure. Database migrations also include constraints that protect frozen content.

The [application integration tests](../packages/db/tests/integration/project-application-repositories.test.ts) cover returning and resubmitting applications, and rejecting writes to child records after freezing. Database triggers still require verification against an actual isolated database.

## 4. Project establishment is a set of related writes

**Problem:** The project code, plan, nodes, roles, and review outcome must not be only partially saved.

[executeApproval / finalizeReviewAction](../packages/db/src/project-application-repositories.ts) creates the related records and writes activities, notifications, and other data within a transaction. The [integration tests](../packages/db/tests/integration/project-application-repositories.test.ts) include rollback when notification persistence fails or the project lead is no longer eligible.

Atomicity here refers to records within the database transaction. It does not include arbitrary side effects in external services.

## 5. Swimlanes are a dependency graph, not just a visual layout

**Problem:** A node appearing on the left is not necessarily a prerequisite. Invalid dependencies can also prevent the workflow from progressing.

[validateApplicationSwimlane / hasCycle](../packages/project-application/src/swimlane-policy.ts) checks strict field shapes, references, unique IDs, dates, self-dependencies, duplicate dependencies, and cycles.

[Swimlane policy tests](../packages/project-application/tests/swimlane-policy.test.ts) cover invalid cross-references, invalid dates, cycles, unknown fields, and runtime enum injection. This validates structure and business rules; it is not an automatic scheduling algorithm.

## 6. Completion review enforces business prerequisites

**Problem:** Simply changing a status to complete could bypass prerequisites.

The [completion service](../packages/collaboration/src/workflow-completion-service.ts) and [its repository](../packages/db/src/workflow-completion-repositories.ts) distinguish requests, supplementary information, reviews, synchronization of issue-related gates, and revocation of formal completion.

[Completion service tests](../packages/collaboration/tests/workflow-completion-service.test.ts) cover prerequisite nodes, issues, required attachments, change-version checks, and PMO-only revocation. Unit tests of roles and validation logic do not replace full browser workflow validation.

## 7. Correction history preserves the original facts

**Problem:** After progress is corrected, the original record and the reason for the correction still need to be available.

[correctProgress / mapProgress](../packages/db/src/workflow-progress-repositories.ts) appends workflowUpdateCorrection records, checks the correction sequence with expectedLatestSequenceNo, and then computes the effective view.

[Progress service tests](../packages/collaboration/tests/workflow-progress-service.test.ts) cover explicitly clearing an amount and rejecting corrections that make no actual change. The precise description is append-only correction history, not a complete Event Sourcing system.

## 8. Attachment authorization is separate from content validation

**Problem:** Permission to upload a file does not make arbitrary file contents or subsequent downloads trustworthy.

[AttachmentService](../packages/attachments/src/attachment-service.ts) separates prepareUpload, completeUpload, and authorizeDownload. Upload completion compares metadata, detected file type, and the server-computed hash. Downloads call the repository again to check current business permissions.

[Attachment service tests](../packages/attachments/tests/attachment-service.test.ts) cover marking files available only after detection results match, rejecting and deleting objects with a hash mismatch, and reauthorizing every download. No virus scanning, full DLP, or compliance certification is claimed.

## 9. The Outbox handles failure explicitly

**Problem:** Background jobs can run concurrently, time out, or exit during processing.

The claim method in the [notification worker repository](../packages/db/src/notification-worker-repositories.ts) uses FOR UPDATE SKIP LOCKED to claim due PENDING records or PROCESSING records with expired leases. deliver, fail, retryDelayMs, and createFinalFailureAlerts manage attempts, backoff, final failure, and PMO alerts.

[Outbox task tests](../apps/worker/tests/outbox-delivery-task.test.ts) check lease parameters and bounded claiming. [Capture transport tests](../apps/worker/tests/capture-email-transport.test.ts) check that no external service is contacted and that the same idempotency key retains only one in-process message. These tests do not cover concurrent claiming or retry persistence in a real database.

Leases and retries do not imply exactly-once delivery. The current [capture transport](../apps/worker/src/capture-email-transport.ts) stores only in-process test messages. A real email provider still needs separate integration and verification.

## 10. Background loops are bounded and stoppable

**Problem:** Background processes need to limit each batch of work and respond to shutdown signals.

[OutboxDeliveryTask.run](../apps/worker/src/outbox-delivery-task.ts) defaults to batches of 20, a 60-second lease, and 10-second polling. [Task registration and execution](../apps/worker/src/worker.ts) uses AbortSignal to coordinate shutdown.

[Task tests](../apps/worker/tests/outbox-delivery-task.test.ts) cover stable leases, bounded batches, and no further claims once shutdown begins. These defaults are code settings, not evidence of production capacity testing.

## Suggested reading order and limits on claims

With only ten minutes, start with authorization, cloning returned applications, swimlane validation, and the Outbox. They illustrate permissions, versioning, graph structures, and asynchronous processing respectively.

This documentation does not infer the author's personal responsibilities, share of contributions, team size, production outcomes, or performance figures. The presence of source code is not complete delivery, model counts are not proof of engineering achievement, and passing unit tests is not production readiness.
