# session_watch (relay_accept_change)

Purpose: replace legacy “session mode” by polling mtimes in a tight scope so implementers/validators get notified to re-read files.

Usage
- `python .workflow/tools/session_watcher.py --workflow relay_accept_change` (default: interval 10s, duration 3600s)
- `python .workflow/tools/session_watcher.py --workflow relay_accept_change --duration 1800` (natural language: “session watch 30min”)
- `python .workflow/tools/session_watcher.py --workflow relay_accept_change --duration 3600` (natural language: “session mode 1h”)
- `python .workflow/tools/session_watcher.py --workflow relay_accept_change --forever` (natural language: “session watch forever”)

Watchlist (.commands/session_watchlist.txt)
- `.workflow/workflows/relay_accept_change/BASE.md`
- `.workflow/workflows/relay_accept_change/.commands/session_watch.md`
- `.workflow/workflows/relay_accept_change/.commands/session_watchlist.txt`
- `.workflow/workflows/relay_accept_change/promptbook/*.md`
- `.workflow/workflows/relay_accept_change/temp_chat_*.txt`
- `.workflow/workflows/CHAT_PROTOCOL.md`

Output format (always two lines)
1) Human: `[SESSION_WATCH] changed=<N> at=<ISO8601> workflow=relay_accept_change` or `no_change ...` on timeout.
2) JSON (single line) schema:
   - `event`: `"changed" | "timeout" | "config_error"`
   - `timestamp`: ISO8601
   - `workflow`: slug
   - `changed`: list of `{path, kind: modified|created|deleted, mtime_before, mtime_after}`
   - `note`: `"mtime-only; may be false positives; re-read files to confirm"`

Exit codes
- `0` : change detected (script stops after first change)
- `2` : duration expired with no changes
- `3` : config error (missing watchlist or unreadable)

Notes
- Detection is mtime-only; editors that touch mtimes without content change may trigger false positives.
- The watcher re-expands globs each poll, so new files that match the watchlist are captured.
- Root defaults to repo top; override with `--root <path>` if running elsewhere.
