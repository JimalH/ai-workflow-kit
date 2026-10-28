# jimal-mods

A Claude Code mod: one panel to manage the plugins and mods installed on this machine.

- **Open it**: `/mods`; run it again, press Esc, or `✕` to close it. (A mod cannot add a button to the desktop app's own toolbar, nor see a click outside its panel.)
- **Installed** tab: one row per installed plugin: an icon (`◈` mod, `▣` plugin), its name, `mod|plugin · version · marketplace`, its description, and how to use it (its slash commands and skills, read from its own files), with an `On`/`Off` switch on the right (the app's primary button, its label dim while off) that runs `claude plugin enable|disable <id>`. The panel itself is listed without a switch.
- **Reload now**: after a change, runs `/reload-plugins` so this session picks it up; where a plugin may not run it, the panel says to run it or start a new session.
- **Marketplaces** tab: each configured marketplace with its repository, a `GitHub ↗` link and `Browse`, which lists its plugins not installed yet (most installed first, 15 at a time, with a filter) and installs one with `Install` (`claude plugin install <id> --scope user`).
- `↻` reads the lists again.

Everything goes through the `claude plugin` CLI on this machine, so the panel shows what `claude plugin list` shows.

## Install

```bash
claude plugin install jimal-mods --marketplace JimalH/ai-workflow-kit
```
