# BASE — none (minimal safety only)

## 1. Purpose
- Disable SSOT/promptbook discipline and workflow-specific steps.
- Use when a clean slate with minimal safety is needed.

## 2. Roles Registry (optional)
- Allowed Roles: [Generalist]
- Allowed Combos: [Generalist]
- Disallowed Combos: []

## 3. Autonomy & Permissions Policy
- Do not delete or overwrite user data/history unless explicitly asked.
- Ask before any destructive or irreversible actions (including rm/reset/force pushes).
- No network or external writes beyond the current workspace unless user requests.
- Keep diffs minimal and auditable.

## 4. Chat Semantics
- Chat Gate (minimal): before acting, check and process any `temp_chat_*.txt` under this workflow (if present).

### Chat Initiation Rules
- MUST open chat when:
  1) Workflow switch (including switching into/out of none) or actions needing user confirmation/authorization/high risk.
  2) Role handoff or asking someone else to take over.
  3) Validation FAIL / rollback / redo.
- Other scenarios: AI may open chat if context may be stale, risks/conflicts are noticed, or clarifications are needed.

## 5. Execution Notes
- Required reads: `.workflow/AI_WORKFLOW_BASE.md` and this file.
- Skip promptbook/SSOT/append-only rules; none mode has no promptbook.
- Roles are optional; only load `.workflow/roles/<ROLE>.md` if the user assigns one.

### Consult Gate (optional in none mode)
- Chat-only; Consultant never writes the promptbook.
- Use CONSULT_REQUEST / CONSULT_RESPONSE / CONSULT_ALERT / CONSULT_BLOCKER when a domain sanity check is needed (e.g., irreversible actions, hidden domain assumptions).
- OK_TO_PROCEED should come from CONSULT_RESPONSE: yes, or an explicit user override recorded in chat.
