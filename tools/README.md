# Tools

Reference scripts referred to by the AI rules. Copy the one you need into the
project that needs it (`<PROJECT_ROOT>/tools/`); nothing here is imported from the kit.

| Script | Rules section | What it does |
|---|---|---|
| `gen_module_map.py` | 9) Module Map | Writes `<PROJECT_ROOT>/MODULE_MAP.md` from docstrings and signatures (Python 3.9+, stdlib only, `ast` parsing). `--check` exits 1 when the map is stale; `--budget N` splits the map per top-level package when it grows past N lines. |

| `model_bench/` | 6) Model Assignment | Gives one small coding task to several models through Claude Code, Codex CLI and dsh; measures time, tokens, cost and a hidden check; builds a blind package for two reviewers. Feeds `MODEL_MAP.md`. Runs from the kit, not copied into projects; steps in `model_bench/README.md`. |

```bash
python tools/gen_module_map.py
```

```bash
python tools/gen_module_map.py --check
```
