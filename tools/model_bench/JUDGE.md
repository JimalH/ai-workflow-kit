# Judging brief

You are an independent reviewer. {N} agents (`A` to `{LAST}`, identities hidden) each did the task in `TASK.md`, alone, in the directory of the same letter. `RESULTS.md` holds what was measured: wall time, token use, cost, the hidden acceptance check, each agent's own test run, the files each created, and each agent's final message.

Do this:
1. Read `TASK.md` and `RESULTS.md`.
2. Read `cronnext.py` and `test_cronnext.py` in every directory in full. You may run Python (`python -m unittest`, or your own probes) to check a claim. Do not edit the submissions, do not create environments, do not install packages.
3. Judge each agent on: whether the task is complete; correctness beyond the hidden check (look for cases it misses); code quality (clarity, structure, how it meets the 0.5 s limit); the quality of its own tests (do they cover the tricky rules, or only the easy ones); whether it kept to the instructions (two deliverables, work only in its directory, anything extra it created); and whether its final message is accurate.
4. Comment on each agent's time, token use and cost relative to the others.

Your final message must be exactly this, and nothing else:
- one JSON array with {N} objects, in a ```json block, each: {"label": "A", "complete": true, "quality": 0-10, "overall": 0-10, "strengths": "...", "weaknesses": "...", "time_tokens": "..."}
  - `quality` scores the work only (code, tests, instruction-following), ignoring time, tokens and cost.
  - `overall` also weighs time, token use and cost.
  - `complete` is false only for a demonstrated violation of `TASK.md`, not for an input far beyond what it describes.
  - Use the whole scale; do not give every agent the same score. Each text field is at most two sentences.
- then a ranking line: `Ranking: X > Y > ...`
- then at most five sentences on what most separated the agents.

## Context you need

Every agent also had the owner's standing global rules loaded. Depending on the rules version, an agent may have written a changelog entry in `.memory/CHANGELOG.md`; that is following those rules, and leaving it out is following `TASK.md` narrowly. Mention which each did, but do not treat either choice by itself as a failure.
