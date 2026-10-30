import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const STEP_TOOL = 'mcp__jimal-progress__step'

// Spawns one subagent of `subagentType` with `prompt` and returns the prompt it was run with.
const spawned = async ($: Engine, on: On, subagentType: string, prompt: string): Promise<string> => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  let ran = ''
  on('agent.spawn', (_$, e) => {
    ran = (e as { prompt: string }).prompt
    return { model: 'claude-sonnet-5-5', agentId: 'a1' }
  })
  await $.agent.spawn({ tool_use_id: 't1', prompt, description: 'Some work', subagentType, provider: 'engine', parentModel: 'claude-sonnet-5-5', background: false, fork: false } as never)
  return ran
}

test('every subagent is told to report its steps, unless its brief already names the tool', async ($, on) => {
  const general = await spawned($, on, 'general-purpose', 'Read the tests and say what they cover.')
  expect(general.startsWith('Read the tests and say what they cover.')).toBe(true)
  expect(general).toContain(`call \`${STEP_TOOL}\` with \`total\``)
})

test('a savvy worker is briefed the same way', async ($, on) => {
  const savvy = await spawned($, on, 'savvy-careful', 'Fix the parser.')
  expect(savvy).toContain(STEP_TOOL)
})

test('a brief that already names the step tool is left alone', async ($, on) => {
  const brief = `Fix the parser. Report with ${STEP_TOOL} after each step.`
  expect(await spawned($, on, 'general-purpose', brief)).toBe(brief)
})
