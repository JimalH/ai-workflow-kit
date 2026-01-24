# session_watch (none workflow)

Purpose: minimal safety watcher for none mode (no SSOT). Poll mtimes to catch changes in base rules and chat transport.

Usage
- `python .workflow/tools/session_watcher.py --workflow none` (default duration 3600s)
- Natural language mapping: “session watch 30min” => `--duration 1800`; “session mode 1h” => `--duration 3600`; “session watch forever” => `--forever`.

Watchlist (.commands/session_watchlist.txt)
- `.workflow/workflows/none/BASE.md`
- `.workflow/workflows/none/.commands/session_watch.md`
- `.workflow/workflows/none/.commands/session_watchlist.txt`
- `.workflow/workflows/CHAT_PROTOCOL.md`

Output & schema
- Human line then JSON line (single line) with fields `event`, `timestamp`, `workflow`, `changed` (list of `{path, kind, mtime_before, mtime_after}`), `note`.
- Event values: `changed`, `timeout`, `config_error`.

Exit codes
- `0` change detected
- `2` duration expired without change
- `3` watchlist missing/unreadable

Responding to change notifications
- When `[SESSION_WATCH] changed=...` appears, read the JSON line to get `changed` paths and open each modified file.
- Check any `temp_chat_*.txt` for your role in header `Participants:`; look for `TAG:@<YourRole>` with `FLAG:UNREAD`.
- Respond according to message TYPE (e.g., HANDOFF, VALIDATION_FAIL, CLARIFICATION, BLOCKER) in chat with your role/identity, set your message `FLAG:UNREAD`, and tag recipients.
- None mode has no SSOT/promptbook; log actions in chat as needed.
- Continue running watcher unless it exits (change found) or you stop it.

Notes
- mtime-only; may surface false positives.
- Stops at first detected change. Use `--forever` to ignore duration.
