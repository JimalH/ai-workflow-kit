# jimal-session

A Claude Code mod: one band above the prompt with the session's clock and limits, plus two switches.

- **Cache**: `● cache warm`, then `● cache warm 24m` in the last half hour of the main conversation's 1-hour prompt cache (whole minutes), `● cache expired` after. Green above 20 minutes, amber from 20, red from 10, grey once expired. The band is one line of plain figures separated by `|`.
- **Usage**: `3h 62% · 4d 80%`: hours left in the 5-hour window and its usage left, then days left in the weekly window (hours once less than a day is left) and its usage left. Amber from 75% used, red from 90%. Shown on a subscription; `—` otherwise.
- **Switches**: `● Keep warm` / `● Auto-handoff`: a dot (green while on, grey while off) and a plain (frameless) label, dim while off; click the label to toggle. They exclude each other: while one is on, the other is hidden and its room goes to the figures. Auto-handoff sits at the right end and never moves. When the row is short, the figures give way one at a time (the note, the week, the 5-hour window, then the cache line shrinks to its minutes); the switches keep their place.
- **Keep warm** (off by default): when the cache has one minute left (59 minutes after the last request) and nothing is running, the mod sends one hidden forked request over the conversation, which reads it from the cache and refreshes it for another hour. Nothing is added to the transcript, but each refresh costs a cache read of the whole context and counts toward usage limits.
- **Auto-handoff** (off by default): in the cache's last minute, the mod asks a hidden forked request to write a handover note with the `handoff` skill, and saves it to `~/.claude/handoffs/<project-key>/<YYYYMMDD-HHMMSS>-<session>.md` (`<project-key>`: the project root with every non-alphanumeric character replaced by `-`, e.g. `E--AI-workflow`).
  - Right after it is saved, still in the cache's last minute, the note replaces the old context as a compaction that the mod answers itself: no model request reads the transcript again, and the old messages stay on screen.
  - The next prompt in this session starts from the note, and uses it up (the file is deleted automatically).
  - The first prompt of a new conversation in the same project starts from the newest note left there (prepended to the prompt), and deletes it.
  - Notes older than 30 days are deleted when a session starts. No note found: everything works as without the mod.

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
