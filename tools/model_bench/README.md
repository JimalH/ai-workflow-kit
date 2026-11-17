# model_bench

A small, repeatable test that gives the same coding task to several models through the
tools actually used (Claude Code, Codex CLI, dsh), measures time, tokens, cost and a hidden
acceptance check, and has two reviewers from different vendors score the work blind. It
feeds `MODEL_MAP.md` (AI rules Section 6). Run it every one to three months, or when a
model is taken into use or retired.

What it can and cannot tell you: the task is small, so it separates models on cost, speed,
edge handling and test depth, not on raw strength. Use public leaderboards for the order of
strength and this test to check it holds in your own tools.

## Files

| File | Purpose |
|---|---|
| `TASK.md` | The task every model gets: next run time of a cron expression, plus its own tests |
| `hidden/hidden_check.py`, `hidden/reference.py` | 80 hidden cases and the reference implementation they are checked against |
| `run_one.ps1` | One run: one tool, model and effort, in its own folder |
| `collect.py` | Table of time, tokens, cost, hidden check, own tests; `--judge` builds the blind package |
| `JUDGE.md` | The reviewers' brief (`{N}` and `{LAST}` are filled in by `collect.py`) |
| `results/` | One dated summary per test |
| `work/` | Run folders and logs; not committed |

## Steps

Windows, PowerShell 7. The Coordinator sets up one conda env for every run (AI rules
Section 2); the task needs only the standard library.

```bash
conda create -n model-bench python=3.13 -y
```

1. Start the runs, in parallel or one after another. One line per configuration; `-Effort`
   takes the tool's own level name (DeepSeek has no `medium`: `off`, `low`, `high`, `max`).

```bash
pwsh -File run_one.ps1 -Name codex-terra -Tool codex -Model gpt-6.1-terra -Effort medium -Round 2027-02
```

2. Collect the measurements and build the blind package.

```bash
conda run -n model-bench python collect.py 2027-02 --judge
```

   It must print `identity words in the blind package: 0`. If not, remove what it lists
   from `work/<round>/judge` before judging.

3. Give `work/<round>/judge-a` to a reviewer from one vendor and `judge-b` to a reviewer
   from another, each with the prompt "Read JUDGE.md in the current directory and do what
   it says." The reviewer must not see `work/<round>/runs` or `logs`: the names there are
   the models. Example for Codex, started inside `judge-a`:

```bash
codex exec -m gpt-6.1-sol -c model_reasoning_effort=medium -c approval_policy=never -s workspace-write --skip-git-repo-check -o ../verdict-a.md "Read JUDGE.md in the current directory and do what it says."
```

4. Check the reviewers' findings yourself before using them (a probe that reproduces each
   claimed bug), then write `results/<date>.md` and update `MODEL_MAP.md`.

## Notes

- Prices in `collect.py` (`PRICES`) are list prices per 1M tokens; keep them in step with
  `MODEL_MAP.md`. Claude's cost is the figure the CLI reports.
- Every run loads the user's global instruction file, so it also shows which models follow
  the standing rules.
- A reviewer tends to score its own vendor's work higher; read the two verdicts side by side.
- Claude Code has no sandbox on Windows; `run_one.ps1` allows it only file tools and
  `python`. Codex and dsh run in `workspace-write`.
