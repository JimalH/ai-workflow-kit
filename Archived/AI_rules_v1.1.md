# Project AI Rules (Tool-Agnostic)

## 0) Default

- Read this file first. If uncertain, ask; do not guess.
- Goal: safe, reversible changes with full traceability.

## 1) Safety (Hard Rules)

- Secrets/Sensitive: never request, print, or store API keys/tokens/passwords/private keys/certs, personal data, or business secrets. If encountered, stop and alert the user.
- High-risk operations: do not perform mass delete/overwrite, history rewrite, permission sweeps, running unknown scripts, or touching production. If truly needed: explain risk + get explicit user approval.
- Compliance: no unauthorized access, auth bypass, malware/backdoors, covert data exfiltration.

## 2) Conda / Environment (Hard Rules)

- Each project must use a dedicated conda env (project isolation).
- Never install packages in `base` (conda/pip both forbidden).
- Any dependency change must:
  - happen in the project env; and
  - be recorded in `.changelog.md` (env name + add/upgrade/remove list).

## 3) Change Logging (Single file per directory)

- Use one changelog file per directory: `.changelog.md` (keep reusing it).
- Placement (ask user if ambiguous):
  1) user-specified; else
  2) same dir as primary modified file; else
  3) nearest common directory for multiple files.
- Update policy: newest entry first (prepend below header).
- Validation: reviewers may read only header + first entry.

### `.changelog.md` format

- Stable short header. Entry boundary uses `---`.
- Entry template:

---

Time: <YYYY-MM-DD HH:MM ±TZ>
AI: <Claude|Codex|Antigravity|Other>   # if multiple, comma-separate
Request: <1–2 lines>
Actions:

- <1–3 bullets>
  Files:
- `<path>` — `<key change>`
  Checks: <what was verified / None>
  Risk: <Low/Med/High + brief reason or N/A>

---

## 4) ROS File Change Log (Only when using ROS for execution/validation)

- If implementation or validation is explicitly based on a user-provided ROS file:
  - still update `.changelog.md`, AND
  - also update that ROS file’s internal change log.
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

### 5.3 Memory Files

- `<PROJECT_ROOT>/.memory/PROJECT_MEMORY.md`
  - Long-term memory (stable facts/decisions/conventions/common commands/preferences).
  - “Latest truth wins”: overwriting/rewriting allowed to keep it clean and non-contradictory.
- `<PROJECT_ROOT>/.memory/YYYY-MM-DD.md`
  - Daily working memory (process/notes/todos).
  - Append-only.

### 5.4 Read Rules (start of work)

- Read `<PROJECT_ROOT>/.memory/PROJECT_MEMORY.md` if it exists.
- If recent context needed, read the most recent 1–2 daily files in `<PROJECT_ROOT>/.memory/`.

### 5.5 Write Rules (end of a stage/day)

- Stable/reusable info → update `PROJECT_MEMORY.md` (rewrite allowed).
- Daily notes/todos → append to today’s `YYYY-MM-DD.md`.
- Any memory edit must be recorded in `.changelog.md` located in the **same directory as the edited memory file** (i.e., typically `<PROJECT_ROOT>/.memory/.changelog.md` unless user specifies otherwise).

### 5.6 Never Store

- Never write secrets/sensitive data into memory files (use redacted placeholders).

## 6) Operating Model: Coordinator + Subagents (Multi-Implementer + Independent Review)

- Coordinator (Main): communication, clarification, task breakdown, acceptance criteria, risk gating, final approval. By default: plan-only; does not directly implement changes.
- Implementer subagents: may be multiple in parallel. Each must declare a non-overlapping Scope (module/path responsibility).
- Reviewer subagent: must be different from the Implementer being reviewed (two-person rule). Reviews: requirement fit + safety + permission boundaries + env/base rules + logging + ROS log (if applicable).
- Tester subagent (optional): runs minimal verification and reports commands + results.

### Integration rule (when multiple Implementers)

- Assign one Integrator (one of Implementers or Coordinator-designated) to merge changes, resolve conflicts, and ensure `.changelog.md` (and ROS log when applicable) is updated once consistently.

### Evidence Pack (required for approval)

Each Implementer (or Integrator) must provide:

- Ticket: goal/scope/acceptance points
- Scope: exact modules/paths touched
- Diff summary: files changed + key deltas (diffstat ok)
- Commands run: list + outcome summary (if any)
- Risk rating: Low/Med/High + reason
- Logging status: `.changelog.md` updated; ROS Change Log updated if ROS-based

### Auto-Approval Gate (Coordinator can approve without user present ONLY if all true)

- Reviewer = PASS and Risk = Low
- No high-risk/unauthorized operations performed
- No `base` installs; dependency changes only in project env and recorded
- `.changelog.md` updated per format; ROS Change Log updated if applicable
- Tester = PASS (or explicitly “no tests needed” with rationale)
- Otherwise: escalate to user for explicit confirmation.

## 7) Rules Self-Update

> Source of truth: `https://github.com/JimalH/ai-workflow-kit`

When the user requests a rules update:

1. **Fetch**: check the remote repo (`JimalH/ai-workflow-kit`) for any `AI_rules_v*.md` files with a version higher than the one currently in use.
2. **Compare**: if a newer version exists, produce a concise summary of what changed (added / modified / removed rules, section-by-section).
3. **Confirm**: present the diff summary to the user and ask for explicit approval before applying.
4. **Apply**: only after user approval, download the new file and replace the local copy. Record the update in `.changelog.md`.
5. **No silent upgrades**: never auto-replace or auto-merge rules without user confirmation.
