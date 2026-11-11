# Data safety and reuse

This source snapshot uses a neutral name and fictional project examples. Customer identity information, customer files, actual environment files, infrastructure configuration, backups, screenshots, binary assets, installed dependencies, generated output, and original Git history are excluded.

Test-only passwords, hashes, loopback URLs, and negative-test network examples are fixtures, not live credentials. Never reuse them. Pattern scans reduce accidental disclosure risk but are not a security certification.

No real project names, organizations, people, amounts, documents, IDs, contacts, patient records, or operational addresses belong in this repository. Build synthetic scenarios instead of editing production exports. The example JSON is explanatory data, not a database seed.

No open-source license is included. System capabilities documented here are not claims that one person authored every component. Third-party dependencies remain subject to their respective licenses.

## Historical migration identifiers

The historical database migrations remain byte-identical because the schema contract verifies the baseline checksum. A legacy project-code format remains in the baseline. A showcase-only forward migration changes the active constraint to DEMO-* for a fresh fictional database, matching the application and fixtures. This migration has not been executed against a database; it intentionally rejects existing legacy established records.

Use only a new, disposable database and local test storage. Do not point this snapshot at a shared or production service. Historical upgrade-validation scripts are not substitutes for a full migration test: validate-phase2-upgrade.mjs expects an older five-migration subset and is not part of the default test command.