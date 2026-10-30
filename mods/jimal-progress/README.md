# jimal-progress

A Claude Code mod: a progress bar above the prompt and a live panel of subagents. Fork of [savvy-progress](https://github.com/JohnnyVizz/claude-kit/tree/main/plugins/savvy-progress) by johnnyvizz (MIT).

- **Progress bar**: the flow's title, phase, accepted tasks out of planned, and a `×N` button with the crew size that opens the panel. It appears once something reports progress (`mcp__jimal-progress__progress`, or the savvy-flow skill) or a `savvy-*` worker starts. A finished flow shows `Done · 30s`, counts down and leaves by itself; `✕` dismisses it at any time. On the desktop the bar takes the space the row has left, so the `×N` and `✕` buttons always stay inside it.
- **Tasks under the bar**: a line with the time left and the flow's total (elapsed + left), then each open task with a half-width bar and its own time left; running first, finished ones hidden, five rows until `+N more` opens the rest. Time left uses the reporter's `estimateMin` scaled by the pace of the finished tasks, else the finished tasks' average (`—` until one finishes); a subagent's own step reports refine its task.
- **Follows the task list**: with nothing reporting through the tool, the bar follows the session's own task list (the desktop app's plan, the CLI's TodoWrite) and finishes with the turn's wrap-up.
- **Folds out of the way**: a message sent while a flow runs folds the task rows under the bar into one dim line (`▸ 3 tasks · ~12m left`); the bar stays, and a click opens the rows again. A new flow starts unfolded. Other mods' bands are drawn above this one, so the bar sits right over the prompt.
- **Agents panel** (`/agents-info` toggles it; `/agents-info open` opens it or brings it forward): running, finished and planned subagents with model, effort, task progress, context, estimated cost and time.

## Install

```bash
claude plugin install jimal-progress --marketplace JimalH/ai-workflow-kit
```

Desktop app: **+** → **Plugins** → **Add marketplace** `JimalH/ai-workflow-kit` → **Add plugin**. Disable the original `savvy-progress` if it is installed: both register `/agents-info` and would draw two bars.

## Tools it adds

- `mcp__jimal-progress__progress`: the main session reports title, phase, total and accepted tasks (`finished: true` at the end). Calls from subagents are ignored.
- `mcp__jimal-progress__step`: a subagent reports its own steps (`done`, `total`, `note`). Every subagent's brief gets a line asking for these reports (unless it already names the tool), so the bar moves without the parent writing it in.

Note: the savvy-flow skill calls `mcp__savvy-progress__progress` by name; with this fork, the tool is `mcp__jimal-progress__progress`.

Cost is a rough estimate from token counts and a built-in price table (`PRICES` in `hooks/register.tsx`), not a bill.

## Settings

`language`: `auto` (default), `en`, `ru` or `he`. `autoOpen`: `savvy` (default) or `any` (also opens the panel when any subagent starts). Set them in the plugin's config, or in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "jimal-progress": { "options": { "autoOpen": "any" } } } }
```

## Origin

- Upstream: https://github.com/JohnnyVizz/claude-kit, path `plugins/savvy-progress`
- Copied from commit `c871c153ead54ad9547cc717d0f3e5a676c73986` (savvy-progress 1.2.1)
- License: MIT, original `LICENSE` kept in this folder

Changes (1.3.0):

- Renamed to `jimal-progress` (plugin name, tool names, state keys).
- Desktop band width: computed at 7.6 CSS px per reported column (measured: 81 columns in a 615px slot at 175% scaling) instead of 8, minus the measured width of the `×N` and `✕` buttons plus a margin, and one more digit width per extra digit of the count. Before, the row overran its slot and the `✕` was cut off.
- Agents panel width uses the same 7.6 px per column.
- Test: the row SVG leaves room for both buttons at 60, 81 and 120 columns.

Changes (1.4.0):

- A finished flow counts down in its pill (`Done · 30s`) and leaves the band after 30 seconds; a new report before then keeps the new flow, and a reload keeps the countdown going.
- Tests: the countdown and a new flow arriving during it.

Changes (1.5.0):

- Tasks under the bar with their own bars and time left; `estimateMin` per task in the progress tool.
- Follows the session's task list (desktop plan tool, TodoWrite, wrap-up) when nothing reports a flow.
- Folds the task rows to one line when a message is sent during a flow; other bands drawn above the bar.
- Tests: following the task list, time left from averages and estimates, five rows and expanding, the wrap-up, folding.

Changes (1.5.1):

- The agents pane no longer goes blank ("jimal-progress has not drawn in this pane") when an agent record has no model: a spawn that left the model to the session's default stored `undefined`, and the pane threw on it. The record now stores an empty model, a step that names no model keeps the spawn's, and the readers take an empty model, type or description.
- A draw that still fails writes the error in the pane instead of leaving it to the engine's placeholder.
- Tests: a record without a model, and 84 records, draw on the terminal and the desktop.

Changes (1.6.0):

- Every subagent is told to report its steps through `mcp__jimal-progress__step`, not only the savvy-flow workers: a brief of an ordinary agent was not getting the line, so the panel showed the agent running or done but no bar. A brief that already names the tool is left as written.
- Tests: the line on a general-purpose agent and a savvy worker, and a brief that names the tool.
