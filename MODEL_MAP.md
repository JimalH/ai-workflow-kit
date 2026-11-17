# Model Map

Last updated: 2026-11-18
Next re-test due: by 2027-02 (every one to three months, or when a model is taken into use or retired)

Which tool, model and reasoning effort fills each tier of the AI rules (Section 6, Model
Assignment). The rules hold the principles; this file holds the names. Edit it whenever
needed; it does not change the rules version. A project's own mapping in
`PROJECT_MEMORY.md` wins over this file.

## Map

| Work | Tool | Model | Effort | When the first choice is short of quota |
|---|---|---|---|---|
| Coordination: talking to the user, briefs, checking results | Claude Code (main session) | Claude Opus 5.5 | default | Claude Sonnet 5.5 |
| Hard design; code where a mistake is costly | Claude Code (subagent) | Claude Fable 5.2 | high | Claude Opus 5.5 at high; tell the user |
| Research, reading code, routine implementation | Claude Code (subagent) | Claude Sonnet 5.5 | medium | Codex CLI, gpt-6.1-terra, medium |
| Mechanical work: scaffolding, config, running tests and reporting | Claude Code (subagent) | Claude Haiku 5.5 | low | dsh, deepseek-flash, low |
| Token-heavy bulk work; long unattended runs | dsh | deepseek-flash | low | Claude Haiku 5.5 |
| Review of work written by a Claude model | Codex CLI | gpt-6.1-sol | medium | Claude Opus 5.5 (then not an independent review; say so) |
| Review of work written by Codex or DeepSeek | Claude Code (subagent) | Claude Opus 5.5 | medium | Claude Sonnet 5.5 |

Not used:

- `deepseek-v4-pro`: last in both public leaderboards below and in both rounds of the kit's
  test; slower and no better than `deepseek-flash`.
- DeepSeek at effort `high`: slower and dearer than `low`, with worse results in the test.
  DeepSeek has no `medium`; its levels are `off`, `low`, `high`, `max`.

Verify always (the report is never accepted without the Coordinator's own checks):

- DeepSeek models. In the test their final messages claimed coverage the tests did not have.
- Any model's claim of "independent review passed" inside its own run.

## Quota

| Plan | Kind | What runs out first | Ceiling for delegated work |
|---|---|---|---|
| Claude | subscription | Claude Fable has its own limit and is cut off while the weekly window still has most of its room | Fable: only the "hard design" row. Window: at about 70 % move routine and mechanical work to Codex and DeepSeek; stop at about 90 % |
| Codex | subscription, shared with the user's own assistant use | the weekly window | about 80 %; usage cannot be read from the CLI, so ask the user before a batch the size of a milestone |
| DeepSeek | pay per token, prepaid | the balance | none set; a small task costs a few cents |

## How to call each tool without a user

`<DIR>` is the folder the model may write to; it is also the folder the command starts in.

| Tool | Command |
|---|---|
| Claude Code | `claude -p "<task>" --model <id> --effort <level> --output-format json --permission-mode acceptEdits --allowedTools ...` (allow only the tools the task needs) |
| Codex CLI | `codex exec --json -m <id> -c model_reasoning_effort=<level> -c approval_policy=never -s workspace-write -C <DIR> "<task>"`; a review uses `-s read-only` |
| dsh | `dsh headless --json --approval-policy never --patch <patch.yml> "<task>"`, started in `<DIR>`; the patch sets `model` and `reasoningEffort` on the `agent-default-model` entry; continue a session with `--session-id <id>` |

- Model ids: `claude-fable-5-2`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`,
  `gpt-6.1-sol`, `gpt-6.1-terra`, `deepseek-flash`.
- All three read a global instruction file that points to the AI rules: `~/.claude/CLAUDE.md`,
  `~/.codex/AGENTS.md`, `~/.dsh/AGENTS.md`. Project rules go in `AGENTS.md` at the project
  root (dsh also reads `CLAUDE.md`; Codex does not by default).
- Write limits: Codex and dsh write only inside `<DIR>` in `workspace-write` (add folders
  with `--add-dir`). Neither limits reading, and dsh does not limit the network.

## Prices (USD per 1M tokens)

Read 2026-11-17. Subscriptions are not billed this way; the figures show what the same
tokens would cost through the API.

| Model | Input | Cached input | Output | Source |
|---|---|---|---|---|
| gpt-6.1-sol | 2.00 | 0.10 | 10.00 | https://developers.openai.com/api/docs/pricing (standard tier, up to 272K input) |
| gpt-6.1-terra | 1.00 | 0.05 | 5.00 | same |
| deepseek-flash | 0.15 | 0.003 | 0.60 | https://api-docs.deepseek.com/quick_start/pricing (off-peak; peak is double, Mon-Fri 01:00-04:00 and 06:00-10:00 UTC) |
| deepseek-v4-pro | 0.66 | 0.022 | 1.98 | same |
| Claude models | - | - | - | cost is reported by `claude -p --output-format json` (`total_cost_usd`) |

## Evidence

Order of strength, from public leaderboards (read 2026-11-17; scores at the highest effort):

| Model | Artificial Analysis Intelligence Index | Snorkel coding leaderboard (of 16) |
|---|---|---|
| Claude Fable 5.2 | 65 | not listed (Fable 5.1: 3rd) |
| Claude Opus 5.5 | 59 | 1st |
| gpt-6.1-sol | 55 | 7th |
| gpt-6.1-terra | 51 | not listed |
| DeepSeek V4.1 Flash | 33 | not listed |
| DeepSeek V4 Pro | 23 | 14th |

- https://artificialanalysis.ai/leaderboards/models
- https://snorkel.ai/leaderboard/swe-bench-cli/
- Reasoning effort: https://www.vals.ai/blogs/reasoning-effort (lower effort cuts cost much
  more than score), https://www.emergentmind.com/papers/2610.34491 (every model tested
  regressed somewhere between its lowest and highest effort).

The kit's own test (`tools/model_bench/`, results in `tools/model_bench/results/`):

- 2026-11-17, one small coding task, one run per configuration, two blind reviewers. Every
  model passed the hidden check except `deepseek-v4-pro` at `high` (78/80). On a task this
  small `deepseek-flash` at `low` (about $0.02) matched the quality scores of the Claude and
  Codex models; the leaderboards separate them on harder work.
- The Codex reviewer ranked the Codex submissions first in both rounds and gave its own
  model's work 9 and 10 where the other reviewer gave 7. Hence "review crosses vendors".
- Limits of this evidence: one task, one run each; the same model's score moved by one to
  two points between rounds.

## Refreshing this file

1. A model is taken into use or retired, or the re-test date has passed.
2. Check the leaderboards above for the new model and effort level; note score and date.
3. Run `tools/model_bench/` for the models in the map (its README has the steps) and add the
   results file.
4. Update the rows, the prices, "Last updated" and "Next re-test due"; commit.
