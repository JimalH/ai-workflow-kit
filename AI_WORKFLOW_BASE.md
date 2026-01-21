# AI Workflow Base Rules

This file is the long-form ground truth for the workflow kit that pairs with the short loader in `AI_LOADER.md`. All agents must follow this after reading the loader.

## Repository Layout (fixed)
- `.workflows/` holds workflow definitions and docs.
- `.workflows/ACTIVE_WORKFLOW.txt` stores the active `workflow_slug`.
- `.workflows/CHAT_PROTOCOL.md` defines cross-AI chat transport rules.
- `.workflows/<workflow_slug>/BASE.md` contains workflow-specific policies (roles registry, SSOT rules, skills policy, permissions policy).
- `.roles/` contains reusable role manuals.
- `.workflows/_skills_cache/` is the allowed cache for fetched skills.
- Platform stubs (`AGENTS.md`, `.claude/CLAUDE.md`, `.agent/rules/GEMINI.md`) must keep the loader marker block intact.

## Two-Layer Entry Model
1) Always read `AI_LOADER.md` first. It enforces minimal bootstrap, safety, and platform stub behavior.
2) Then read this `AI_WORKFLOW_BASE.md` plus the active workflow’s `BASE.md` and the relevant role files.

## Bootstrap Expectations (reasoning-based)
- If `.workflows/` or `.roles/` is missing, fetch them from the kit source, copy alongside `AI_LOADER.md` and this base, and then ask the user to choose a `workflow_slug` to write into `.workflows/ACTIVE_WORKFLOW.txt`.
- Always install or refresh the platform stubs by updating only the marker block. If the block is missing, append it; if present, replace it in place without touching other content.
- Never overwrite SSOT or append-only sections defined by workflow `BASE.md`. Follow the permissions policy declared in that file.

## Versioning & Maintenance
- Use semver-style tags starting at `v0.1.0`. Prefer pinning deployments to a tag rather than `main` for stability.
- Keep `AI_LOADER.md` stable; if changes are required, note migrations in the changelog and keep backward-compatible behavior when possible.
- Do not rename critical paths without a migration shim and clear instructions in the changelog and README.

## Updating Downstream Repos
- Downstreams that bootstrap from this kit should pull the latest tag, copy `AI_LOADER.md`, `AI_WORKFLOW_BASE.md`, `.workflows/`, and `.roles/`, then re-run the stub marker installation.
- After updating, re-run the bootstrap sequence from `AI_LOADER.md` and confirm `ACTIVE_WORKFLOW.txt` points at the intended workflow.

## Safety
- Do not delete user data or history.
- Do not rewrite chat bodies; only adjust headers/flags per the chat protocol.
- Respect append-only sections; additive updates only.
