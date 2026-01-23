# CHAT_PROTOCOL v1 (transport layer)

Defines the cross-AI file chat transport protocol (locking, read pointers, format, close). Business semantics (TYPE list, filing, when to send) are defined by the current workflow `BASE.md`.

---

## 1. Chat file location and naming
- Default location: `.workflow/workflows/<active_workflow>/`
- Pattern: `temp_chat_*.txt`
- Naming: `temp_chat_<id>.txt` (id suggested `yymmdd_hhmm` or `yymmdd_hhmm_<short>`)

---

## 2. Header
```txt
# CHAT v3
# Chat ID: <id>
# Status: OPEN|CLOSED
# Participants:
# - <Role>@<Identity>
# - <Role>@<Identity>
# Last read:
# - <Role>@<Identity>: <line_number>
# - <Role>@<Identity>: <line_number>
# Purpose: <one-line>
```

---

## 3. Message format (append-only)
```txt
[M0001] FROM:<Role>@<Identity> | TYPE:<AnyString> | FLAG:UNREAD|READ | TAG:@<Role>|@All
<body...>
```
- Send with `FLAG:UNREAD`; receiver changes to `FLAG:READ` after processing.
- Targeting: TAG contains @All or the receiver’s Role; missing TAG is treated as broadcast.

### 3.1 Consultant overlay TYPE semantics (role-agnostic)
- CONSULT_REQUEST (any role -> Consultant; must state requester_role)
- CONSULT_RESPONSE (Consultant -> requester_role)
- CONSULT_ALERT (Consultant -> any role; proactive warning)
- CONSULT_BLOCKER (Consultant -> any role; must stop and revise before proceeding)

### 3.2 Consultant message required fields (put in body as bullet/lines)
- CONSULT_REQUEST must include:
  - requester_role
  - CONSULT_DOMAIN: <string> (see rules below)
  - context summary (what we are doing right now)
  - proposed plan OR question(s)
  - assumptions
  - risks/unknowns
  - requested review scope (what feedback is desired)
- CONSULT_RESPONSE must include:
  - CONSULT_DOMAIN: <string> (echo the domain used)
  - key domain constraints/pitfalls relevant to the current step
  - required corrections / recommended changes (actionable)
  - questions for clarification (batched as (i/n); keep 1 question per batch where possible)
  - OK_TO_PROCEED: yes/no
- CONSULT_ALERT / CONSULT_BLOCKER must include:
  - CONSULT_DOMAIN: <string> (SHOULD; REQUIRED if domain is clear)
  - what is wrong
  - why it matters in this domain
  - actionable next steps / what to change

CONSULT_DOMAIN rules:
- Preferred values match filenames under `.workflow/roles/consultants/<domain>.md` (drop `.md`), e.g., `CONSULT_DOMAIN: biologist`.
- `CONSULT_DOMAIN: none` is allowed for generic consult with no profile.
- Free-form domains are allowed; if no profile exists, consultant must state fallback behavior.
- If CONSULT_DOMAIN is missing on a CONSULT_REQUEST, the consultant must ask for it (1 question, keep (i/n) batching), or only infer when obvious and label it as an inference + risk.

### 3.3 Examples (snippets)
- CONSULT_REQUEST
  - requester_role: Implementer
  - CONSULT_DOMAIN: biologist
  - context: designing PCR primers for gene X
  - plan_or_questions: draft primer pair attached
  - assumptions: reference genome GRCh38
  - risks_unknowns: possible off-targets
  - requested_review: orientation, Tm, amplicon size
- CONSULT_RESPONSE
  - CONSULT_DOMAIN: biologist
  - key_constraints: forward/reverse orientation ok; amplicon 520 bp; GC clamp ok
  - actions: raise annealing temp to 62C; adjust reverse primer to reduce hairpin
  - questions: (1/1) Is polymerase high-fidelity?
  - OK_TO_PROCEED: yes

Rules:
- Chat Gate stays: read/process pending chat before acting.
- Consultant is chat-only (never writes promptbook). If internal sub-agent is used, still record consult outcome in chat using CONSULT_RESPONSE/ALERT/BLOCKER.

---

## 4. Read pointer (no extra file)
1) Read your own `Last read` line number N in header.
2) Read from line N+1 onward for new content.
3) Mark relevant messages UNREAD -> READ.
4) Update header `Last read` to current total line count.

---

## 5. Write lock (rename `_editing`)
- If `temp_chat_<id>_editing.txt` exists: read-only, do not write.
- When writing/changing FLAG/Last read:
  1) Rename `temp_chat_<id>.txt` -> `temp_chat_<id>_editing.txt`
  2) Apply changes
  3) Rename back.

---

## 6. Close / Ack (structure)
- One side sends `CLOSE_REQUEST`, the other sends `CLOSE_ACK`.
- Finally set header `Status` to `CLOSED`.
- Whether to archive digest is decided by BASE.

---

## 7. Forbidden
- Do not change old message bodies (append-only; only change header Last read/Status and message FLAG).
- Do not insert or reorder historical messages.

