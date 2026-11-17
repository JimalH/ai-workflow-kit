# Project AI Rules (Tool-Agnostic)

Version: v1.8
Last Updated: 2026-11-18

## 0) Default

- Read this file first. If uncertain, ask; do not guess.
- Goal: safe, reversible changes with full traceability.
- Prompt echo (default): for every new request from chat, restate the user's prompt once in 1-2 lines before planning or execution.
- Requirement clarification gate: after the user states a requirement, you may ask clarifying questions back to confirm it. Once you are confident you fully understand the intended outcome, confirm that understanding with the user, and only begin making changes after the user gives an explicit go-ahead.
- Runs with no user to answer (a subagent, a headless or scheduled run): the brief is the go-ahead. Do not echo the prompt or wait for confirmation; if the brief is unclear, do the part that is clear and report what was left and why.

## 1) Safety (Hard Rules)

- Secrets/Sensitive: never request, print, or store API keys/tokens/passwords/private keys/certs, personal data, or business secrets. If encountered, stop and alert the user.
- High-risk operations: do not perform mass delete/overwrite, history rewrite, permission sweeps, running unknown scripts, or touching production. If truly needed: explain risk + get explicit user approval.
- Compliance: no unauthorized access, auth bypass, malware/backdoors, covert data exfiltration.

## 2) Conda / Environment (Hard Rules)

> Purpose: a project can be moved to another machine easily, and nothing a project needs
> leaks into the environment the machine is normally used with.

- Each project must use a dedicated conda env (project isolation).
- Never install packages in `base` (conda/pip both forbidden).
- Any dependency change must:
  - happen in the project env; and
  - be recorded in the project's change record (Section 3; env name + add/upgrade/remove list).
- The Coordinator owns the environment: it names the env, creates and configures it, and
  states it in every brief (the env name and how to run in it).
- Implementers, Reviewers and Testers do not create environments and do not install
  packages. One that needs something the env lacks stops and reports it to the Coordinator,
  who changes the env.
- Work that runs the same task in several tools or models (a comparison, a benchmark) uses
  one env for all of them, set up by the Coordinator before the first run.

## 3) Change Logging (Single Project Log File)

- Every change has a change record (code/docs/config/memory/rules updates). Where it goes:
  - Project tracked by git (local commits, with or without GitHub): the commit is the
    change record. Write the commit message so it can stand alone (what changed and why;
    checks run; env changes). No changelog file is kept; if one exists from earlier, leave
    it as history and stop adding to it.
  - Project not tracked by git: `<PROJECT_ROOT>/.memory/CHANGELOG.md`, in the format below.
- Wherever these rules say "`CHANGELOG.md` updated" or "read the changelog", a git-tracked
  project reads that as "committed" and "`git log`".
- Use one project changelog file only: `<PROJECT_ROOT>/.memory/CHANGELOG.md`.
- Update policy: newest entry first (prepend below header).
- Validation: reviewers may read only header + first entry.

### `CHANGELOG.md` format

- Stable short header. Entry boundary uses `---`.
- Read/write changelog files in UTF-8. Prefer UTF-8 without BOM.
- Entry template:

---

Time: <YYYY-MM-DD HH:MM +/-TZ>
AI: <Claude|Codex|DeepSeek|Antigravity|Other>   # if multiple, comma-separate
Request: <1-2 lines>
Tags: `<tag1>`, `<tag2>`, `<tag3>`   # 3-6 tags; at least 2 low-frequency tags (module/file/error/feature)
Actions:

- <1-3 bullets>
  Files:
- `<path>` - `<key change>`
  Checks: <what was verified / None>
  Memory: <PROJECT_MEMORY updated / reviewed-no-change / N/A>
  Risk: <Low/Med/High + brief reason or N/A>

---

## 4) ROS File Change Log (Only when using ROS for execution/validation)

- If implementation or validation is explicitly based on a user-provided ROS file:
  - still update `<PROJECT_ROOT>/.memory/CHANGELOG.md`, AND
  - also update that ROS file's internal change log.
- ROS change log rule:
  - Keep `## Change Log` at the end of the ROS file.
  - Insert new log entries at the top of that section (newest-first).

## 5) Project Memory (File-based, MUST be at Project Root)

> Purpose: cross-AI durable context. Memory is always in the project root so any tool/AI can find it.

### 5.1 Define Project Root (must be determinable)

Project Root is the directory that satisfies the first applicable rule:

1) the nearest parent directory containing `.git/`; else
2) the directory containing this rules file (or `CLAUDE.md` / `AGENTS.md` / `AI_RULES.md`).
   If Project Root cannot be determined reliably: ask the user before writing memory.

### 5.2 Memory Location (Hard Rule)

- Memory directory is **always**: `<PROJECT_ROOT>/.memory/`
- Never create `.memory/` in subdirectories.
- All tools/agents must read/write the same root `.memory/` only.
- Read/write memory files in UTF-8. Prefer UTF-8 without BOM.

### 5.3 Memory Files

- `<PROJECT_ROOT>/.memory/PROJECT_MEMORY.md`
  - Long-term memory (stable facts/decisions/conventions/common commands/preferences).
  - "Latest truth wins": overwriting/rewriting allowed to keep it clean and non-contradictory.
- `<PROJECT_ROOT>/.memory/CHANGELOG.md`
  - Unified working memory + change log (append by prepending newest entry).
  - No daily memory files.

### 5.4 Read Rules (start of work)

- Read `<PROJECT_ROOT>/.memory/PROJECT_MEMORY.md` first if it exists (do not skip).
- If `<PROJECT_ROOT>/MODULE_MAP.md` exists, read it next and follow the read protocol in Section 9.
- Read top N newest entries from `<PROJECT_ROOT>/.memory/CHANGELOG.md` (default N=20); in a
  git-tracked project read the newest N commits instead (`git log -N`).
- If more context is needed, run grouped fuzzy retrieval:
  - AI generates 2-3 keyword groups, each group has 2-4 keywords.
  - Each group must include at least one specific token (module/file/error/feature/task id).
  - A log entry matches only when it hits at least 2 keywords in the same group (AND-like), not a single keyword.
  - Avoid generic-only groups (e.g., `project`, `update`, `fix`).

### 5.5 Write Rules (end of a stage/day)

- Stable/reusable info -> update `PROJECT_MEMORY.md` (rewrite allowed).
- Process notes/todos/decisions/major edits -> add one entry to `CHANGELOG.md`.
- After each prompt is completed and `CHANGELOG.md` is updated, review the current chat/request and the actual changes from this prompt to decide whether `PROJECT_MEMORY.md` should be added or edited.
- If the answer is yes, edit `PROJECT_MEMORY.md` in the same close-out flow.
- If the answer is no, record `reviewed-no-change` in the changelog `Memory` field.
- Memory edits must also be reflected in `CHANGELOG.md` with clear `Tags` for future retrieval.

### 5.6 Never Store

- Never write secrets/sensitive data into memory files (use redacted placeholders).

### 5.7 Sub-project `.memory/` (exceptional — bridging rule)

Default is 5.2 (single root `.memory/` only). In the exceptional case that a
self-contained sub-project maintains its own `<SUBPROJECT_ROOT>/.memory/CHANGELOG.md`
(e.g., a bundled tool with independent lifecycle), this bridging rule applies:

- **Every entry added to a sub-project changelog MUST have a matching pointer
  entry in the root `<PROJECT_ROOT>/.memory/CHANGELOG.md`**.
- The root pointer entry must carry all metadata fields (`Time`, `AI`, `Request`,
  `Tags`, `Files`, `Memory`, `Risk`). The `Actions` body may be empty or reduced
  to a one-liner such as `See <SUBPROJECT_ROOT>/.memory/CHANGELOG.md for details`.
- `Files:` in the root pointer must include the sub-project changelog path so
  the drill-in path is explicit.
- Purpose: anyone scanning the root changelog still sees that the activity
  happened, with enough tags/metadata to locate details in the sub-project log.

## 6) Operating Model: Coordinator + Subagents (Multi-Implementer + Independent Review)

- Coordinator (Main): communication, clarification, task breakdown, acceptance criteria, risk gating, final approval. It makes small changes itself (a few files, a few minutes, low risk) and hands a piece of work to an Implementer when it is a block of its own; a subagent for a small change costs more than it saves.
- Implementer subagents: may be multiple in parallel. Each must declare a non-overlapping Scope (module/path responsibility).
- Reviewer subagent: must be different from the Implementer being reviewed (two-person rule). Reviews: requirement fit + safety + permission boundaries + env/base rules + logging + ROS log (if applicable).
- Tester subagent (optional): runs minimal verification and reports commands + results.

### Model Assignment

Give each piece of work to the model that fits it; the Coordinator plans, briefs, and
verifies, and does not pick the strongest model for everything.

| Work | Model tier |
|---|---|
| Hard design; code where a mistake is costly (state machines, stop/kill logic, security guards, parsers that decide success or failure) | Strongest available |
| Research, reading upstream code, routine implementation, docs that need judgement | Mid tier |
| Mechanical work: scaffolding, config, changelog and memory updates, running tests and reporting | Smallest |
| Coordination: talking to the user, briefs, checking results | A strong model whose quota lasts; not the scarcest one |
| Review | A strong model from a different vendor than the Implementer |
| Token-heavy bulk work; long unattended runs | The cheapest model that passes |

- Which tool, model and reasoning effort fills each tier is not written in this file. It is
  in `MODEL_MAP.md`, next to this rules file in the kit repository. Models change faster than
  rules: the map is edited whenever needed, without a rules version bump. A project may
  record its own mapping in `PROJECT_MEMORY.md`; that one wins.
- Choose by fit only. No vendor is excluded from a project for being that vendor.
- What is scarce decides, not the list price. A subscription costs nothing more inside its
  quota, so subscriptions are used first; a pay-per-token model takes the overflow and the
  token-heavy bulk work. The model whose quota runs out first is kept for the work only it
  does well; it does not coordinate.
- Reasoning effort: start at the lowest level that passes acceptance (the map gives the
  default per tier). Raise it one level for work where a mistake is costly, or after a
  failure. Higher effort always costs more time and tokens and is not reliably better.
- Review crosses vendors. A model reviewing work from its own vendor scores it higher than
  an outside reviewer does; a same-vendor review does not count as the independent review.
- The map marks some models "verify always": their report is never accepted without the
  Coordinator's own checks, however confident it reads.
- Keeping the map current: update it when a model is taken into use or retired, and re-test
  every one to three months with `tools/model_bench/` in the kit. Public leaderboards give
  the order of strength; the kit's own test checks that it holds in the tools actually used.
  Every row of the map names its source and date.
- A stale map (older than about four months, or naming a model that is no longer offered):
  choose by tier from what is available, and tell the user the map needs a refresh.
- The brief is the subagent's only context: state the goal, what is already ruled out, the
  Scope, the hard constraints, and what the final message must contain.
- A subagent's report is a claim, not proof. Before accepting it the Coordinator re-runs the
  cheap checks itself (tests, validators, `git status`, the key file or log line).
- A reviewer's finding the Implementer believes is wrong is answered with file:line evidence,
  not "fixed" to please the reviewer.

### Subagent Progress Supervision (Hard Rule)

- Every subagent and every headless run gets a time limit when it starts, sized to the work (a
  small task: minutes; a milestone piece: stated in the brief).
- Where the tool reports completion by itself, the Coordinator waits for that report and
  does not poll. Where progress can be read while the run is going, it is checked at
  sensible intervals, not on a fixed clock.
- A run that passes its time limit, or reports no meaningful advancement, is acted on at
  once: clarify scope, unblock a dependency, redirect the approach, or stop and replace it.
- Interventions are explicit and traceable in normal working logs/updates.

### Integration rule (when multiple Implementers)

- Assign one Integrator (one of Implementers or Coordinator-designated) to merge changes, resolve conflicts, and ensure `<PROJECT_ROOT>/.memory/CHANGELOG.md` (and ROS log when applicable) is updated once consistently.

### Evidence Pack (required for approval)

Each Implementer (or Integrator) must provide:

- Ticket: goal/scope/acceptance points
- Scope: exact modules/paths touched
- Diff summary: files changed + key deltas (diffstat ok)
- Commands run: list + outcome summary (if any)
- Risk rating: Low/Med/High + reason
- Logging status: `<PROJECT_ROOT>/.memory/CHANGELOG.md` updated; ROS Change Log updated if ROS-based
- Module map: `regenerated` | `unchanged` | `N/A` (Section 9)

### Post-Change Verification (Hard Rule)

After completing any code/config/doc change, the Implementer (or Reviewer) must:

1. **Identify affected scope**: list every file created, modified, or deleted, plus files that import/depend on them.
2. **Full-content review**: read the complete content of each affected file (not just the diff) to verify:
   - No syntax errors, typos, or broken references (imports, paths, URLs, cross-file calls).
   - No logic bugs introduced by the change (off-by-one, wrong variable, missing return, race condition, etc.).
   - No inconsistencies with the rest of the codebase (naming, API contracts, type signatures, config format).
3. **Dependency check**: confirm that upstream callers / downstream consumers of changed interfaces still work correctly.
4. **Report**: include verification results in the Evidence Pack (`Checks` field). If any issue is found, fix before requesting approval.

> Rationale: reviewing only the diff is insufficient - bugs often hide in interactions between changed and unchanged code.

### Auto-Approval Gate (Coordinator can approve without user present ONLY if all true)

- Reviewer = PASS and Risk = Low
- No high-risk/unauthorized operations performed
- No `base` installs; dependency changes only in project env and recorded
- `<PROJECT_ROOT>/.memory/CHANGELOG.md` updated per format; ROS Change Log updated if applicable
- Tester = PASS (or explicitly "no tests needed" with rationale)
- `gen_module_map.py --check` passes (when the project has a module map, Section 9)
- Otherwise: escalate to user for explicit confirmation.

## 7) Rules Self-Update

> Source of truth: `https://github.com/JimalH/ai-workflow-kit`

When the user requests a rules update:

1. **Fetch**: check the remote repo (`JimalH/ai-workflow-kit`) for any `AI_rules_v*.md` files with a version higher than the one currently in use.
2. **Compare**: if a newer version exists, produce a concise summary of what changed (added / modified / removed rules, section-by-section).
3. **Confirm**: present the diff summary to the user and ask for explicit approval before applying.
4. **Apply**: only after user approval, download the new file and replace the local copy. Record the update in `<PROJECT_ROOT>/.memory/CHANGELOG.md`.
5. **No silent upgrades**: never auto-replace or auto-merge rules without user confirmation.

## 8) Mods (Claude Code)

> Source of truth: `https://github.com/JimalH/ai-workflow-kit` → `mods/` (full guide: `mods/README.md`)

A mod changes Claude Code's own interface or behaviour (pane, band above the prompt, status line, slash command, tool-call/prompt hooks). The kit repository is a Claude Code plugin marketplace, so any machine can install its mods.

- **Find**: published mods are listed in `.claude-plugin/marketplace.json` at the kit root and in the index table of `mods/README.md`. Each mod lives in `mods/<mod-name>/`.
- **Install**: `claude plugin install <mod-name> --marketplace JimalH/ai-workflow-kit` (or `/plugin install ...` at a terminal prompt; desktop app: + → Plugins → Add marketplace). Install only when the user asks.
- **Write / debug**: in Claude Code, load the built-in `plugin-authoring` skill (`/plugin-authoring`) before writing or changing a mod; it carries the current API types and examples, and hot-reloads the mod in the session for testing. Once it works, copy the mod folder from the session's mods folder into `mods/<mod-name>/`.
- **Add / change**: start from `mods/_template/` (or the folder produced by `plugin-authoring`); add or update the marketplace entry (`"category": "mod"`); bump `version` in both `plugin.json` and the marketplace entry on every change; `claude plugin validate mods/<mod-name>` must pass before commit.
- **Forking (Hard Rule)**: a mod based on another author's work must have a license that allows it (otherwise do not copy; ask the user), keep the original `LICENSE`, use a new `name`, and record upstream URL + commit hash + list of changes in its README `## Origin` section.
- **Safety (Hard Rule)**: read every file before committing or installing a mod; no secrets, internal hostnames or personal data in mod files; guarding hooks must use `.catch(...)` so a failure refuses rather than allows.
- **Logging**: mod changes are recorded in `<PROJECT_ROOT>/.memory/CHANGELOG.md` like any other change, with the mod name as a tag.

## 9) Module Map (large / long-running projects)

> Purpose: cut repeated file reading. Agents orient from one small generated file,
> then read only the lines they need.

### 9.1 When it applies

- Any project the user marks as long-running, or any project with more than ~20 source
  files or ~3,000 lines of code. Smaller projects: skip (reading the files directly is
  cheaper than maintaining a map).

### 9.2 The file

- Path: `<PROJECT_ROOT>/MODULE_MAP.md` (Markdown only; HTML costs more tokens and cannot
  be read in line ranges).
- Generated, never hand-edited. Agents do not write to it; they run the generator.
- Header: generation time, the git commit it was generated at, file count, line count, and
  the exact command that regenerates it.
- One block per source file, in a fixed sorted order (small diffs):
  - file line: path - one-line purpose (first line of the module docstring) -
    `imports:` the project-internal modules it imports - `+N private` helper count
  - one line per public symbol (function, class, class method, name in `__all__`):
    signature with line number, then the first docstring line. Example:

    - `src/io/loader.py` - Load raw plate-reader exports into tidy frames. imports: `utils.paths`, `models.plate` (+4 private)
      - `load_plate(path, *, sheet=None) -> DataFrame` L18 - Read one plate file.
      - `class PlateSet` L54 - Plates sharing one metadata table. methods: `add` L61, `merge` L70, `to_long` L88

- Public = no leading underscore (or listed in `__all__`). Private helpers are not listed.
- Missing docstring -> the summary reads `(no docstring)`. The Reviewer flags every new
  public symbol carrying this marker.
- Excluded: tests, vendored / generated code, data, notebooks. Non-source directories get
  one line with a count (`data/ - 12 csv`).
- Size budget: about 1,500 lines. Over budget: one `MODULE_MAP.md` per top-level package;
  the root map becomes the index (one line per package: purpose + file count).

### 9.3 Generator

- Script at `<PROJECT_ROOT>/tools/gen_module_map.py`; the kit ships a reference
  implementation at `tools/gen_module_map.py` (copy it in). Python: parse with `ast`, never
  import the modules. Other languages: tree-sitter or the language's own parser.
- Deterministic output. `--check` exits non-zero when the committed map is stale.
- Run it: in the same close-out step as `CHANGELOG.md` after every change set; once by the
  Integrator after a merge; before commit (pre-commit hook recommended).

### 9.4 Read protocol (Hard Rule for projects with a map)

1. Start of any code task: read `MODULE_MAP.md` (after `PROJECT_MEMORY.md`, before the
   changelog). If `--check` fails, regenerate first.
2. Pick files from the map. Read a symbol by its line range (its `L` number up to the next
   symbol's), not the whole file.
3. Read a file in full only when you will edit it (Post-Change Verification still requires
   the full content of every changed file) or when the map leaves a real question open.
4. Do not re-read the map during the task; re-read it after you regenerate it.
5. Coordinator briefs: paste the map lines for the subagent's Scope into the brief and name
   the map path. Implementer and Reviewer start from those lines; the Reviewer reads the
   diff plus the changed symbols' ranges, then the changed files in full.

### 9.5 Docstring discipline (what the map is made of)

- Every module and every public symbol gets a first docstring line: one sentence,
  imperative, <= 80 chars, what it does (not how).
- A change to a signature or behaviour updates that first line in the same edit.

### 9.6 Evidence Pack and gate

- Evidence Pack gains `Module map: regenerated | unchanged | N/A`.
- Auto-Approval Gate adds: `gen_module_map.py --check` passes (when the project has a map).

## 10) Sessions, Delivery and Budget

### 10.1 One dedicated session per project

- A project that will run over several milestones gets its own session, rooted in the
  project folder, from the start. A general-purpose session does not carry it along.
- A machine may have a standing general-purpose session that is the user's assistant and
  manager for that machine. It does not conflict with the rule above: it starts the
  dedicated session when the user asks for one, and when the user begins project work in it
  without saying where the work should live, it asks before carrying on.
- A machine kept for one job (for example a backtest machine) may take small unrelated
  tasks in its standing session, where opening a new session would cost more than the task.
- If a project grew inside another session, hand it over at a clean boundary: nothing
  running, everything committed, the working tree clean.
- Before the hand-over, everything that lives only in the conversation goes into the
  repository: `<PROJECT_ROOT>/docs/HANDOFF.md` with the status, the user's standing
  agreements for this project, the next steps in order, the open decisions, and the notes
  about this machine. `PROJECT_MEMORY.md` points to it. The new session starts by reading it.
- The project must stay rebuildable by a fresh session on another machine: what is installed
  outside the repository is recorded in the repository (versions, sources, checksums, the
  script that installs it).

### 10.2 Commit locally, push on request

- Commit locally as work completes. Push to a remote only when the user says so; a push
  approved once does not approve the next one.

### 10.3 Usage budget

- Check the usage window before and after each subagent that is expensive, and before a
  milestone starts.
- A model can have a limit of its own inside the plan's window and run out while the window
  still has room. Count the scarcest model's quota by itself: it is spent on the work the
  map keeps for it, never on coordination or routine work.
- When the scarcest model is cut off, its work goes to the next model down at one effort
  level higher, and the user is told.
- At about 70 % of a subscription's window, move routine implementation and mechanical work
  to the other vendors named in the map; keep that subscription for coordination and the
  work only it does well.
- At about 90 %, tell the user and stop at a step boundary unless the user says to go on.
- A subscription the user also needs for other things keeps a reserve; the map records the
  ceiling for delegated work. Where its usage cannot be read from the tool, ask the user
  before a batch the size of a milestone.

### 10.4 Interface changes

- A change to what the user sees (a window, a pane, a band, a page) is shown as a mock-up
  first and built after the user agrees to it.
