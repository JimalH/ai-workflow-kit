"""Collect time, tokens, cost and test results for one round; optionally build the blind judging package.

  python collect.py round1                 print the table, write work/round1/metrics.json
  python collect.py round1 --judge         also write work/round1/judge, judge-a and judge-b
  python collect.py round1 --work D:/x     use another work folder

Run it with the same Python (conda env) the runs used.
"""
import argparse
import json
import os
import random
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone

KIT = os.path.dirname(os.path.abspath(__file__))
ENV = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}

# USD per 1M tokens: (uncached input, cached input, output). Keep in step with MODEL_MAP.md.
# DeepSeek figures are off-peak; peak (Mon-Fri 01:00-04:00 and 06:00-10:00 UTC) is double.
PRICES = {
    "gpt-6.1-sol": (2.00, 0.10, 10.00),
    "gpt-6.1-terra": (1.00, 0.05, 5.00),
    "deepseek-flash": (0.15, 0.003, 0.60),
    "deepseek-v4-pro": (0.66, 0.022, 1.98),
}
IDENT = re.compile(r"claude|codex|deepseek|gpt|fable|opus|anthropic|openai|dsh|sonnet|haiku|terra\b|\bsol\b", re.I)


def read(path):
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        return f.read()


def jsonl(path):
    out = []
    for line in read(path).splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                out.append(json.loads(line))
            except ValueError:
                pass
    return out


def is_peak(start_iso):
    t = datetime.fromisoformat(re.sub(r"(\.\d{6})\d+", r"\1", start_iso)).astimezone(timezone.utc)
    return t.weekday() < 5 and (1 <= t.hour < 4 or 6 <= t.hour < 10)


def tokens(logs, name, tool, model, start_iso):
    p = os.path.join(logs, name + ".out")
    t = {"input_uncached": 0, "cache_read": 0, "cache_write": 0, "output": 0, "requests": None, "cost_usd": None,
         "cost_source": "", "final": ""}
    try:
        if tool == "claude":
            j = json.loads(read(p))
            u = j["usage"]
            t.update(input_uncached=u["input_tokens"], cache_read=u["cache_read_input_tokens"],
                     cache_write=u["cache_creation_input_tokens"], output=u["output_tokens"],
                     requests=j.get("num_turns"), cost_usd=round(j.get("total_cost_usd", 0), 4),
                     cost_source="reported by the CLI", final=j.get("result", ""))
        elif tool == "codex":
            ev = jsonl(p)
            for e in ev:
                if e.get("type") == "turn.completed":
                    u = e["usage"]
                    t["input_uncached"] += u["input_tokens"] - u.get("cached_input_tokens", 0)
                    t["cache_read"] += u.get("cached_input_tokens", 0)
                    t["cache_write"] += u.get("cache_write_input_tokens", 0)
                    t["output"] += u["output_tokens"]
            msgs = [e["item"]["text"] for e in ev
                    if e.get("type") == "item.completed" and e["item"].get("type") == "agent_message"]
            t["final"] = msgs[-1] if msgs else ""
            t["requests"] = sum(1 for e in ev if e.get("type") == "item.completed" and e["item"].get("type") != "error")
        else:
            ev = jsonl(p)
            n = 0
            for e in ev:
                if e.get("phase") == "step_end" and "usage" in e:
                    u = e["usage"]
                    n += 1
                    t["input_uncached"] += u["inputTokens"]
                    t["cache_read"] += u.get("cacheReadTokens", 0)
                    t["cache_write"] += u.get("cacheWriteTokens", 0)
                    t["output"] += u["outputTokens"]
            t["requests"] = n
            fin = [e for e in ev if e.get("type") == "final"]
            t["final"] = fin[-1].get("text", "") if fin else ""
    except (OSError, ValueError, KeyError) as e:
        t["final"] = "(could not read the tool output: %s)" % type(e).__name__
    t["total"] = t["input_uncached"] + t["cache_read"] + t["cache_write"] + t["output"]
    if model in PRICES:
        pi, pc, po = PRICES[model]
        mult = 2 if (tool == "dsh" and is_peak(start_iso)) else 1
        t["cost_usd"] = round(mult * (t["input_uncached"] * pi + t["cache_read"] * pc + t["output"] * po) / 1e6, 4)
        t["cost_source"] = "list price x tokens" + (" (peak)" if mult == 2 else (" (off-peak)" if tool == "dsh" else ""))
    return t


def own_tests(d):
    try:
        p = subprocess.run([sys.executable, "-m", "unittest"], cwd=d, capture_output=True, text=True, timeout=180, env=ENV)
    except subprocess.TimeoutExpired:
        return {"status": "timeout"}
    m = re.search(r"Ran (\d+) tests?", p.stderr or "")
    return {"status": "OK" if p.returncode == 0 else "FAILED", "ran": int(m.group(1)) if m else 0}


def hidden(d):
    p = subprocess.run([sys.executable, os.path.join(KIT, "hidden", "hidden_check.py"), d],
                       capture_output=True, text=True, timeout=1500, env=ENV)
    try:
        return json.loads(p.stdout)
    except ValueError:
        return {"passed": 0, "total": 80, "error": (p.stderr or p.stdout)[-400:]}


PROBE = r"""
import sys
sys.path.insert(0, sys.argv[1])
import cronnext as c
from datetime import datetime as D
def t(e, a):
    try:
        r = c.next_run(e, a)
        return "ok" if r is not None else "None"
    except Exception as x:
        return type(x).__name__
def step():
    try:
        return "ok" if c.next_run('5/10 * * * *', D(2026, 3, 10, 0, 5)) == D(2026, 3, 10, 0, 15) else "wrong"
    except Exception as x:
        return type(x).__name__
print(t('* * * * *', D(9999, 1, 1)), t('0 0\n* * *', D(2026, 3, 10)), t('0 0 1 1/' + '9' * 5000 + ' *', D(2026, 3, 10)), step())
"""


def probes(d):
    """Edge probes outside the hidden check: year 9999 (want ok), newline as separator (want ValueError),
    5000-digit step (want ok), N/S step (want ok)."""
    try:
        p = subprocess.run([sys.executable, "-c", PROBE, d], capture_output=True, text=True, timeout=60, env=ENV)
        a, b, c, e = p.stdout.split()
        return {"year9999": a, "newline_separator": b, "huge_step": c, "n_slash_s": e}
    except Exception as x:  # noqa: BLE001
        return {"error": type(x).__name__}


def files(d):
    out = []
    for root, dirs, fs in os.walk(d):
        dirs[:] = [x for x in dirs if x != "__pycache__"]
        for f in fs:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, d).replace("\\", "/")
            if rel == "TASK.md":
                continue
            try:
                lines = len(read(full).splitlines())
            except OSError:
                lines = None
            out.append({"path": rel, "bytes": os.path.getsize(full), "lines": lines})
    return sorted(out, key=lambda x: x["path"])


def build_judge(base, runs, rows):
    J = os.path.join(base, "judge")
    for d in (J, J + "-a", J + "-b"):
        if os.path.isdir(d):
            shutil.rmtree(d)
    os.makedirs(J)
    shutil.copy(os.path.join(KIT, "TASK.md"), J)
    n, last = len(rows), rows[-1]["label"]
    md = ["# Measured results (blind labels)", "",
          "%d agents were each given `TASK.md` and the prompt \"Read TASK.md in the current directory and complete the task it describes.\"" % n,
          "Each worked alone in its own directory; the directories are `A` to `%s` here. The hidden acceptance check has 80 cases" % last,
          "(46 valid expressions compared with a reference implementation, 34 invalid expressions that must raise ValueError).",
          "Tokens are summed over every model request of the run (so repeated context counts each time).",
          "Cost is the list price of those tokens in US dollars.", "",
          "| Label | Wall time (s) | Tokens total | of which output | Cost (USD) | Hidden check | Own tests | Files created |",
          "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        dst = os.path.join(J, r["label"])
        shutil.copytree(os.path.join(runs, r["name"]), dst, ignore=shutil.ignore_patterns("__pycache__", ".conda*"))
        for root, _, fs in os.walk(dst):
            for f in fs:
                if f == "CHANGELOG.md":  # its "AI:" line names the tool
                    full = os.path.join(root, f)
                    txt = re.sub(r"(?m)^AI:.*$", "AI: <redacted>", read(full))
                    with open(full, "w", encoding="utf-8") as fh:
                        fh.write(txt)
        h, o, t = r["hidden"], r["own_tests"], r["tokens"]
        md.append("| %s | %s | %s | %s | %s | %s/%s | %s (%s tests) | %s |" % (
            r["label"], r["seconds"], t["total"], t["output"], t["cost_usd"], h.get("passed"), h.get("total"),
            o.get("status"), o.get("ran", "?"), ", ".join(f["path"] for f in r["files"]) or "(none)"))
    md += ["", "## Hidden check failures", ""]
    for r in rows:
        fails = r["hidden"].get("failures") or []
        md.append("### %s: %d failed%s" % (r["label"], len(fails), (" - " + r["hidden"]["error"]) if r["hidden"].get("error") else ""))
        md += ["- `%s` after %s: %s" % (f["expr"], f["after"], f["detail"]) for f in fails] + [""]
    md += ["## Final message of each agent", ""]
    for r in rows:
        md += ["### " + r["label"], "", "```", r["tokens"]["final"].strip()[:3000], "```", ""]
    text = "\n".join(md)
    for r in rows:  # an absolute path in a final message would name the agent
        full = os.path.join(runs, r["name"])
        for variant in (full, full.replace("\\", "/"), full.replace("\\", "\\\\")):
            text = re.sub(re.escape(variant), "./" + r["label"], text, flags=re.I)
    with open(os.path.join(J, "RESULTS.md"), "w", encoding="utf-8") as f:
        f.write(text)
    brief = read(os.path.join(KIT, "JUDGE.md")).replace("{N}", str(n)).replace("{LAST}", last)
    with open(os.path.join(J, "JUDGE.md"), "w", encoding="utf-8") as f:
        f.write(brief)
    leaks = []
    for root, _, fs in os.walk(J):
        for f in fs:
            full = os.path.join(root, f)
            for i, line in enumerate(read(full).splitlines(), 1):
                if IDENT.search(line):
                    leaks.append("%s:%d: %s" % (os.path.relpath(full, J), i, line.strip()[:120]))
    print("identity words in the blind package: %d (must be 0 before judging)" % len(leaks))
    for x in leaks[:30]:
        print("   ", x)
    for d in (J + "-a", J + "-b"):
        shutil.copytree(J, d)
    print("blind packages:", J + "-a", "and", J + "-b")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("round")
    ap.add_argument("--work", default=os.path.join(KIT, "work"))
    ap.add_argument("--judge", action="store_true")
    a = ap.parse_args()
    base = os.path.join(os.path.abspath(a.work), a.round)
    runs, logs = os.path.join(base, "runs"), os.path.join(base, "logs")
    names = sorted(f[:-len(".meta.json")] for f in os.listdir(logs) if f.endswith(".meta.json"))
    order = names[:]
    random.Random(a.round).shuffle(order)  # blind labels: fixed for a round, unrelated to the names
    label = {n: chr(ord("A") + i) for i, n in enumerate(order)}
    rows = []
    for name in sorted(names, key=lambda n: label[n]):
        d = os.path.join(runs, name)
        meta = json.loads(read(os.path.join(logs, name + ".meta.json")))
        row = {"label": label[name], "name": name, "tool": meta["tool"], "model": meta["model"],
               "effort": meta.get("effort") or "default", "exit": meta["exit"], "seconds": meta["seconds"],
               "tokens": tokens(logs, name, meta["tool"], meta["model"], meta["start"]),
               "has_impl": os.path.exists(os.path.join(d, "cronnext.py")),
               "own_tests": own_tests(d), "files": files(d)}
        row["hidden"] = hidden(d) if row["has_impl"] else {"passed": 0, "total": 80, "error": "cronnext.py missing"}
        row["probes"] = probes(d) if row["has_impl"] else {}
        rows.append(row)
    with open(os.path.join(base, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=1, ensure_ascii=False)
    for r in rows:
        t, h = r["tokens"], r["hidden"]
        print("%s %-15s %-16s %-7s exit=%s %6.1fs tokens=%-8d out=%-6d cost=$%s [%s] hidden=%s/%s own=%s(%s) probes=%s" % (
            r["label"], r["name"], r["model"], r["effort"], r["exit"], r["seconds"], t["total"], t["output"],
            t["cost_usd"], t["cost_source"], h.get("passed"), h.get("total"),
            r["own_tests"].get("status"), r["own_tests"].get("ran"), "/".join(r["probes"].values())))
        for f in (h.get("failures") or []):
            print("     FAIL %-24s after %s: %s" % (f["expr"], f["after"], f["detail"]))
        print("     files:", ", ".join("%s(%s)" % (f["path"], f["lines"]) for f in r["files"]))
    if a.judge:
        build_judge(base, runs, rows)


if __name__ == "__main__":
    main()
