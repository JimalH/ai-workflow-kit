# Mods

Claude Code mods shared across all machines and AI sessions. A mod changes Claude's own interface or behaviour: a pane beside the chat, a band above the prompt, a status line entry, a slash command, or a hook on tool calls / prompts.

This repository is a Claude Code plugin marketplace (`.claude-plugin/marketplace.json` at the root). Every mod listed there can be installed on any machine with one line.

## Layout

```
.claude-plugin/marketplace.json   # lists every published mod
mods/
  README.md                       # this file
  _template/                      # starting point for a new mod (not listed)
  <mod-name>/
    .claude-plugin/plugin.json    # name, version, description, author, license
    hooks/hooks.json              # { "modules": ["./register.tsx"] }
    hooks/register.tsx            # the hooks module (or register.ts)
    hooks/*.test.ts(x)            # optional tests (claude plugin test)
    types/index.d.ts              # only if the mod keeps values in $.state
    README.md                     # what it does, commands, settings, origin
    LICENSE                       # required when forked from someone else's mod
```

## Install a mod

In a terminal session, at the prompt:

```
/plugin install <mod-name> --marketplace JimalH/ai-workflow-kit
```

From a shell:

```bash
claude plugin install <mod-name> --marketplace JimalH/ai-workflow-kit
```

In the desktop app (where `/plugin` does not run): click **+** next to the prompt box → **Plugins** → **Add marketplace** with `JimalH/ai-workflow-kit` → **Add plugin**.

Update an installed mod after a new version is pushed: `claude plugin update <mod-name>`, then `/reload-plugins`.

## Add a new mod

1. In Claude Code, load the built-in `plugin-authoring` skill (`/plugin-authoring`) first: it has this build's API types, examples, and hot-reloads the mod in the session so it can be tried before it lands here. When it works, copy its folder to `mods/<mod-name>/` (without `.claude-plugin/types/`, which the engine generates). Without the skill, copy `mods/_template/` to `mods/<mod-name>/` and follow its README.
2. Add the entry to `.claude-plugin/marketplace.json`:
   ```json
   {
     "name": "<mod-name>",
     "source": "./mods/<mod-name>",
     "description": "Mod: <one line>",
     "version": "<same as plugin.json>",
     "category": "mod"
   }
   ```
3. `claude plugin validate mods/<mod-name>` must pass; run `claude plugin test mods/<mod-name>` if it has tests.
4. Bump `version` in both `plugin.json` and the marketplace entry on every change, or installed copies will not update.

## Forking someone else's mod

When a mod here is based on another author's mod:

- Check its license allows modification (e.g. MIT). If there is no license, do not copy it; ask the user.
- Keep the original `LICENSE` file in the mod folder, with the original copyright line.
- Give it a new `name` (e.g. `jimal-progress`, not `savvy-progress`) so it does not clash with the original if both are installed.
- In the mod's README, add an `## Origin` section: upstream repository URL, path, and the commit hash it was copied from, plus a short list of what was changed.
- Read every file before committing it; never commit code you have not seen.

## Safety

- Never commit keys, tokens, passwords, internal hostnames, or personal data in a mod.
- A mod that guards (denies tool calls, prompts, commands) must use `.catch(...)` so a failing hook refuses instead of silently allowing.
- Mods run inside every session that installs them: keep them small and readable.

## Index

| Mod | Description | Origin |
| --- | --- | --- |
| [jimal-progress](jimal-progress/) | Progress bar above the prompt with each open task and its time left; follows the task list; plus an agents panel | Fork of [savvy-progress](https://github.com/JohnnyVizz/claude-kit/tree/main/plugins/savvy-progress) @ `c871c15` (MIT) |
| [jimal-session](jimal-session/) | One line above the prompt: cache countdown, session/week time and usage left, the switches on; a Details fold with Keep warm, Auto-handoff (`handoff` skill), Fix English (proofread English prompts, marked in the reply and a pane) and Shape prompt (restructure the prompt with a small model); a `usage` tool so the model can read the limits, cache and cost in the CLI | Own; cache countdown idea from [session-band](https://github.com/JohnnyVizz/claude-kit/tree/main/plugins/session-band) (MIT) |
| [jimal-mods](jimal-mods/) | `/mods` panel: turn plugins and mods on and off, browse marketplaces and install | Own |
| [jimal-filetree](jimal-filetree/) | File tree (`/filetree`) marking the files Claude plans to change, is changing and has changed, with a legend; lines changed outside git | Fork of [filetree](https://github.com/data-goblin/claude-code-filetree) @ `6bc23f6` (MIT) |

## External plugins

Listed in the marketplace from their own repositories, pinned to a reviewed commit (no code copied here). To take a newer version: review its changes, then update the `sha` and `version` in `.claude-plugin/marketplace.json`.

| Plugin | Description | Source | Reviewed |
| --- | --- | --- | --- |
| filetree | IDE-style file tree pane: git status, lines changed, Claude's reads/writes/git activity (`/filetree`) | [data-goblin/claude-code-filetree](https://github.com/data-goblin/claude-code-filetree) (MIT) | `6bc23f6` (v0.5.2), 2026-10-28: no network or model calls, no settings writes; opening a file runs it with its default app; the selected file's path is added to each prompt |
