# mod-template

Template for a new mod in this kit. Not listed in the marketplace.

## Use

1. Copy this folder to `mods/<mod-name>/` (kebab-case name).
2. In `.claude-plugin/plugin.json`, set `name` to `<mod-name>`, reset `version` to `0.1.0`, and rewrite `description`.
3. Replace `hooks/register.ts` with the mod's behaviour (rename to `.tsx` if it draws UI, and update `hooks/hooks.json`).
4. Rewrite this README: what the mod does, its commands/settings, and its origin (see `mods/README.md` → Forking).
5. Add an entry to `.claude-plugin/marketplace.json` at the repository root.
6. Run `claude plugin validate mods/<mod-name>` before committing.
