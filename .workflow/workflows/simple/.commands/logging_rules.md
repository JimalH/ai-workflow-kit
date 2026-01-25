# logging_rules (simple workflow)

## How to pick TOPIC
- Use a short stable label per stream of work (e.g., "spec-updates", "impl-round1", "validation-qa").
- Reuse an existing active log if the topic matches; otherwise create a new active log (respect 3-active limit).

## Append vs create new log
- Append to an existing active log when the topic matches and capacity allows.
- If you need a new topic and there are already 3 active logs, move the least recently updated active log to `Change log/Archived/` (then freeze it) and create the new active log.
- Never append to Archived logs.

## One-run append rule
- In a single run, you may append to at most ONE active log. Choose the best-fit topic.

## Default reading rule
- Read `PROJECT.md` and the most relevant active log(s) (1..3). Do not read Archived unless needed for context.

## Minimal entry requirement
- Any real edit requires an entry in the chosen active log using the schema from BASE (EDIT_BY, FILES, SUMMARY, etc.).
- If review/verification happens, add REVIEWED_BY/VERIFIED_BY lines (PASS/FAIL) and notes/evidence only when issues exist.
- Corrections are added as new entries (Errata) — never edit existing entries.
