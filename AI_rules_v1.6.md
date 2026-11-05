# Project AI Rules (Tool-Agnostic)

Version: v1.6
Last Updated: 2026-11-05

## 0) Default

- Read this file first. If uncertain, ask; do not guess.
- Goal: safe, reversible changes with full traceability.
- Prompt echo (default): for every new request from chat, restate the user's prompt once in 1-2 lines before planning or execution.
- Requirement clarification gate: after the user states a requirement, you may ask clarifying questions back to confirm it. Once you are confident you fully understand the intended outcome, confirm that understanding with the user, and only begin making changes after the user gives an explicit go-ahead.

## 1) Safety (Hard Rules)

- Secrets/Sensitive: never request, print, or store API keys/tokens/passwords/private keys/certs, personal data, or business secrets. If encountered, stop and alert the user.
- High-risk operations: do not perform mass delete/overwrite, history rewrite, permission sweeps, running unknown scripts, or touching production. If truly needed: explain risk + get explicit user approval.
- Compliance: no unauthorized access, auth bypass, malware/backdoors, covert data exfiltration.

## 2) Conda / Environment (Hard Rules)

- Each project must use a dedicated conda env (project isolation).
- Never install packages in `base` (conda/pip both forbidden).
- Any dependency change must:
  - happen in the project env; and
  - be recorded in `<PROJECT_ROOT>/.memory/CHANGELOG.md` (env name + add/upgrade/remove list).

## 3) Change Logging (Single Project Log File)

- Use one project changelog file only: `<PROJECT_ROOT>/.memory/CHANGELOG.md`.
- All change records go to this file (code/docs/config/memory/rules updates).
- Update policy: newest entry first (prepend below header).
- Validation: reviewers may read only header + first entry.

### `CHANGELOG.md` format

- Stable short header. Entry boundary uses `---`.
- Read/write changelog files in UTF-8. Prefer UTF-8 without BOM.
- Entry template:

---

Time: <YYYY-MM-DD HH:MM +/-TZ>
AI: <Claude|Codex|Antigravity|Other>   # if multiple, comma-separate
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
- Read top N newest entries from `<PROJECT_ROOT>/.memory/CHANGELOG.md` (default N=20).
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

- Coordinator (Main): communication, clarification, task breakdown, acceptance criteria, risk gating, final approval. By default: plan-only; does not directly implement changes.
- Implementer subagents: may be multiple in parallel. Each must declare a non-overlapping Scope (module/path responsibility).
- Reviewer subagent: must be different from the Implementer being reviewed (two-person rule). Reviews: requirement fit + safety + permission boundaries + env/base rules + logging + ROS log (if applicable).
- Tester subagent (optional): runs minimal verification and reports commands + results.

### Subagent Progress Supervision (Hard Rule)

- When subagents are enabled, the Coordinator must check each active subagent's progress at least once every 1 minute.
- If consecutive progress checks show no meaningful advancement, the Coordinator must take action immediately (e.g., clarify scope, unblock dependencies, redirect approach, or replace/stop the stuck subagent).
- Progress checks and interventions should be explicit and traceable in normal working logs/updates.

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
- Header: generation time, git commit, file count, line count, and the exact command that
  regenerates it.
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

- Script at `<PROJECT_ROOT>/tools/gen_module_map.py` (or the kit's reference
  implementation). Python: parse with `ast`, never import the modules. Other languages:
  tree-sitter or the language's own parser.
- Deterministic output. `--check` exits non-zero when the committed map is stale.
- Run it: in the same close-out step as `CHANGELOG.md` after every change set; once by the
  Integrator after a merge; before commit (pre-commit hook recommended).

### 9.4 Read protocol (Hard Rule for projects with a map)

1. Start of any code task: read `MODULE_MAP.md` (after `PROJECT_MEMORY.md`, before the
   changelog). If `--check` fails or the header commit is not `HEAD`, regenerate first.
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
