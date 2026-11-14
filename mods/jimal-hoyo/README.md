# jimal-hoyo

A Claude Code mod: a pane beside the chat to start, stop and watch runs of the HoYo Daily Assistant (the `hoyo` command line of a local checkout). The pane is not tied to a session: open it from any project, start a run there, and any other session shows the same run. The run itself is carried by `hoyo`'s own background worker, never by the session. Interface text is Simplified Chinese.

## Install

```bash
claude plugin install jimal-hoyo --marketplace JimalH/ai-workflow-kit
```

At a terminal prompt: `/plugin install jimal-hoyo --marketplace JimalH/ai-workflow-kit`. Desktop app (where `/plugin` does not run): **+** next to the prompt box → **Plugins** → **Add marketplace** with `JimalH/ai-workflow-kit` → **Add plugin**.

After installing or updating, run `/reload-plugins` once: `/hoyo` appears only after that.

## Requirements

- Windows, with PowerShell 7 (`pwsh`) on the PATH.
- A working checkout of the HoYo Daily Assistant (the folder that holds `hoyo.ps1`). This mod reads its command-line contract, schema version 1 (`docs/INTERFACE.md` there).

## First use

Tell the mod where the checkout is, once, by either:

- `/hoyo repo <absolute folder>` in the prompt (saved in the mod's store, shared by all sessions), or
- the plugin setting `repo` (config menu, or in `~/.claude/settings.json`):

```json
{ "pluginConfigs": { "jimal-hoyo": { "options": { "repo": "<absolute folder>" } } } }
```

The folder must be a drive-letter absolute path (no relative, UNC or `..` paths) and, for `/hoyo repo`, must hold `hoyo.ps1`. `/hoyo repo` is accepted only when a person types it in the prompt; run by another plugin, the bridge or the SDK it only opens the pane. The setting wins over the saved folder. A folder in the wrong form counts as not configured and the pane says so. Then `/hoyo` opens the pane.

## What the pane shows

- **Idle**: today's result per game (Zenless Zone Zero, Honkai: Star Rail) and the start buttons.
- **Running**: elapsed time, finished games with their per-task results, the current game with its latest log line, the games still waiting.
- **Ended** (the latest run, for six hours after it finished): the outcome, then per game the tasks grouped (done, probably done, skipped or failed with the reason, interrupted by a stop, not executed), every `needs_user` item in a highlighted block, and the start buttons again. After six hours the pane is idle again.

Buttons:

- **Run all**, **ZZZ**, **Star Rail**: start a run (`hoyo run all|zzz|hsr --detach`).
- **Pause** / **Resume**, **Stop**: act on the run in progress.
- **Refresh**: look again now.

Start buttons act at once, with no confirmation, and a run takes over the mouse and keyboard: do not touch them once it starts. A pressed button shows its busy label and ignores further clicks until the command returns.

Errors are shown in the pane: the `error.message` of a failed `hoyo` call with a line for exit codes 4 (a run is active or holds the lock), 5 (the worker did not start) and 6 (no run in progress), a command that cannot start or times out, and instructions when the folder is not configured.

## Command

- `/hoyo`: open the pane.
- `/hoyo repo <folder>`: save the folder (see First use).

Nothing is started when a session starts; the command is only registered. The mod adds no tool for the model and sends the model no message. A slash command's record is part of the conversation, so the line you type (`/hoyo repo <folder>`) is probably read by the model like any command record; plain `/hoyo` carries no argument.

## Settings

`repo`: the checkout folder, as above. No default.

## How it works

- Calls `pwsh -NoProfile -File <repo>\hoyo.ps1 <verb> --json` through `$.process.run` (no shell): `status --no-verify`, `run`, `stop`, `pause`, `resume`, `result`, `logs`.
- While a run is shown it follows `<state_root>\runs\<run id>\status.json` on disk every 3 seconds, without starting a process; idle, it asks `status` every 60 seconds. It polls only while the pane is open and shown, and stops when the pane closes.
- The latest log line comes from the game's `upstream.log` (checked every 6 seconds, read only when it changed); only a log over 4 MiB falls back to `hoyo logs`. Only lines of level INFO, WARNING, ERROR or CRITICAL are shown (and the runner's own markers): DEBUG lines can hold text read off the game screen and are never shown.
- Every string from outside is stripped of control characters (such as ANSI colour codes) before it is stored or drawn.

## Known limits

- `hoyo` reports per-task results only after a game has finished, so there is no task-by-task live progress while it runs.
- The ended view stays six hours.
- Not verified on the phone (mobile) surface.
