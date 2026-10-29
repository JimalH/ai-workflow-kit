# jimal-session

A Claude Code mod: one band above the prompt with the session's clock and limits, the switches that are on, a `Handoff all` button and a `Details` fold with every switch; plus two prompt features, Fix English and Shape prompt.

- **Cache**: `● cache cold` before the first answer, `● cache warm`, then `● cache warm 24m` in the last half hour of the main conversation's 1-hour prompt cache (whole minutes), `● cache expired` after. Grey before the first answer and once expired; green above 20 minutes, amber from 20, red from 10. The band is one line of plain figures separated by `|`.
- **Usage**: `3h 62% · 4d 80%`: hours left in the 5-hour window and its usage left, then days left in the weekly window (hours once less than a day is left) and its usage left. Amber from 75% used, red from 90%. Shown once a reading comes in (on a subscription, after the first answer); left out until then.
- **Middle of the row**: the switches that are on (`● Auto-handoff  ● Fix English  ● In pane`), scrolled one cell a second when they do not fit the 36 cells; while a feature works, its own line stands there instead, amber and counted (`◷ Fix English · checking… 3s`, `◷ Shape prompt · 整理中… 2s`, `◷ Handoff · writing note…`). When the row is short, the figures give way one at a time (the middle, the week, the 5-hour window, then the cache line shrinks to its minutes); the buttons keep their place.
- **Details**: a plain button at the right end that unfolds the switches under the row, one bordered box a group, each switch a row with its name at the left and a native `On` / `Off` button at the right; the boxes stand in a row and wrap when it is short. `Session`: Keep warm, Auto-handoff (they exclude each other: turning one on turns the other off). `Prompt`: Fix English with In reply and In pane under it (dim and inert while Fix English is off), then Shape prompt. The fold and the prompt switches are kept across sessions.
- **Fix English** (off by default): a prompt written in English (four words or more, no CJK script) is proofread by a small model (`haiku`, low effort) while the submission waits a second or two. What changed is marked word by word; a prompt that was already right changes nothing. `In reply`: the corrections ride beside the prompt as context, with the instruction to open the reply with a `**Prompt check**` block (`~~teh~~ **the**`), a `---` rule, and only then the answer, for a remote screen that shows the transcript alone. `In pane`: a `Prompt check` pane opens with the corrected prompt, removed words red and struck through, added ones green.
- **Shape prompt** (off by default): the prompt is restructured by the small model (Goal / Context / Constraints / Deliverable / Done when; in Chinese, 目标 / 背景 / 约束 / 产出 / 完成标准) without adding anything, and the structured version goes to the main model as the prompt, the original wording beside it as context; the transcript shows what you typed. A shaped prompt is not proofread again. A failed call sends the prompt as typed, with a toast. Slash commands, meta prompts, prompts another plugin submits and a loaded handover note are never touched.
- **Handoff all**: a plain button before `Details`. One press, and every open session on this machine (this one too) writes its own handover note and lets it replace its context, as the auto-handoff does, once its current turn is over: press it before closing the app, wait for each band to show `note applied`, then close. It works through a request file (`~/.claude/handoffs/handoff-all.request`, holding the time of the press) that each session checks every 5 seconds; a request older than a session's start, or older than 10 minutes, is left alone, and a session whose note is already applied and not yet used does not write another. Sessions that have no answer yet have nothing to write from and stay quiet.
- **Idle compaction**: Claude Code's own idle compaction (`idleCompaction` in settings.json) fires at 90% of the cache's life, about 54 minutes after the last turn, before this mod's last minute; in its `compact_on_return` mode it writes a summary while you are away and swaps it in at your next prompt, over the handover note. The band asks once per machine, in an amber line above the figures, `Keep on` or `Turn off`: `Turn off` writes `"idleCompaction": false` into `~/.claude/settings.json` (new sessions use it); either answer is kept in the plugin store and the question is not asked again. A setting already off is not asked about.
- **Keep warm** (off by default): when the cache has one minute left (59 minutes after the last request) and nothing is running, the mod sends one hidden forked request over the conversation, which reads it from the cache and refreshes it for another hour. Nothing is added to the transcript, but each refresh costs a cache read of the whole context and counts toward usage limits.
- **Auto-handoff** (off by default): in the cache's last minute, the mod asks a hidden forked request to write a handover note with the `handoff` skill, and saves it to `~/.claude/handoffs/<project-key>/<YYYYMMDD-HHMMSS>-<session>.md` (`<project-key>`: the project root with every non-alphanumeric character replaced by `-`, e.g. `E--AI-workflow`).
  - Right after it is saved, still in the cache's last minute, the note replaces the old context as a compaction that the mod answers itself: no model request reads the transcript again, and the old messages stay on screen.
  - The next prompt in this session starts from the note, and uses it up (the file is deleted automatically).
  - If the compaction is refused, a toast says why and the band shows `note not applied`: the session keeps its own context, and the note file is kept for a new conversation in the project.
  - The first prompt of a new conversation in the same project starts from the newest note left there (prepended to the prompt), and deletes it.
  - Notes older than 30 days are deleted when a session starts. No note found: everything works as without the mod.
  - Closing the app: the host does not wait for a mod's `session.end` hook (not even a few seconds), so no note can be written on the way out. Press `Handoff all` first.

## Commands

`/prompt-check`: open the Prompt check pane with the last corrections Fix English found.

`/handoff-now`: write a handover note now and let it replace this conversation's context (old messages stay on screen); the reply says whether it worked and, if not, why. Try it first in a conversation you do not need.

## Skill

`handoff` (`/jimal-session:handoff`): writes a handover note on demand and saves it to the same folder.

## Install

```bash
claude plugin install jimal-session --marketplace JimalH/ai-workflow-kit
```

## Notes

- The plugin API cannot delete files, so used and expired notes are deleted with the host's own command (`del` on Windows, `rm` elsewhere).
- Cache lifetime is assumed to be 1 hour (what Claude Code writes on a subscription). The cache countdown idea follows [session-band](https://github.com/JohnnyVizz/claude-kit/tree/main/plugins/session-band) by johnnyvizz (MIT); no code was copied.

## Changes (0.2.0)

- One line of plain figures between bars: `● cache warm 24m | 1h 95% · 13h 18%`; the cache minutes show only in the last half hour.
- Usage as time left and usage left per window; the week in hours once less than a day is left.
- Switches as a coloured dot and a plain label; exclusive, Auto-handoff fixed at the right end, a hidden switch's room given to the figures.
- A short row drops the figures one at a time instead of moving the switches.
- Auto-handoff compacts with the note right after writing it, in the cache's last minute.

## Changes (0.2.1)

- An empty usage reading (before the first answer, a reload) no longer wipes the figures.
- No reading yet: the usage is left out instead of shown as dashes; the cache line reads `cache cold`, in grey.

## Changes (0.3.0)

- A refused compaction is reported (toast, `note not applied` in the band, the reason in the debug log) instead of being silent, and the note is no longer deleted as if it had been used.
- `/handoff-now`: the auto-handoff on demand, with its outcome.

## Changes (0.3.1)

- `/handoff-now` applies its note from a timer once the command has ended (the host refuses a compaction under the command that asks for it); a toast says whether it worked.
- The note prompt leaves out the handoff skill's saving step: the fork has no tools, and its notes ended with a request to save them by hand.
- In a resumed conversation before its first message, `/handoff-now` says it needs one message first instead of `nothing-to-fork`.

## Changes (0.3.2)

- In a headless or SDK session (the desktop app runs as one) the engine refuses a mod's compaction; the note is then applied through a `/compact` prompt, which this mod answers with the note.

## Changes (0.3.3)

- The fallback runs `/compact` with `$.command.run` (the engine refuses a mod's prompt that starts with `/`).

## Changes (0.3.4)

- Quiet handoff: `/compact` carries only the short mark `jimal-session handoff`; the note waits in the mod and is not shown in the chat.
- What the mod says around a note follows the note's language (a Chinese note gets a Chinese frame, reply and toasts), so the conversation does not drift back to English.

## Changes (0.4.0)

- `Handoff all` button: one press, and every open session on this machine writes and applies its own handover note (through a request file each session polls), for use before closing the app.
- Asks once, in the band, whether to turn Claude Code's idle compaction off: it fires before the auto-handoff and its summary overrides the note on return. `Turn off` writes `"idleCompaction": false` to `~/.claude/settings.json`.
- The band says `note applied` once a note has replaced the context.

## Changes (0.4.1)

- A new note deletes every older note this session wrote (by the session id in the file name), not only the one remembered in memory: a plugin reload forgot it, and the stale note was left for the next conversation to load.

## Changes (0.5.0)

- jimal-prompt folded in: Fix English (In reply / In pane) and Shape prompt, with the `Prompt check` pane and `/prompt-check`.
- The band's row: the switches that are on listed in the middle, scrolled when long; a feature at work shows its own line there, counted in seconds.
- `Details` fold at the right end: the switches in bordered boxes by group, each a native On/Off button; Keep warm and Auto-handoff now exclude each other by turning the other off rather than hiding it.

## Changes (0.5.1)

- A Details box grows to its content instead of a fixed width: a native On/Off button is wider than its label, and overlapped the border.
- The middle of the row shrinks to the room the figures leave (down to 12 cells) before it is dropped; the scrolled window follows that width.

## Changes (0.5.2)

- A Details row gives its native On/Off button a slot of 8 cells, as the desktop draws it wider than its label: no more overlap with the border.
- The middle of the row (the switches on) now outranks the usage figures when the row is short: the week goes first, then the 5-hour window, and the middle keeps at least 8 cells.

## Changes (0.5.3)

- The middle of the row is a surface module of its own (`hooks/middle.tsx`): the list of switches on slides one cell every 350 ms when it does not fit, and the working line has a band of light sweeping over it (90 ms a frame), with no redraw of the band. It is one row high, so a narrow window no longer wraps it and makes the row jump.
- A Details box has a fixed height from its rows (title, rows, border).

## Changes (0.5.4)

- A Details row is two cells high: a native On/Off button is taller than a text row, and rows of one cell overlapped each other.
- The middle of the row takes the room left between the figures and the buttons as the surface measures it, instead of a width computed from `bodyColumns`, which the desktop reports smaller than the row is.
- Shape prompt leaves an aside alone: the small model is told to give a non-task back unchanged, and a reply that is not shaped (no Goal / 目标 heading, or an explanation) sends the prompt as typed.

## Changes (0.5.4)

- A Details row is two cells high: a native On/Off button is taller than a text row, and rows of one cell overlapped each other.
- The middle of the row takes the room left between the figures and the buttons as the surface measures it, instead of a width computed from `bodyColumns`, which the desktop reports smaller than the row is.
- Shape prompt leaves an aside alone: the small model is told to give a non-task back unchanged, and a reply that is not shaped (no Goal / 目标 heading, or an explanation) sends the prompt as typed.

## Changes (0.5.5)

- A Details box sizes to its rows again (the fixed height left a blank row), and its title is bold.
- The spacer between the figures and the buttons no longer grows, so the middle gets the row's spare room.
