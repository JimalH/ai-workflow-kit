# jimal-filetree

A Claude Code mod: an IDE-style file tree in the sidebar (`/filetree`), forked from [filetree](https://github.com/data-goblin/claude-code-filetree) by Kurt Buhler (MIT), with **task marks**: the files Claude plans to change, is changing and has changed, shown in the tree whether or not the folder is a git repository.

Everything the original does is still here: git status and lines changed, the shimmer on files Claude reads (purple), writes (orange) and commits (green), search, preview, treemap and diff. See the [original README](https://github.com/data-goblin/claude-code-filetree#readme) for those, its keys and its settings (all under `/config` → jimal-filetree).

## Task marks

| Colour | Meaning |
| --- | --- |
| blue `#5fa8d3` | **planned**: Claude plans to create or change the file in this task |
| orange `#f59e0b` | **changing**: changed during the step that is running |
| green `#4caf6e` | **changed**: changed in a step that completed |

- A marked file's name and icon take its colour, with a `●` at the right; a folder takes the most advanced colour of the files inside it.
- Planned files' folders open by themselves.
- A legend shows at the bottom of the pane while anything is marked, with `clears in Ns` once the task has finished.
- **Where the plan comes from**: the mod adds a `plan_files` tool (`mcp__jimal-filetree__plan_files`) and a line in Claude's system prompt asking it to report the files it plans to change before the first edit. Paths written in the session's task list items are marked too (only files that exist), in case a report is missed. Both go away when the mod is disabled.
- **What a task is**: the session's task list, from its first open list to its wrap-up (the desktop app's plan tool, or the CLI's TodoWrite). A step completed turns that step's edits changed. A task started by `plan_files` alone, without a task list, finishes when the turn ends.
- **After the task**: the marks stay 30 seconds, then clear; a new task clears them at once. An edit outside any task is marked changed and held 30 seconds.
- Edits are seen through Edit, Write and NotebookEdit, and through the scan after shell commands, so files changed by scripts count too.
- **Lines changed outside git**: in a folder that is no git repository (where git's `?`/`M` marks and `+N -N` counts never show), the lines Claude adds and removes with Edit and Write are counted for the session and shown as `+N -N` beside the file. Local only: no model call. Changes made by shell commands are not counted.

## Clicks

A click selects a file (a folder opens or closes); a second click on the selected file clears the selection; a double-click opens it, as before.

## Install

```bash
claude plugin install jimal-filetree --marketplace JimalH/ai-workflow-kit
```

Disable the original `filetree` if it is installed: both register `/filetree`.

Needs Claude Code 2.1.306+; in the terminal, the fullscreen layout (`/tui fullscreen`) and at least 110 columns.

## Origin

- Upstream: https://github.com/data-goblin/claude-code-filetree (root of the repository)
- Copied from commit `6bc23f6d824242bea16e53e097051bfa8bcd34a2` (filetree 0.5.2), reviewed in full before copying
- License: MIT, original `LICENSE` and `ACKNOWLEDGEMENTS.md` kept in this folder
- Not copied: the demo media, GitHub workflows, git hooks and scripts

Changes (0.6.0):

- Renamed to `jimal-filetree` (plugin name, state keys, pane id); the `/filetree` command keeps its name.
- Task marks: `hooks/marks.ts` (statuses, holding, folder roll-up, paths read off text), and in `hooks/register.tsx` the `plan_files` tool, the system prompt line, following the task list, marking edits, row colours and the legend.
- Lines changed outside a git repo: counted from Edit and Write, shown as `+N -N`.
- A refused tool registration no longer stops the tree from starting.
- Tests: `tests/marks.test.ts`, and two end-to-end tests at the end of `tests/surfaces.test.tsx`; the original tests run against the renamed plugin.

Changes (0.6.1):

- A second click on the selected file clears the selection, after the double-click window, so a double-click still opens it.

Changes (0.6.2):

- Held marks clear on time after a plugin reload (the timers are armed again at start, and marks past their time are not drawn); the legend's countdown moves each second.
