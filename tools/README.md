# Tools

Reference scripts referred to by the AI rules. Copy the one you need into the
project that needs it (`<PROJECT_ROOT>/tools/`); nothing here is imported from the kit.

| Script | Rules section | What it does |
|---|---|---|
| `gen_module_map.py` | 9) Module Map | Writes `<PROJECT_ROOT>/MODULE_MAP.md` from docstrings and signatures (Python 3.9+, stdlib only, `ast` parsing). `--check` exits 1 when the map is stale; `--budget N` splits the map per top-level package when it grows past N lines. |

```bash
python tools/gen_module_map.py
```

```bash
python tools/gen_module_map.py --check
```
