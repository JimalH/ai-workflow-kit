# consult.md — How to run a consult step (chat-only)

## When to use
- MUST: any Consult Gate trigger from BASE (domain-critical assumptions, irreversible impact, user uncertainty, hidden conventions, Validator FAIL implying domain mismatch).
- SHOULD: heavy implicit background/industry or lab conventions; bringing in external standards/workflows; interpreting specialized outputs.

## Channels
- Chat-only. Consultant never writes the promptbook. If an internal sub-agent is used, its findings must still be written to chat.

## Message templates (align with CHAT_PROTOCOL)

### CONSULT_REQUEST (any role -> Consultant)
```
TYPE: CONSULT_REQUEST
requester_role: <Specifier|Implementer|Validator|...>
CONSULT_DOMAIN: <domain or none>
context: <what we are doing now>
plan_or_questions: <plan outline or numbered questions>
assumptions: <bullets>
risks_unknowns: <bullets>
requested_review: <what you want checked>
```

### CONSULT_RESPONSE (Consultant -> requester)
```
TYPE: CONSULT_RESPONSE
CONSULT_DOMAIN: <domain used>
key_constraints: <domain constraints/pitfalls>
actions: <required corrections / recommended changes>
questions: (i/n) <one question per batch>
OK_TO_PROCEED: yes|no
```

### CONSULT_ALERT (Consultant -> any role)
```
TYPE: CONSULT_ALERT
CONSULT_DOMAIN: <domain, if clear>
issue: <what is wrong>
why_it_matters: <domain impact>
actions: <what to change>
```

### CONSULT_BLOCKER (Consultant -> any role)
```
TYPE: CONSULT_BLOCKER
CONSULT_DOMAIN: <domain, if clear>
issue: <what is wrong>
why_it_matters: <domain impact>
blocking_actions: <what must change before proceeding>
```

## Pass condition
- Proceed only after a CONSULT_RESPONSE with `OK_TO_PROCEED: yes`, or after a user-recorded override in chat.

## Reminder
- Chat Gate applies: read/process chat before acting.
- Log consult outcomes in chat; implementers/specifiers/validators update SSOT/promptbook themselves if needed.

