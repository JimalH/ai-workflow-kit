# Design Guide (how to create/maintain workflows with this system)

Runbook for any AI to set up or extend a workflow using the kit. Keep structure stable and chat-first.

---

## A. Startup steps (every session)
1) Read `.workflow/workflows/ACTIVE_WORKFLOW.txt` to get `<workflow_slug>`.
2) Read `.workflow/workflows/CHAT_PROTOCOL.md`.
3) Read `.workflow/workflows/<workflow_slug>/BASE.md` (must include Roles Registry and Permissions Policy).
4) Confirm ROLE from BASE Allowed Roles (use user assignment if given; otherwise ask once). Consultant is allowed where listed and is chat-only.
5) Read `.workflow/roles/<ROLE>.md` (multiple if combined roles are allowed).
6) Before any action, process chat files (`temp_chat_*.txt`) under the active workflow (Chat Gate).

---

## B. Creating a new workflow (`workflow_slug`)
- Create `.workflow/workflows/<workflow_slug>/BASE.md` (include Roles Registry, Permissions Policy, chat semantics, consult gate, evidence rules, etc.).
- Create `.workflow/workflows/<workflow_slug>/.commands/` (include `session_watch.md`, `session_watchlist.txt`, and `consult.md`).
- If using promptbook SSOT, add `.workflow/workflows/<workflow_slug>/promptbook/P-0001.md`.
- If new roles are needed, add `.workflow/roles/<Role>.md`.
- Update `.workflow/workflows/ACTIVE_WORKFLOW.txt` to switch workflows.

---

## C. BASE.md required checklist (mandatory)
- Workflow Overview (goals/non-goals).
- Artifacts & SSOT (definition and paths).
- Document formats (structure, numbering, canonical, append-only, anti-drift).
- Process / Lifecycle (loops, failure strategy, validate-all-first rule).
- Chat Semantics (TYPE meanings, handoff, close/digest).
- Chat Initiation Rules (MUST triggers: role handoff, validation fail, workflow switch, high-risk actions, consult gate, etc.).
- Consult Gate section (MUST/SHOULD triggers, process, pass condition, chat-only rule, OK_TO_PROCEED requirement, who may initiate including Specifier/Validator/Implementer).
- Validation & Evidence rules (PASS evidence bar).
- Skills Policy (allowlist, cache, pin, execution rules).
- Autonomy & Permissions Policy (scope whitelist, ask-list, audit, safety defaults).
- Safety / Do-not-do.
- Roles Registry (machine-readable).

---

## D. Role handbooks (`.workflow/roles/<Role>.md`) required sections
- Role Purpose
- Responsibilities
- Non-Responsibilities
- Operating Rules
- Chat Initiation Rules (role-level MUST triggers; others optional by judgment)
- Handoff Expectations
- Required Skills (fixed fields: Required/Recommended/Sources/Cache/Install policy/Record requirements)
- Consultant Coordination/Initiation where applicable (Implementer, Specifier, Validator) - chat-only, no promptbook writes, internal consult outcomes must be written to chat.

---

## E. Permissions Policy (recommended default L1)
- Allow agents to edit within scope whitelist without asking.
- Require user confirmation for high-risk actions (delete/rename/install/execute scripts/change security/network outside allowlist/secrets).
- When acting without asking, output change plan + diff summary and update SSOT logs if required.

---

## F. Multi-AI write discipline (mandatory)
- SSOT: edit in place except append-only sections allowed by BASE; never duplicate structure.
- Chat: append-only bodies; only header Last read/Status and message FLAG may change.
- Priority: keep SSOT consistency first; explain chat if conflicts happen.

---

## G. Consultant overlay (for new workflows)
- Always include Consultant in Roles Registry if consult is desired; mark as chat-only.
- Add Consult Gate section with MUST/SHOULD triggers and pass condition (OK_TO_PROCEED yes or explicit override in chat).
- Ensure CHAT_PROTOCOL supports CONSULT_* types (already system-wide).
- Provide `consult.md` command doc in `.commands/` with templates for CONSULT_REQUEST/RESPONSE/ALERT/BLOCKER.
- Add `CONSULT_DOMAIN` field to consult messages: prefer names matching `roles/consultants/<domain>.md`, allow `none` for generic; if missing, consultant asks or states inference and risk.
- Optionally add domain profile templates under `roles/consultants/` for quick reuse.
- Consultant may be separate AI or internal sub-agent; internal consult results must still be written to chat.

---

## H. Session Watcher
- Ship `.commands/session_watch.md` + `session_watchlist.txt` per workflow.
- Include chat files, BASE, promptbook, reports, and other critical paths in watchlist.
- Natural language to flags mapping: `session watch 30min` -> `--duration 1800`; `session mode 1h` -> `--duration 3600`; `session watch forever` -> `--forever`.

---

## Entry Stub pattern
Keep platform entry stubs minimal; include marker block pointing to `AI_LOADER.md`.
- Codex: `AGENTS.md`
- Claude Code: `.claude/CLAUDE.md`
- Antigravity/Gemini: `.agent/rules/GEMINI.md`

---

## Consultant templates (for future workflows)
- Use `roles/consultants/biologist.md` and `roles/consultants/trade_expert.md` as starting points for domain-specific checklists; extend per workflow as needed.


