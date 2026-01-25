# Workflow System Design (BASE + Roles + Chat Protocol + Skills + Permissions)

Design for maintaining multiple AI collaboration workflows in one repo. Goals: fixed structure, clear layers, strict write discipline, explicit permissions, and chat-first coordination.

---

## 1. Layers & Priority
- **Chat Protocol (transport)**: file-chat mechanics (locking, read pointers, format, close). Semantics live in each BASE.
- **BASE (workflow layer)**: per-workflow business rules (process, SSOT, formats, AC, Skills Policy, Permissions Policy, chat semantics, consult gate).
- **Roles (role layer)**: reusable role boundaries (what to do / not do). Now includes Consultant overlay (chat-only).
- **Skills (capability layer)**: optional/required skills; allowlisted, cached, pinned.
- **Permissions (boundaries)**: where agents may edit/execute without asking.

Priority: `BASE.md (current workflow) > CHAT_PROTOCOL.md > .workflow/roles/<Role>.md > Skills`.

---

## 2. Fixed Directory Structure (pinned)
```
/.workflow/
  AI_LOADER.md
  AI_WORKFLOW_BASE.md
  tools/
    session_watcher.py
  workflows/
    CHAT_PROTOCOL.md
    ACTIVE_WORKFLOW.txt
    _skills_cache/
    docs/
      WORKFLOW_SYSTEM_DESIGN.md
      WORKFLOW_SYSTEM_DESIGN_GUIDE.md
    none/
      BASE.md
      .commands/
        session_watch.md
        session_watchlist.txt
    <workflow_slug>/
      BASE.md
      .commands/
        <command>.md
        session_watch.md
        session_watchlist.txt
      promptbook/
        P-0001.md
        ...
  roles/
    <Role>.md
    consultants/
      biologist.md
      trade_expert.md
```
`none` workflow: minimal safety only (no promptbook/SSOT; roles optional unless assigned).

---

## 3. ACTIVE_WORKFLOW.txt
- Single line with the current `workflow_slug`.
- All agents use it to load the active workflow.

---

## 4. Roles Registry (machine-readable)
Defined in each BASE:
```
## Roles Registry
- Allowed Roles: [RoleA, RoleB, Consultant, ...]
- Allowed Combos: [RoleA+RoleB, Consultant+RoleA, ...]
- Disallowed Combos: [...]
```
Consultant is an overlay, chat-only role; may be separate AI or internal sub-agent, but outcomes must be recorded in chat.

---

## 5. Permissions Policy (key)
BASE must define boundaries:
```
## Autonomy & Permissions Policy
- Allowed without asking (scope whitelist)...
- Always require user confirmation...
- Audit requirements...
- Safety defaults...
```
Principles: scope whitelist, ask for high-risk actions (delete/rename/install/exec/network outside allowlist/secrets), and always audit when acting without asking.

---

## 6. Chat Protocol (common transport)
- File chat in workflow dir: `temp_chat_*.txt`
- Header with status/participants/last read; messages are append-only.
- Consult types added: CONSULT_REQUEST / CONSULT_RESPONSE / CONSULT_ALERT / CONSULT_BLOCKER with required fields (see CHAT_PROTOCOL.md).
- Chat Gate: read/process chat before acting.

## 6.1 Chat Initiation (layered)
- Workflow layer (BASE): MUST triggers such as role handoff, validation fail, workflow switch, high-risk actions, consult gate, etc.
- Role layer: role-specific MUST triggers (e.g., Validator on FAIL, Specifier on option decision). Consultant remains chat-only.

---

## 7. Consult Gate (workflow-level concept)
- Two tiers: MUST consult (domain-critical assumptions, irreversible impact, user uncertainty, hidden conventions, validation FAIL indicating domain mismatch) and SHOULD consult (heavy implicit background, external standards/specialized outputs).
- Process: send CONSULT_REQUEST (include requester_role); wait for CONSULT_RESPONSE OK_TO_PROCEED yes or explicit user override in chat before continuing.
- Consultant may be internal or separate; outcomes must be in chat, never in promptbook.
- Role-level initiations: Implementer consults on triggers; Specifier initiates when domain gaps/hidden constraints; Validator initiates when FAIL looks domain/common-sense related.

---

## 8. Skills (allowlist + cache + pin)
Allowlist only:
- https://github.com/openai/skills
- https://github.com/anthropics/skills
- https://github.com/rominirani/antigravity-skills
- https://github.com/sickn33/antigravity-awesome-skills
Cache to `.workflow/workflows/_skills_cache/`, pin commit/tag, default to loading instructions only, record installs/usage in promptbook Change Log as required.

---

## 9. Guardrails (mandatory)
- Canonical headings: first occurrence wins; never paste duplicate templates.
- Append-only sections limited to those BASE allows (often Change Log, Validation Report).
- No empty placeholders.
- PASS requires evidence (per BASE).
- Chat: only header Last read/Status and message FLAG may change; message bodies are append-only.

---

## 10. Session Watcher
- Tool: `.workflow/tools/session_watcher.py` (mtime-based; may false-positive).
- Each workflow ships `.commands/session_watch.md` + `.commands/session_watchlist.txt` with monitored paths (include chat files, BASE, promptbook/AC/report).
- Natural language examples: `session watch 30min` -> `--duration 1800`; `session mode 1h` -> `--duration 3600`; `session watch forever` -> `--forever`.

---

## 11. Entry Stubs
Shortest possible stubs pointing to `AI_LOADER.md` via marker block:
- Codex: `AGENTS.md`
- Claude Code: `.claude/CLAUDE.md`
- Antigravity/Gemini: `.agent/rules/GEMINI.md`

---

## 12. Consultant Overlay (summary)
- Purpose: domain sanity checks; prevent common-sense/domain pitfalls; background explanations.
- Output channel: chat-only, never promptbook.
- Collaboration: can respond to or alert any role; may send CONSULT_ALERT/BLOCKER proactively.
- Deployment: separate AI or internal sub-agent; internal outcomes must still be recorded in chat.
- Domain templates: sample profiles under `roles/consultants/` (biologist, trade_expert) to seed new workflows.
- CONSULT_DOMAIN field: consult messages carry `CONSULT_DOMAIN` to select the domain profile (matches filename under `roles/consultants/`, or `none` for generic; free-form allowed with stated fallback). If missing on CONSULT_REQUEST, consultant asks or clearly labels any inference.

## 13. Project-Specific Memory (scoped)
- Roles and workflows may keep a small “project memory” segment to retain context only within the current project/repo.
- Scope is per project: do not carry these notes across repositories or workflows in other projects.
- Use it for short-lived cues (naming conventions, temp defaults, recent decisions); never treat it as SSOT—promptbook/SSOT stays canonical.
- If stored, keep it concise and in the project’s chat or a project-local note, and clear it when the project ends or the workflow is switched.

## 14. Simple workflow (lightweight option)
- Purpose: minimal-safety alternative to RAC; centers on mutable `PROJECT.md` plus an append-only `Change log/` with reviewer/verification fields.
- Artifacts: `PROJECT.md` (current state), `Change log/` (up to 3 ACTIVE logs) and `Change log/Archived/` (immutable).
- Rules: only 3 ACTIVE logs; when creating a 4th, move the least-recently-updated ACTIVE log to Archived (then freeze). Append-only; one run may append to at most one active log. Archived logs are never edited.
- Entries record EDIT_BY, FILES, SUMMARY, optional REVIEWED_BY/VERIFIED_BY (PASS/FAIL), and notes/evidence only when issues exist. User verification is a single VERIFIED_BY line.
- Default reading: read `PROJECT.md` and relevant active log(s); avoid Archived unless needed.

