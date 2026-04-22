
# Project AI Rules (Tool-Agnostic)

Version: v1.4
Last Updated: 2026-04-22

## 0) Default

- Read this file first. If uncertain, ask; do not guess.
- Goal: safe, reversible changes with full traceability.
- Prompt echo (default): for every new request from chat, restate the user's prompt once in 1-2 lines before planning or execution.

## 1) Safety (Hard Rules)

- Secrets/Sensitive: never request, print, or store API keys/tokens/passwords/private keys/certs, personal data, or business secrets. If encountered, stop and alert the user.
- High-risk operations: do not perform mass delete/overwrite, history rewrite, permission sweeps, running unknown scripts, or touching production. If truly needed: explain risk + get explicit user approval.
- Compliance: no unauthorized access, auth bypass, malware/backdoors, covert data exfiltration.

## 2) Conda / Environment (Hard Rules)

- Each project must use a dedicated conda env (project isolation).
- Never install packages in `base` (conda/pip both forbidden).
- Any dependency change must:
  - happen in the project env; and
  - be recorded in `<PROJECT_ROOT>/.memory/CHANGELOG.md` (env name + add/upgrade/remove list).

## 3) Change Logging (Single Project Log File)

- Use one project changelog file only: `<PROJECT_ROOT>/.memory/CHANGELOG.md`.
- All change records go to this file (code/docs/config/memory/rules updates).
- Update policy: newest entry first (prepend below header).
- Validation: reviewers may read only header + first entry.

### `CHANGELOG.md` format

- Stable short header. Entry boundary uses `---`.
- Read/write changelog files in UTF-8. Prefer UTF-8 without BOM.
- Entry template:

---

Time: <YYYY-MM-DD HH:MM +/-TZ>
AI: <Claude|Codex|Antigravity|Other>   # if multiple, comma-separate
Request: <1-2 lines>
Tags: `<tag1>`, `<tag2>`, `<tag3>`   # 3-6 tags; at least 2 low-frequency tags (module/file/error/feature)
Actions:

- <1-3 bullets>
  Files:
- `<path>` - `<key change>`
  Checks: <what was verified / None>
  Memory: <PROJECT_MEMORY updated / reviewed-no-change / N/A>
  Risk: <Low/Med/High + brief reason or N/A>

---

## 4) ROS File Change Log (Only when using ROS for execution/validation)

- If implementation or validation is explicitly based on a user-provided ROS file:
  - still update `<PROJECT_ROOT>/.memory/CHANGELOG.md`, AND
  - also update that ROS file's internal change log.
- ROS change log rule:
  - Keep `## Change Log` at the end of the ROS file.
  - Insert new log entries at the top of that section (newest-first).

## 5) Project Memory (File-based, MUST be at Project Root)

> Purpose: cross-AI durable context. Memory is always in the project root so any tool/AI can find it.

### 5.1 Define Project Root (must be determinable)

Project Root is the directory that satisfies the first applicable rule:

1) the nearest parent directory containing `.git/`; else
2) the directory containing this rules file (or `CLAUDE.md` / `AGENTS.md` / `AI_RULES.md`).
   If Project Root cannot be determined reliably: ask the user before writing memory.

### 5.2 Memory Location (Hard Rule)

- Memory directory is **always**: `<PROJECT_ROOT>/.memory/`
- Never create `.memory/` in subdirectories.
- All tools/agents must read/write the same root `.memory/` only.
- Read/write memory files in UTF-8. Prefer UTF-8 without BOM.

### 5.3 Memory Files

- `<PROJECT_ROOT>/.memory/PROJECT_MEMORY.md`
  - Long-term memory (stable facts/decisions/conventions/common commands/preferences).
  - "Latest truth wins": overwriting/rewriting allowed to keep it clean and non-contradictory.
- `<PROJECT_ROOT>/.memory/CHANGELOG.md`
  - Unified working memory + change log (append by prepending newest entry).
  - No daily memory files.

### 5.4 Read Rules (start of work)

- Read `<PROJECT_ROOT>/.memory/PROJECT_MEMORY.md` first if it exists (do not skip).
- Read top N newest entries from `<PROJECT_ROOT>/.memory/CHANGELOG.md` (default N=20).
- If more context is needed, run grouped fuzzy retrieval:
  - AI generates 2-3 keyword groups, each group has 2-4 keywords.
  - Each group must include at least one specific token (module/file/error/feature/task id).
  - A log entry matches only when it hits at least 2 keywords in the same group (AND-like), not a single keyword.
  - Avoid generic-only groups (e.g., `project`, `update`, `fix`).

### 5.5 Write Rules (end of a stage/day)

- Stable/reusable info -> update `PROJECT_MEMORY.md` (rewrite allowed).
- Process notes/todos/decisions/major edits -> add one entry to `CHANGELOG.md`.
- After each prompt is completed and `CHANGELOG.md` is updated, review the current chat/request and the actual changes from this prompt to decide whether `PROJECT_MEMORY.md` should be added or edited.
- If the answer is yes, edit `PROJECT_MEMORY.md` in the same close-out flow.
- If the answer is no, record `reviewed-no-change` in the changelog `Memory` field.
- Memory edits must also be reflected in `CHANGELOG.md` with clear `Tags` for future retrieval.

### 5.6 Never Store

- Never write secrets/sensitive data into memory files (use redacted placeholders).

### 5.7 Sub-project `.memory/` (exceptional — bridging rule)

Default is 5.2 (single root `.memory/` only). In the exceptional case that a
self-contained sub-project maintains its own `<SUBPROJECT_ROOT>/.memory/CHANGELOG.md`
(e.g., a bundled tool with independent lifecycle), this bridging rule applies:

- **Every entry added to a sub-project changelog MUST have a matching pointer
  entry in the root `<PROJECT_ROOT>/.memory/CHANGELOG.md`**.
- The root pointer entry must carry all metadata fields (`Time`, `AI`, `Request`,
  `Tags`, `Files`, `Memory`, `Risk`). The `Actions` body may be empty or reduced
  to a one-liner such as `See <SUBPROJECT_ROOT>/.memory/CHANGELOG.md for details`.
- `Files:` in the root pointer must include the sub-project changelog path so
  the drill-in path is explicit.
- Purpose: anyone scanning the root changelog still sees that the activity
  happened, with enough tags/metadata to locate details in the sub-project log.

## 6) Operating Model: Coordinator + Subagents (Multi-Implementer + Independent Review)

- Coordinator (Main): communication, clarification, task breakdown, acceptance criteria, risk gating, final approval. By default: plan-only; does not directly implement changes.
- Implementer subagents: may be multiple in parallel. Each must declare a non-overlapping Scope (module/path responsibility).
- Reviewer subagent: must be different from the Implementer being reviewed (two-person rule). Reviews: requirement fit + safety + permission boundaries + env/base rules + logging + ROS log (if applicable).
- Tester subagent (optional): runs minimal verification and reports commands + results.

### Subagent Progress Supervision (Hard Rule)

- When subagents are enabled, the Coordinator must check each active subagent's progress at least once every 1 minute.
- If consecutive progress checks show no meaningful advancement, the Coordinator must take action immediately (e.g., clarify scope, unblock dependencies, redirect approach, or replace/stop the stuck subagent).
- Progress checks and interventions should be explicit and traceable in normal working logs/updates.

### Integration rule (when multiple Implementers)

- Assign one Integrator (one of Implementers or Coordinator-designated) to merge changes, resolve conflicts, and ensure `<PROJECT_ROOT>/.memory/CHANGELOG.md` (and ROS log when applicable) is updated once consistently.

### Evidence Pack (required for approval)

Each Implementer (or Integrator) must provide:

- Ticket: goal/scope/acceptance points
- Scope: exact modules/paths touched
- Diff summary: files changed + key deltas (diffstat ok)
- Commands run: list + outcome summary (if any)
- Risk rating: Low/Med/High + reason
- Logging status: `<PROJECT_ROOT>/.memory/CHANGELOG.md` updated; ROS Change Log updated if ROS-based

### Post-Change Verification (Hard Rule)

After completing any code/config/doc change, the Implementer (or Reviewer) must:

1. **Identify affected scope**: list every file created, modified, or deleted, plus files that import/depend on them.
2. **Full-content review**: read the complete content of each affected file (not just the diff) to verify:
   - No syntax errors, typos, or broken references (imports, paths, URLs, cross-file calls).
   - No logic bugs introduced by the change (off-by-one, wrong variable, missing return, race condition, etc.).
   - No inconsistencies with the rest of the codebase (naming, API contracts, type signatures, config format).
3. **Dependency check**: confirm that upstream callers / downstream consumers of changed interfaces still work correctly.
4. **Report**: include verification results in the Evidence Pack (`Checks` field). If any issue is found, fix before requesting approval.

> Rationale: reviewing only the diff is insufficient - bugs often hide in interactions between changed and unchanged code.

### Auto-Approval Gate (Coordinator can approve without user present ONLY if all true)

- Reviewer = PASS and Risk = Low
- No high-risk/unauthorized operations performed
- No `base` installs; dependency changes only in project env and recorded
- `<PROJECT_ROOT>/.memory/CHANGELOG.md` updated per format; ROS Change Log updated if applicable
- Tester = PASS (or explicitly "no tests needed" with rationale)
- Otherwise: escalate to user for explicit confirmation.

## 7) Rules Self-Update

> Source of truth: `https://github.com/JimalH/ai-workflow-kit`

When the user requests a rules update:

1. **Fetch**: check the remote repo (`JimalH/ai-workflow-kit`) for any `AI_rules_v*.md` files with a version higher than the one currently in use.
2. **Compare**: if a newer version exists, produce a concise summary of what changed (added / modified / removed rules, section-by-section).
3. **Confirm**: present the diff summary to the user and ask for explicit approval before applying.
4. **Apply**: only after user approval, download the new file and replace the local copy. Record the update in `<PROJECT_ROOT>/.memory/CHANGELOG.md`.
5. **No silent upgrades**: never auto-replace or auto-merge rules without user confirmation.
