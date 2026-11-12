# Explain ResearchFlow with a fictional project

[中文](README.md) · English

[Home](../README.en.md) · [Full product walkthrough](../docs/PRODUCT_WALKTHROUGH.en.md) · [Design evidence](../docs/ENGINEERING_GUIDE.en.md)

This example supports code reading, interview explanations, or preparation for a recorded demo. All names and roles are fictional. It is not a database seed, a screenshot of a running system, or a record of real project experience.

## Scenario

[project-demo.json](project-demo.json) defines an illustrative project:

- Project: Fictional Research Workflow Demo
- Code: DEMO-001
- Organization: Example Research Centre
- Roles: Project lead, project management office (PMO), manager
- Simplified nodes: Prepare plan → Record progress → Review completion

IDs in the JSON are readable labels, not valid login users or a complete set of database foreign keys. DEMO-001 illustrates a code assigned after project establishment; it does not imply that a draft already has an official project code.

## Five-minute walkthrough

| Step | What to explain | Evidence to open |
| --- | --- | --- |
| 1. Identify the roles | Different roles can perform different actions on the same project | [Workspace navigation](../apps/web/src/components/workspace/workspace-navigation.ts), [authorization service](../packages/auth/src/authorization-service.ts) |
| 2. Submit an application | Submission by the project lead freezes a version, giving reviewers a fixed set of content | [Application repository](../packages/db/src/project-application-repositories.ts) |
| 3. Return for revision | Keep the original submission and clone a new version; explain how versions relate to review feedback | executeReturn / cloneApplicationSwimlane in the same file |
| 4. Advance nodes | Validate the dependency graph and handle progress separately from formal completion | [Swimlane policy](../packages/project-application/src/swimlane-policy.ts), [completion service](../packages/collaboration/src/workflow-completion-service.ts) |
| 5. Handle issues | The PMO coordinates issues, escalating when needed and tracking implementation | [Issue service](../packages/collaboration/src/issue-service.ts) |
| 6. Close and trace | Project closure, archiving, and the associated activity and audit records | [Closure service](../packages/collaboration/src/project-closure-service.ts), [schema](../packages/db/prisma/schema.prisma) |

For a code-only presentation, follow this table without suggesting that the entire system has been started.

## Three design choices worth explaining

1. **Why not edit the original application?** A frozen version gives the review a fixed subject. A new version after return for revision preserves the changes.
2. **Why does recording progress not mean completion?** Completion also depends on approval, prerequisite nodes, issues, and required attachments.
3. **Why use an Outbox for notifications?** Business records and background processing have separate responsibilities. Claims, leases, and retries track processing state; they do not guarantee exactly-once email delivery.

## Screenshots of actual pages

The [README screenshots](../README.en.md#screenshots) show the project overview and execution swimlanes running in an isolated local environment, using DEMO-901/902 from fictional E2E fixtures. DEMO-001 on this page is a separate explanatory example, not the database seed used for those screenshots.

Before taking future screenshots or recordings, complete the [isolated environment preparation](../docs/LOCAL_VALIDATION.en.md) and check that pages, accounts, attachments, and logs contain no real business data. See the [validation record](../docs/VALIDATION.en.md) for what was actually checked.

## Describing project experience

This material can explain how the system is implemented. A source snapshot cannot establish who independently built which parts. Personal responsibilities, team roles, usage scale, production outcomes, and performance metrics require separate factual records.
