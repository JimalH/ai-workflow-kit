# AI Workflow Kit

This kit packages a reusable workflow system (workflows, roles, chat protocol, and loader) that any AI/agent can bootstrap from the repo root.

## Two-Layer Entry Model
- `AI_LOADER.md`: short bootstrap loader every agent must read first; enforces structure, permissions, and stub markers.
- `AI_WORKFLOW_BASE.md`: long-form base rules; read after the loader along with the active workflow’s `BASE.md` and role files.

## Using in a New Repo
1) Copy `AI_LOADER.md`, `AI_WORKFLOW_BASE.md`, `.workflows/`, and `.roles/` into the target repo (keep them at repo root).
2) Ensure the platform stubs exist and include the marker block unchanged:
   - `AGENTS.md`
   - `.claude/CLAUDE.md`
   - `.agent/rules/GEMINI.md`
3) Pick a workflow slug from `.workflows/` and write it to `.workflows/ACTIVE_WORKFLOW.txt`.
4) Follow `.workflows/CHAT_PROTOCOL.md` and the chosen workflow’s `BASE.md` for roles, SSOT, skills policy, and permissions policy.

## Workflows Location
- Workflows live under `.workflows/<slug>/` (with `BASE.md` and promptbook assets).
- The active workflow slug is stored in `.workflows/ACTIVE_WORKFLOW.txt`.
- The chat transport rules live in `.workflows/CHAT_PROTOCOL.md`.

## Versioning & Maintenance
- Tags: semver-style starting at `v0.1.0`; downstreams should pin to a tag for stability.
- Backward compatibility: keep `AI_LOADER.md` stable; if paths or behaviors must change, document migrations in `CHANGELOG.md`.
- Updating downstreams: pull the new tag, recopy loader/base/workflows/roles, refresh stubs via the marker block, and confirm `ACTIVE_WORKFLOW.txt`.

## Repository Info
- Kit source: https://github.com/JimalH/ai-workflow-kit (public)
- Recommended bootstrap ref: latest tag (e.g., `v0.1.0`) instead of `main`.
