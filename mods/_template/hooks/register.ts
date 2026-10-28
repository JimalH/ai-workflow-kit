import type { Register } from 'claude-code'

// Minimal mod: registers one slash command that answers with a line of text.
// Replace the command name and body with the mod's real behaviour.
const COMMAND = 'mod-template'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Template mod: confirms the mod is loaded',
    })

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => ({
    text: `${$.plugin.name} is loaded.`,
  }))
}
