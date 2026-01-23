#!/usr/bin/env python3
"""Poll file mtimes and report the first change as both human + JSON lines."""

import argparse
import glob
import json
import os
import sys
import time
from datetime import datetime, timezone


def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat()


def load_entries(path: str) -> list[str]:
    entries: list[str] = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            striped = line.strip()
            if not striped or striped.startswith("#"):
                continue
            entries.append(striped)
    return entries


def expand_entries(entries: list[str], root: str) -> set[str]:
    paths: set[str] = set()
    for pattern in entries:
        abs_pattern = os.path.join(root, pattern)
        matches = glob.glob(abs_pattern, recursive=True)
        for match in matches:
            rel = os.path.relpath(match, root)
            paths.add(rel)
    return paths


def snapshot(paths: set[str], root: str) -> dict[str, float]:
    snap: dict[str, float] = {}
    for rel in paths:
        abs_path = os.path.join(root, rel)
        if os.path.exists(abs_path):
            snap[rel] = os.path.getmtime(abs_path)
    return snap


def detect_changes(prev: dict[str, float], current: dict[str, float]):
    changes = []
    for path in sorted(set(prev.keys()) | set(current.keys())):
        before = prev.get(path)
        after = current.get(path)
        if before is None and after is not None:
            kind = "created"
        elif before is not None and after is None:
            kind = "deleted"
        elif before is not None and after is not None and before != after:
            kind = "modified"
        else:
            continue
        changes.append({
            "path": path,
            "kind": kind,
            "mtime_before": before,
            "mtime_after": after,
        })
    return changes


def print_event(event: str, workflow: str, changes=None, exit_code=0):
    timestamp = iso_now()
    if event == "changed":
        human = f"[SESSION_WATCH] changed={len(changes or [])} at={timestamp} workflow={workflow}"
    elif event == "timeout":
        human = f"[SESSION_WATCH] no_change duration_expired at={timestamp} workflow={workflow}"
    else:
        human = f"[SESSION_WATCH] {event} at={timestamp} workflow={workflow}"

    payload = {
        "event": event,
        "timestamp": timestamp,
        "workflow": workflow,
        "changed": changes or [],
        "note": "mtime-only; may be false positives; re-read files to confirm",
    }
    print(human)
    print(json.dumps(payload, separators=(",", ":")))
    sys.exit(exit_code)


def main():
    parser = argparse.ArgumentParser(description="Poll file mtimes and stop at first change.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--workflow", help="Workflow slug to use its session_watchlist.txt")
    group.add_argument("--watchlist", help="Explicit watchlist file path")
    parser.add_argument("--interval", type=float, default=10, help="Polling interval in seconds (default: 10)")
    parser.add_argument("--duration", type=float, default=3600, help="Total watch duration in seconds (default: 3600)")
    parser.add_argument("--forever", action="store_true", help="Ignore duration and watch until a change")
    parser.add_argument("--root", default=".", help="Repo root (default: current directory)")

    args = parser.parse_args()
    root = os.path.abspath(args.root)

    if args.workflow:
        workflow_slug = args.workflow
        watchlist_path = os.path.join(root, ".workflow", "workflows", workflow_slug, ".commands", "session_watchlist.txt")
    else:
        workflow_slug = "custom"
        watchlist_path = args.watchlist
        if watchlist_path and not os.path.isabs(watchlist_path):
            watchlist_path = os.path.join(root, watchlist_path)

    if not watchlist_path or not os.path.exists(watchlist_path):
        print_event("config_error", workflow_slug, changes=[{"path": watchlist_path, "kind": "missing"}], exit_code=3)

    entries = load_entries(watchlist_path)
    if not entries:
        # Empty watchlist is allowed but will immediately timeout at end of duration.
        pass

    start = time.monotonic()
    prev_paths = expand_entries(entries, root)
    prev_snapshot = snapshot(prev_paths, root)

    while True:
        time.sleep(max(args.interval, 0))
        current_paths = expand_entries(entries, root)
        current_snapshot = snapshot(current_paths, root)
        changes = detect_changes(prev_snapshot, current_snapshot)
        if changes:
            print_event("changed", workflow_slug, changes, exit_code=0)
        if not args.forever and (time.monotonic() - start) >= args.duration:
            print_event("timeout", workflow_slug, changes=[], exit_code=2)
        prev_paths = current_paths
        prev_snapshot = current_snapshot


if __name__ == "__main__":
    main()
