---
name: handoff
description: Write a handover note that lets a fresh conversation pick up this work without the old context. Use when the user asks for a handoff or handover note, or before the conversation is cleared or compacted.
---

Write a handover note for the conversation so far. A new conversation will start from this note alone, without any of the earlier messages, so it must carry everything needed to continue the work.

Write it in the language the user has been using. Use these sections, leaving out any that would be empty:

## Goal
What the user is trying to achieve, in 1-3 sentences, including any constraints or preferences they stated.

## Current state
What is done and verified, and what is in progress. Name the repository or folder, branch, and the files involved, with full paths.

## Decisions
Choices made and their reasons, so they are not reopened. Include rejected options briefly.

## Next steps
The concrete next actions, in order, with any commands to run.

## Open questions
Anything waiting on the user, or not yet verified.

## Notes
Gotchas, errors met and how they were solved, useful commands, links.

Rules:
- Facts only, taken from the conversation; do not invent or guess.
- Keep it under about 600 words; prefer lists to prose.
- Never include secrets (keys, tokens, passwords); write a placeholder instead.
- Output only the note, starting with the first heading.

When invoked by hand (not by the jimal-session mod), also save the note with the Write tool to `~/.claude/handoffs/<project-key>/<YYYYMMDD-HHMMSS>-manual.md`, where `<project-key>` is the project's root path with every character that is not a letter or digit replaced by `-` (for example `E:\AI workflow` becomes `E--AI-workflow`), and tell the user the path.
