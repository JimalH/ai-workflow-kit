# jimal-progress

A Claude Code mod: a progress bar above the prompt and a live panel of subagents. Fork of [savvy-progress](https://github.com/JohnnyVizz/claude-kit/tree/main/plugins/savvy-progress) by johnnyvizz (MIT).

- **Progress bar**: the flow's title, phase, accepted tasks out of planned, and a `×N` button with the crew size that opens the panel. It appears once something reports progress (`mcp__jimal-progress__progress`, or the savvy-flow skill) or a `savvy-*` worker starts. A finished flow shows `Done · 30s`, counts down and leaves by itself; `✕` dismisses it at any time. On the desktop the bar takes the space the row has left, so the `×N` and `✕` buttons always stay inside it.
- **Agents panel** (`/agents-info` toggles it; `/agents-info open` opens it or brings it forward): running, finished and planned subagents with model, effort, task progress, context, estimated cost and time.

## Install

```bash
claude plugin install jimal-progress --marketplace JimalH/ai-workflow-kit
```

Desktop app: **+** → **Plugins** → **Add marketplace** `JimalH/ai-workflow-kit` → **Add plugin**. Disable the original `savvy-progress` if it is installed: both register `/agents-info` and would draw two bars.

## Tools it adds

- `mcp__jimal-progress__progress`: the main session reports title, phase, total and accepted tasks (`finished: true` at the end). Calls from subagents are ignored.
- `mcp__jimal-progress__step`: a subagent reports its own steps (`done`, `total`, `note`).

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
