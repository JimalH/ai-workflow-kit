# BASE - simple workflow (lightweight)

## 1. Purpose & Scope
- Lightweight, minimal-safety mode for quick iterations.
- Provides mutable PROJECT.md for current status and append-only Change log with reviewer/verification fields.

## 2. Artifacts
- `PROJECT.md` (mutable, always current).
- `Change log/` (append-only audit). Up to 3 active logs; older ones moved to `Change log/Archived/` (immutable).

## 3. Minimal Safety & Permissions Policy
- Allowed without asking: edit/add code/text/config with minimal diffs; append change logs; update PROJECT.md; run workflow-related scripts/commands that do not modify system settings.
- Must ask before: deleting files, mass rename/move, overwriting platform stubs, installing dependencies, running system-changing commands, handling secrets/tokens, or downloading/cloning from network unless explicitly allowed.

## 4. Change Log Rules
- Structure: active logs live in `Change log/` root (max 3). Archived logs live in `Change log/Archived/` and are immutable.
- When a 4th active log is needed: move the least recently updated active log to `Change log/Archived/`, mark it immutable, then create the new active log.
- Topic routing: choose or create a log by topic; if a topic returns after archival, create a new active log (do not append to archived).
- Append-only: every real edit requires a minimal entry. If a correction is needed, append an Errata entry; never modify prior entries.
- One-run rule: in a single run, append to at most ONE active log (you may choose which active log to target).
- Archived logs: never append once moved.
- User verification: when user says verified/pass, append a single `VERIFIED_BY` line to the active log entry or a follow-up entry.

### Log file header (at top of each ACTIVE log)
TOPIC: <short stable topic>
STATUS: ACTIVE
CREATED_AT: <timestamp>
UPDATED_AT: <timestamp>
REVIEW_STATE: UNREVIEWED | REVIEWED | VERIFIED
REVIEWED_BY: [ ... ]
VERIFIED_BY: [ ... ]

### Entry schema (append-only)
### <timestamp>
EDIT_BY: <model/runner/identity>
FILES: <comma-separated paths>
SUMMARY: <one-line reason/change>
REVIEWED_BY: <identity> — PASS|FAIL   (optional)
VERIFIED_BY: <identity or User> — PASS|FAIL (scope: <optional short>)
REVIEW_NOTES:
- <only if issues/suggestions; required on FAIL>
EVIDENCE:
- <paths/commands/output refs; required on FAIL>

Rules:
- If review/verification PASS with no notes: only the single-line REVIEWED_BY/VERIFIED_BY.
- If FAIL: include REVIEW_NOTES and at least one EVIDENCE line.

## 5. PROJECT.md Rules
- Mutable; always reflects current status.
- Must include at top: `Last updated: <timestamp>` and `Last change log: <filename>` (most recently appended log file).
- Content: short current state; key decisions/assumptions; next steps (optional). Update timestamp on edits.

## 6. Default Reading Policy (no special request)
- Read `PROJECT.md`.
- Identify the most relevant active log by topic; read 1..3 relevant active logs as needed.
- Do not read Archived unless necessary for context.

## 7. Templates
- See header and entry schema above. Create new active log using the header block before first entry.
