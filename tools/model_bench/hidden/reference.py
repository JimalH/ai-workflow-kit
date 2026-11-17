"""Reference implementation: slow-but-obvious day scan. Used only to compute expected answers."""
import re
from datetime import datetime, timedelta

RANGES = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)]
_INT = re.compile(r"[0-9]+\Z")


def _num(s):
    if not _INT.match(s):
        raise ValueError(s)
    return int(s)


def _field(text, lo, hi):
    out = set()
    for item in text.split(","):
        if item == "":
            raise ValueError("empty item")
        parts = item.split("/")
        if len(parts) > 2:
            raise ValueError(item)
        base, step = parts[0], 1
        if len(parts) == 2:
            step = _num(parts[1])
            if step < 1:
                raise ValueError(item)
        if base == "*":
            a, b = lo, hi
        elif "-" in base:
            x = base.split("-")
            if len(x) != 2:
                raise ValueError(item)
            a, b = _num(x[0]), _num(x[1])
            if a > b:
                raise ValueError(item)
        else:
            a = _num(base)
            b = hi if len(parts) == 2 else a
        if a < lo or b > hi:
            raise ValueError(item)
        out.update(range(a, b + 1, step))
    return out


def next_run(expr, after):
    f = expr.split()
    if len(f) != 5:
        raise ValueError("field count")
    mi, ho, dom, mon, dow = [_field(t, lo, hi) for t, (lo, hi) in zip(f, RANGES)]
    dow = {d % 7 for d in dow}
    both = f[2] != "*" and f[4] != "*"
    start = after.replace(second=0, microsecond=0) + timedelta(minutes=1)
    hours, minutes = sorted(ho), sorted(mi)
    for i in range(8 * 366 + 2):
        d = start.date() + timedelta(days=i)
        if d.month not in mon:
            continue
        cd = d.day in dom
        cw = (d.isoweekday() % 7) in dow
        if not ((cd or cw) if both else (cd and cw)):
            continue
        for h in hours:
            for m in minutes:
                t = datetime(d.year, d.month, d.day, h, m)
                if t >= start:
                    return t
    return None
