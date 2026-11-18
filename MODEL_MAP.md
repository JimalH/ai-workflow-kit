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
| Coordination: talking to the user, briefs, checking results | Claude Code (main session) | the session's default model (Claude Fable 5.2 today) | default | Claude Opus 5.5, when Fable's limit keeps cutting work short; the user decides the switch |
| Hard design; code where a mistake is costly | Claude Code (subagent) | Claude Fable 5.2 | high | Claude Opus 5.5 at high; tell the user |
| Research, reading code, routine implementation | Claude Code (subagent) | Claude Sonnet 5.5 | medium | Codex CLI, gpt-6.1-terra, medium |
| Routine implementation with a pinned spec (interfaces, allowed files and acceptance commands written in the brief) | dsh, alongside the row above | deepseek-flash | low | Claude Sonnet 5.5, medium |
| Mechanical work: scaffolding, config, running tests and reporting | Claude Code (subagent) | Claude Haiku 5.5 | low | dsh, deepseek-flash, low |
| Token-heavy bulk work; long unattended runs | dsh | deepseek-flash | low | Claude Haiku 5.5 |
| Review of work written by a Claude model | Codex CLI | gpt-6.1-sol | medium | Claude Opus 5.5 (then not an independent review; say so) |
| Review of work written by Codex or DeepSeek | Claude Code (subagent) | Claude Opus 5.5 | medium | Claude Sonnet 5.5 |

DeepSeek as implementer (the user's decision, 2026-11-18, after the two-task trial under
Evidence): `deepseek-flash` takes implementation work next to Claude Sonnet, on these terms.

- The brief pins everything: interfaces, the files it may touch, the acceptance commands.
  Where a brief was ambiguous or contradicted itself, it followed the letter or its own
  reading, did not check the stated goal, and did not report the conflict (both trial tasks).
- Its work is reviewed by a model from another vendor (the "Review of work written by Codex
  or DeepSeek" row), and its report is checked ("Verify always" below).
- A brief with open decisions, or work that needs judgement about intent, goes to Sonnet.

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
| Claude | subscription | Claude Fable has its own limit and is cut off while the weekly window still has most of its room | Fable: coordination (the user's choice, 2026-11-18) and the "hard design" row, nothing routine. Window: at about 70 % move routine and mechanical work to Codex and DeepSeek; stop at about 90 % |
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
- dsh argument order: the profile name comes first (`dsh headless --patch ...`);
  `dsh --patch <file> headless ...` fails with "--profile <name> is required".
- dsh token use: sum the `usage` of every `{"type":"status","phase":"step_end"}` event in
  the `--json` output.

### dsh on Windows: where `<DIR>` may be

Found and tested on PC1, 2026-11-18, dsh 0.2.2-rc.1; not re-tested on the other machines.

- In some folders every shell call inside dsh fails with
  `SetNamedSecurityInfoW failed (Win32 5): grantWrite(<DIR>)`: before each shell command the
  sandbox adds its own permission entry to the folder, and the folder refuses it. File tools
  still work, so the model writes code but never runs it, and the run still exits 0: check
  that the tests ran, not just the exit code.
- Which folders are affected cannot be told from the permission list (on PC1 `C:\tmp\...`
  failed, `C:\MetaTrader 5\MQL5` and folders under the user profile worked). Test the folder
  before real work: start in it and run
  `dsh headless --json --approval-policy never "Run the shell command Get-Location once and reply with exactly what it printed. Do nothing else."`,
  then look for a `tool_result` with `"status":"completed"`.
- An affected folder: work in another folder. That needs no permission change and is the
  first choice.
- Only when the work must happen in the affected folder: dsh's bundled repair script
  (`...\@deepseek-ai\dsh-sandbox-windows-acl\assets\diagnose-windows-sandbox-acl\scripts\diagnose-windows-sandbox-acl.ps1 -Path <DIR> -AllowRoot <DIR or allowed parent> -Out <backup folder under the user profile>`),
  run once in a normal, never elevated, PowerShell outside dsh. It adds a Full Control entry
  for the signed-in user on that one folder, backs up first and prints the restore command;
  read its `SUMMARY` and `VERDICT` lines. It changes Windows file permissions, so it needs
  the user's approval. As PC1 relayed the user's instruction for the backtest machines:
  allowed under `C:\MetaTrader 5`, never for system files or folders, anything else ask first.
- Git Bash does not start inside the sandbox. Give acceptance commands as direct interpreter
  calls (`python -m pytest ...`), not as `bash script.sh`.
- `dsh headless` has no approval channel: the model inside dsh cannot get an escalation
  approved. The session that starts dsh does the test and, where approved, the repair.
- `--permission-mode danger-full-access` is not the default: credentials and running
  processes (backtests, MT5) are within its reach. Only for a named task, after telling the
  user.
- dsh leaves two permission entries on any folder it works in (a deny on
  delete-subfolders-and-files for Everyone, and a grant for its sandbox identity). Do not
  point it at a synced project folder without the user knowing that.

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

Trial on real work (2026-11-18, the MQL5 project; run and reported by the PC1 session, not
part of `tools/model_bench/`):

- Two tasks from the project's to-do list (a port of chart functions from a prototype; a
  backend split of a catalogue with a new CLI option), each given as one written brief to
  `deepseek-flash` at `low` and to Claude Sonnet 5.5 at `medium` in separate copies. Two
  reviewers scored both blind (Codex `gpt-6.1-sol` and Claude Fable 5.2), out of 100.

  | Task | deepseek-flash (Codex / Fable) | Sonnet 5.5 (Codex / Fable) |
  |---|---|---|
  | Chart-function port | 79.5 / 73.5 | 85.0 / 81.5 |
  | Catalogue split | 80.5 / 75.8 | 88.25 / 83.0 |

- Both passed the acceptance commands and the coordinator's own spot check on both tasks.
  DeepSeek: 3.3 M and 3.9 M tokens (almost all cache reads), about $0.10 and $0.09 at peak
  rates, 5 and 8 minutes. Sonnet: about 0.1 M tokens as reported by the tool, 4 and 5 minutes.
- In both merges the Sonnet version was the base and parts of the DeepSeek version were
  taken (input guards, cleaner row construction, several tests).
- Limits: two tasks, one run each. In the first task DeepSeek could not run any command
  (the Windows sandbox point above) and wrote blind; in the second it could not use the
  bash wrappers. The Sonnet token figure has no input / output breakdown.

## Refreshing this file

1. A model is taken into use or retired, or the re-test date has passed.
2. Check the leaderboards above for the new model and effort level; note score and date.
3. Run `tools/model_bench/` for the models in the map (its README has the steps) and add the
   results file.
4. Update the rows, the prices, "Last updated" and "Next re-test due"; commit.
