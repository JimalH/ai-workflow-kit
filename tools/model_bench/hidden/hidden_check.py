"""Hidden acceptance check.

  python hidden_check.py <submission_dir>          run every case, print JSON summary
  python hidden_check.py <submission_dir> <index>  run one case (used internally, isolated process)
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
D = datetime

VALID = [
    ("* * * * *", D(2026, 3, 10, 10, 0, 0)),
    ("* * * * *", D(2026, 3, 10, 10, 0, 30)),
    ("* * * * *", D(2026, 3, 10, 10, 0, 59, 999999)),
    ("0 * * * *", D(2026, 3, 10, 10, 0, 0)),
    ("*/15 * * * *", D(2026, 3, 10, 10, 46)),
    ("5/20 * * * *", D(2026, 3, 10, 10, 46)),
    ("5/20 * * * *", D(2026, 3, 10, 10, 0)),
    ("*/7 * * * *", D(2026, 3, 10, 10, 56)),
    ("10-30/10 9-17 * * 1-5", D(2026, 3, 13, 17, 30)),
    ("0 0 1 1 *", D(2026, 1, 1, 0, 0)),
    ("59 23 31 12 *", D(2026, 12, 31, 23, 59)),
    ("0 0 * * *", D(2026, 12, 31, 12, 0)),
    ("59 23 * * *", D(2026, 5, 5, 23, 58, 59)),
    ("0 0 29 2 *", D(2026, 3, 1)),
    ("0 0 29 2 *", D(2097, 1, 1)),
    ("0 0 31 2 *", D(2026, 1, 1)),
    ("0 0 30 2 *", D(2026, 1, 1)),
    ("0 0 31 4,6,9,11 *", D(2026, 1, 1)),
    ("0 0 13 * 5", D(2026, 3, 10)),
    ("0 0 13 * 5", D(2026, 3, 13)),
    ("0 0 * * 7", D(2026, 3, 10)),
    ("0 0 * * 0", D(2026, 3, 15)),
    ("0 0 */2 * 1", D(2026, 3, 1)),
    ("0 0 */2 * 1", D(2026, 3, 1, 0, 0, 1)),
    ("0 12 * * 5-7", D(2026, 3, 14, 12, 0)),
    ("0 12 * * 5-7", D(2026, 3, 15, 12, 0)),
    ("30 4 1,15 * *", D(2026, 3, 15, 4, 30)),
    ("  0 \t 0  *\t* *  ", D(2026, 3, 10, 8, 0)),
    ("0 0 31 * *", D(2026, 4, 1)),
    ("0 2 30 * *", D(2026, 1, 31)),
    ("0 0 1 */3 *", D(2026, 4, 1)),
    ("0-59/61 * * * *", D(2026, 3, 10, 10, 0)),
    ("7 7 7 7 7", D(2026, 7, 7, 7, 7)),
    ("7 7 7 7 7", D(2026, 7, 12, 7, 7)),
    ("0 0 * 2 1", D(2026, 2, 23)),
    ("15,5,10 * * * *", D(2026, 3, 10, 10, 5)),
    ("5,5 * * * *", D(2026, 3, 10, 10, 5)),
    ("0 0 1 1 1", D(2026, 1, 1)),
    ("0 0 1 1 1", D(2026, 1, 26)),
    ("0 0 29 2 1", D(2027, 2, 22)),
    ("0 0 * * 1/2", D(2026, 3, 13)),
    ("0 0 * * 1/2", D(2026, 3, 14, 0, 0)),
    ("0 0 * * */2", D(2026, 3, 15)),
    ("0 0 * * 0-7/7", D(2026, 3, 15)),
    ("*/30 */6 * * *", D(2026, 3, 10, 18, 30)),
    ("0 0 31 1,3 3", D(2026, 1, 31)),
]

INVALID = [
    "* * * *", "* * * * * *", "", "   ",
    "60 * * * *", "* 24 * * *", "* * 0 * *", "* * 32 * *", "* * * 0 *", "* * * 13 *", "* * * * 8",
    "5-1 * * * *", "*/0 * * * *", "a * * * *", "1,,2 * * * *", "1- * * * *", "-1 * * * *",
    "1/2/3 * * * *", "* * * JAN *", "* * * * MON", "1.5 * * * *", "*/-1 * * * *", ", * * * *",
    "*-5 * * * *", "1-2-3 * * * *", "+5 * * * *", "1_0 * * * *", "1, * * * *", "*/ * * * *",
    "0 0 31 2 8", "@daily", "? * * * *", "0 0 1-32 * *", "50-70 * * * *",
]

AFTER_INVALID = D(2026, 3, 10, 10, 0)
LIMIT = 1.0  # seconds per call (task says 0.5; margin for machine load)


def cases():
    out = [("valid", e, a) for e, a in VALID]
    out += [("invalid", e, AFTER_INVALID) for e in INVALID]
    return out


def run_one(sub, idx):
    sys.path.insert(0, HERE)
    import reference
    sys.path.insert(0, sub)
    kind, expr, after = cases()[idx]
    import cronnext
    t0 = time.perf_counter()
    try:
        got = cronnext.next_run(expr, after)
        err = None
    except ValueError:
        got, err = None, "ValueError"
    except Exception as e:  # noqa: BLE001
        got, err = None, type(e).__name__
    dt = time.perf_counter() - t0
    if kind == "invalid":
        ok = err == "ValueError"
        detail = "expected ValueError, got %s" % (err or repr(got))
    else:
        want = reference.next_run(expr, after)
        ok = err is None and got == want and (got is None or type(got) is datetime)
        detail = "want %r, got %s" % (want, err or repr(got))
    if ok and dt > LIMIT:
        ok, detail = False, "too slow: %.2fs" % dt
    print(json.dumps({"ok": ok, "kind": kind, "expr": expr, "after": after.isoformat(), "detail": detail, "sec": round(dt, 4)}))


def run_all(sub):
    results = []
    for i, (kind, expr, after) in enumerate(cases()):
        try:
            p = subprocess.run([sys.executable, os.path.abspath(__file__), sub, str(i)],
                               capture_output=True, text=True, timeout=15, cwd=HERE,
                               env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
            r = json.loads(p.stdout.strip().splitlines()[-1])
        except subprocess.TimeoutExpired:
            r = {"ok": False, "kind": kind, "expr": expr, "after": after.isoformat(), "detail": "hung (>15s)"}
        except Exception as e:  # noqa: BLE001
            r = {"ok": False, "kind": kind, "expr": expr, "after": after.isoformat(),
                 "detail": "crashed: %s %s" % (type(e).__name__, (p.stderr or "")[-300:])}
        results.append(r)
    v = [r for r in results if r["kind"] == "valid"]
    n = [r for r in results if r["kind"] == "invalid"]
    print(json.dumps({
        "passed": sum(r["ok"] for r in results), "total": len(results),
        "valid_passed": sum(r["ok"] for r in v), "valid_total": len(v),
        "invalid_passed": sum(r["ok"] for r in n), "invalid_total": len(n),
        "failures": [{"expr": r["expr"], "after": r["after"], "detail": r["detail"]} for r in results if not r["ok"]],
    }, indent=1))


if __name__ == "__main__":
    if len(sys.argv) == 3:
        run_one(os.path.abspath(sys.argv[1]), int(sys.argv[2]))
    else:
        run_all(os.path.abspath(sys.argv[1]))
