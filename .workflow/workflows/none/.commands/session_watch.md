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

Notes
- mtime-only; may surface false positives.
- Stops at first detected change. Use `--forever` to ignore duration.
