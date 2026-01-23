[Paste](https://file+.vscode-resource.vscode-cdn.net/e%3A/OneDrive/AI%20workflow/.workflow/workflows/relay_accept_change/# "#")# BASE - Relay–Accept–Change (RAC) workflow v4 (Roles Registry + Permissions Policy)

## 1. Workflow Overview

Requirements are written into the promptbook (SSOT) -> Implementer delivers -> Validator validates against AC -> on FAIL, repair and loop until PASS.

## 2. Artifacts & SSOT

- Workflow Loader: `AI_LOADER.md`
- Workflow Base Rules: `AI_WORKFLOW_BASE.md`
- SSOT: latest `P-####.md` under `.workflow/workflows/relay_accept_change/promptbook/`
- Chat Protocol: `.workflow/workflows/CHAT_PROTOCOL.md`
- Skills cache: `.workflow/workflows/_skills_cache/`

## 3. Roles Registry (machine-readable)

- Allowed Roles: [Specifier, Implementer, Validator, Consultant]
- Allowed Combos: [Specifier+Validator, Consultant+Specifier, Consultant+Implementer, Consultant+Validator]
- Disallowed Combos: [Implementer+Validator]

## 4. Promptbook structure & write rules (mandatory)

- Sections must include: Metadata / Background / REQ / TASK / AC / CON / DELIV / Change Log / Validation Report / Appendix - Chat Digest
- IDs: REQ-001 / TASK-001 / AC-001 / …
- Canonical: first occurrence of a heading wins; do NOT paste a second full template at the end.
- Append-only: only Change Log and Validation Report may be appended; others must be edited in place.
- No empty placeholders or “to be filled” stubs.

## 5. Lifecycle (mandatory)

- Validator first validates everything they can; even after a FAIL is found, continue validating remaining items and record results.
- When user action is required for validation, guide the user step by step; if a FAIL occurs, stop and record PASS/FAIL/NOT TESTED.
- Record all validation results in the Validation Report.

## 5.1 Consult Gate (Pre-Implementation / Domain Review)

- Chat-only consult; Consultant never writes the promptbook.
- Two tiers:
  - MUST consult when:
    1) Domain-critical assumptions/directionality/merging/normalization steps (e.g., sequences, primers, units, direction).
    2) Outputs affect irreversible actions (experiments, money, health, etc.).
    3) User signals uncertainty / missing background / possibly omitted context.
    4) Plan relies on non-obvious industry/domain conventions or key assumptions.
    5) Validator FAIL indicates likely domain/common-sense mismatch (force consult or re-consult).
  - SHOULD consult examples:
    - Heavy implicit background or dependency on industry/lab conventions.
    - Introducing external standards/workflows or interpreting specialized outputs.
- When triggered:
  - Current role (Implementer/Specifier/Validator) sends CONSULT_REQUEST (must include requester_role).
  - Wait for CONSULT_RESPONSE with `OK_TO_PROCEED: yes`, or a clear user override recorded in chat, before continuing.
- Pass condition:
  - CONSULT_RESPONSE with OK_TO_PROCEED yes, or explicit user override recorded in chat.
- Consultant may be separate AI or internal sub-agent; internal consult outcomes must still be written into chat as CONSULT_RESPONSE/ALERT/BLOCKER.

## 6. Chat Semantics (application layer)

- Chat Gate (mandatory): before any implementation/validation/write, check `temp_chat_*.txt` in this workflow and process new messages.
- Recommended TYPEs: QUESTION / ANSWER / HANDOFF / REJECT_WITH_FIX / FIX_DONE / VALIDATION_PASS / VALIDATION_FAIL / CLOSE_REQUEST / CLOSE_ACK
- Handoff must include: role switch info, current state, repair suggestions, and re-validation commands (if any).

### Chat Initiation Rules

- MUST open chat when:
  1) Role handoff or Implementer/Validator/Specifier role change, or requesting someone else to take over.
  2) Validation FAIL / rollback / need to redo.
  3) Workflow switch (including entering/leaving none).
  4) Platform stub or kit install/repair conflict needing user decision.
  5) Any potentially destructive or high-risk action needing permission check.
- AI may open additional chats when context may be stale, concurrent edits are likely, or requirements/assumptions conflict.

## 7. Evidence Rules (mandatory)

- PASS requires: command + output summary/log/path + checkpoints.
- Do not mark PASS without evidence.

## 8. Close & Digest

- CLOSE_REQUEST carries `ARCHIVE_SUGGEST:YES|NO`.
- CLOSE_ACK carries `ARCHIVE_DECISION:YES|NO`.
- Archive only if both sides choose YES.
- Digest is written to promptbook canonical section `## Appendix - Chat Digest`.

## 9. Autonomy & Permissions Policy (recommend L1)

### Allowed without asking (in-scope)

Agent MAY edit/create files WITHOUT asking only if ALL are true:

- Scope whitelist:
  - `.workflow/workflows/relay_accept_change/...`
  - `.workflow/workflows/CHAT_PROTOCOL.md`
  - `.workflow/workflows/ACTIVE_WORKFLOW.txt` (only when user requests switching workflow)
  - `.workflow/workflows/docs/...` (design/guide docs)
  - `.workflow/roles/...`
- Non-destructive: no deleting folders, no large moves/renames, no irreversible migrations.
- Obey SSOT write discipline: canonical + append-only rules.

### Always require user confirmation

- Any delete (file or directory) or large rename/move.
- Changes outside the scope whitelist.
- Installing dependencies or changing environment (pip/conda/npm etc.).
- Commands that modify system state/credentials.
- Network fetch (git clone/curl/wget) unless allowed by Skills Policy allowlist.
- Touching secrets/keys/tokens, `.env`, SSH/credential configs.

### Audit requirements (mandatory)

When writing without asking, MUST provide:

- Brief change plan (files and reasons).
- Diff summary (which files changed/added, key points).
- Update SSOT Change Log / Validation Report as required by workflow.

### Safety defaults

- If unsure an action is allowed -> ask the user.
- Avoid unrelated reformatting; prefer minimal diffs.
- Never duplicate full promptbook structure at the end.

## 10. Skills Policy (mandatory)

- Allowlist only:
  - https://github.com/openai/skills
  - https://github.com/anthropics/skills
  - https://github.com/rominirani/antigravity-skills
  - https://github.com/sickn33/antigravity-awesome-skills
- Cache: always pull to `.workflow/workflows/_skills_cache/` and pin commit/tag.
- Default: load instruction files only; do NOT auto-run skill scripts/binaries unless user/BASE explicitly allows and evidence is recorded.
- Usage/installs must be recorded in promptbook Change Log (repo + commit/tag + path + install target/steps).

## 11. Safety

- Do not delete history; do not overwrite Change Log/Validation Report; do not edit old chat bodies (only headers/FLAG allowed).
