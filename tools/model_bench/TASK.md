# Task: next run time of a cron expression

Work only inside this directory. Use Python 3 with the standard library only (no third-party packages).

The Python environment is already set up: run `python` as it is. Do not create environments and do not install packages.

## Deliverables

1. `cronnext.py` containing the function

   ```python
   def next_run(expr: str, after: datetime) -> datetime | None
   ```

2. `test_cronnext.py`: your own tests, written with `unittest`, runnable with `python -m unittest` from this directory. Run them and make them pass.

When you are done, reply with a short summary of what you did.

## Specification

`next_run` returns the earliest time **strictly later** than `after` that matches `expr`. The result has `second == 0` and `microsecond == 0`. `after` is always a naive `datetime` and may carry seconds and microseconds.

### Expression

`expr` has exactly five fields separated by whitespace (any run of spaces or tabs; leading and trailing whitespace is ignored):

| # | Field | Allowed values |
|---|---|---|
| 1 | minute | 0-59 |
| 2 | hour | 0-23 |
| 3 | day of month | 1-31 |
| 4 | month | 1-12 |
| 5 | day of week | 0-7 (0 and 7 are both Sunday, 1 is Monday) |

Each field is a comma-separated list of one or more items. An item is one of:

- `*`: every value of the field
- `N`: one value
- `A-B`: every value from A to B inclusive; A must not be greater than B
- any of the three followed by `/S`, a step: `*/S`, `A-B/S`, or `N/S`. `N/S` means from N to the field's maximum with step S. S must be at least 1. The step starts counting from the first value of the range.

Numbers are written with ASCII digits only (no sign, no underscore, no decimal point). Names (`JAN`, `MON`), `?`, `L`, `W`, `#` and macros such as `@daily` are not supported.

### Day matching

A day field is *unrestricted* only when it is exactly `*`.

- If both day of month and day of week are restricted, a date matches when **either** field matches it.
- Otherwise a date matches when both fields match it (an unrestricted field matches every date).

The month, hour and minute fields must always match.

### Errors and limits

- An invalid expression raises `ValueError`: wrong number of fields, an empty item, something that is not a number, a value out of range, A greater than B, a step of 0, and so on. An invalid expression raises even when another field would make the search trivial.
- If the expression can never match (for example 31 February), return `None`. You may stop searching 8 years after `after`.
- Every call must return in under 0.5 seconds, including sparse expressions such as `0 0 29 2 *` and expressions that never match.
