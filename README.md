# AI Workflow Kit

This kit packages a reusable workflow system (workflows, roles, chat protocol, and loader) that any AI/agent can bootstrap. All kit content lives under `./.workflow/` to keep the repo root clean.

## Two-Layer Entry Model
- `.workflow/AI_LOADER.md`: **short bootstrap loader** (self-bootstrap when `.workflow/workflows/` / `.workflow/roles/` are missing; maintains platform stubs via marker block)
- `.workflow/AI_WORKFLOW_BASE.md`: **long-form base rules** (bootstrap sequence, SSOT discipline, skills & permissions policy baseline)

### Platform entry stubs (keep short)
- Codex: `AGENTS.md`
- Claude Code: `.claude/CLAUDE.md`
- Antigravity/Gemini: `.agent/rules/GEMINI.md`

All stubs must contain (or be updated in-place by) the marker block:
```md
<!-- BEGIN AI_WORKFLOW_LOADER_BLOCK -->
You MUST read and follow ./.workflow/AI_LOADER.md before doing any work.
<!-- END AI_WORKFLOW_LOADER_BLOCK -->
```

### Pinning
Prefer pinning bootstrap to a tag (e.g., `v0.1.0`) instead of `main` for stability.

### Session Watcher
- Tool: `.workflow/tools/session_watcher.py` (mtime-only; may emit false positives).
- Workflows should ship `.commands/session_watch.md` and `.commands/session_watchlist.txt` to define what paths are polled.
- Natural language: "session watch 30min" ? `--duration 1800`; "session mode 1h" ? `--duration 3600`; "session watch forever" ? `--forever`.

### None mode
- Set `ACTIVE_WORKFLOW.txt` to `none` to disable workflow SSOT/promptbook rules and keep only minimal safety. Roles are optional unless explicitly assigned. The minimal policy lives at `.workflow/workflows/none/BASE.md`.

### Simple workflow
- Lightweight alternative: mutable `PROJECT.md` for current status plus `Change log/` with reviewer/verification fields.
- Up to 3 ACTIVE change logs; when adding a 4th, move the least-recently-updated ACTIVE log to `Change log/Archived/` (immutable).
- Append-only; one run may append to at most one active log. Entries record EDIT_BY, FILES, SUMMARY, optional REVIEWED_BY/VERIFIED_BY (PASS/FAIL), notes/evidence only when issues exist; user verification can be a single VERIFIED_BY line.
- Default reading: `PROJECT.md` and relevant active logs (avoid Archived unless needed).

### Consultant overlay & Consult Gate
- Consultant is a chat-only role (never writes promptbook) that provides domain sanity checks and can alert/block any role.
- CHAT_PROTOCOL adds CONSULT_REQUEST / CONSULT_RESPONSE / CONSULT_ALERT / CONSULT_BLOCKER with required fields.
- Workflows should define a Consult Gate in BASE (MUST/SHOULD triggers, pass condition OK_TO_PROCEED yes or explicit user override) and allow Implementer/Specifier/Validator to initiate consults.
- CONSULT_DOMAIN field selects the domain profile (prefer names matching `roles/consultants/<domain>.md`, allow `none` or free-form with stated fallback); consultants must ask if missing.
- Example domain templates live in `roles/consultants/` (biologist, trade_expert); consult how-to in `.commands/consult.md`.


## Using in a New Repo
1) Copy the `.workflow/` directory into the target repo root (contains loader, base rules, workflows, and roles).
2) Ensure the platform stubs exist and include the marker block unchanged:
   - `AGENTS.md`
   - `.claude/CLAUDE.md`
   - `.agent/rules/GEMINI.md`
3) Pick a workflow slug from `.workflow/workflows/` and write it to `.workflow/workflows/ACTIVE_WORKFLOW.txt`.
4) Follow `.workflow/workflows/CHAT_PROTOCOL.md` and the chosen workflow's `BASE.md` for roles, SSOT, skills policy, and permissions policy.
5) Add chat initiation rules to both the workflow `BASE.md` (workflow-level MUST triggers; non-mandatory cases may be left to AI judgment) and each role manual (role-level MUST triggers).
6) Provide session watcher docs & watchlist for the workflow under `.commands/`.

## Workflows Location
- Workflows live under `.workflow/workflows/<slug>/` (with `BASE.md` and promptbook assets).
- The active workflow slug is stored in `.workflow/workflows/ACTIVE_WORKFLOW.txt`.
- The chat transport rules live in `.workflow/workflows/CHAT_PROTOCOL.md`.

## Versioning & Maintenance
- Tags: semver-style starting at `v0.1.0`; downstreams should pin to a tag for stability.
- Backward compatibility: keep `.workflow/AI_LOADER.md` stable; if paths or behaviors must change, document migrations in `CHANGELOG.md`.
- Updating downstreams: pull the new tag, recopy `.workflow/`, refresh stubs via the marker block, and confirm `ACTIVE_WORKFLOW.txt`.

## Repository Info
- Kit source: https://github.com/JimalH/ai-workflow-kit (public)
- Recommended bootstrap ref: latest tag (e.g., `v0.1.0`) instead of `main`.

