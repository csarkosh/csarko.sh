"""Writes Modal's workspace billing report into the day's Firestore snapshot.

Modal has no REST billing endpoint; its billing report exists only in the Python
SDK (the data `modal billing report --json` prints), so this job is Python while
the admin API is Node. It runs once a day from Cloud Scheduler, ten minutes before
the API's snapshot, and writes one path of the day's document, `finance.modal`
(admin/CONTRACT.md, "Finance"):

    snapshots/<YYYY-MM-DD>: { finance: { modal: {
        at, lastDay, credits,
        rows:    [ { day, app, env, cost } ]   the last 60 days, one row an app a day
        monthly: [ { month, app, cost } ]      the last 13 months, summed by month and app
    } } }

or `{ at, error }` when anything fails, and then exits non-zero. The write is a
merge of that one path, so the rest of the document (the Node API's) is never
touched. `--dry-run` prints what would be written and writes nothing.
"""

import json
import os
import sys
from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from time import sleep

DAYS = 60
MONTHS = 13
PAUSE_S, BACKOFF_S, RETRIES = 2, 15, 4  # a 10-minute job has time; the API has a rate limit
COLLECTION = "snapshots"
FIELD = "finance.modal"


def month_start(day, months_back):
    """The first day of the month `months_back` months before `day`'s month (-1: the next)."""
    year, month = day.year, day.month - months_back
    while month <= 0:
        year, month = year - 1, month + 12
    while month > 12:
        year, month = year + 1, month - 12
    return day.replace(year=year, month=month, day=1)


def iso(now):
    return now.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def shape(report, now, credits):
    """The report's rows (object_id, description, environment_name, interval_start,
    cost) as the snapshot part: zero-cost rows dropped, costs as numbers."""
    since = (now - timedelta(days=DAYS)).date()
    rows, monthly, last_day = [], defaultdict(Decimal), None
    for item in report:
        cost = Decimal(str(item["cost"]))
        if cost == 0:
            continue
        day = item["interval_start"].date()
        app = item["description"] or item["object_id"]
        last_day = max(last_day or day, day)
        if day >= since:
            rows.append({"day": day.isoformat(), "app": app, "env": item["environment_name"], "cost": float(cost)})
        monthly[(day.strftime("%Y-%m"), app)] += cost
    rows.sort(key=lambda r: (r["day"], r["app"], r["env"]))
    return {
        "at": iso(now),
        "lastDay": last_day.isoformat() if last_day else None,
        "credits": credits,
        "rows": rows,
        "monthly": [
            {"month": month, "app": app, "cost": float(cost)}
            for (month, app), cost in sorted(monthly.items())
        ],
    }


def fetch(now):
    """Daily rows for the last 13 calendar months, this one included, one report a
    month: Modal refuses a daily report spanning more than 31 days. The client reads
    MODAL_TOKEN_ID and MODAL_TOKEN_SECRET from the environment itself. The end is
    exclusive and partial intervals are dropped, so today never appears."""
    import modal.billing
    from modal.exception import ResourceExhaustedError

    rows = []
    for back in range(MONTHS - 1, -1, -1):
        start = datetime.combine(month_start(now.date(), back), time.min, tzinfo=timezone.utc)
        end = min(now, datetime.combine(month_start(start.date(), -1), time.min, tzinfo=timezone.utc))
        for attempt in range(RETRIES + 1):  # the report is rate limited: 13 calls in a row trip it
            try:
                rows += modal.billing.workspace_billing_report(start=start, end=end, resolution="d")
                break
            except ResourceExhaustedError:
                if attempt == RETRIES:
                    raise
                sleep(BACKOFF_S * 2**attempt)
        sleep(PAUSE_S)
    return rows


def write(project, day, part):
    from google.cloud import firestore

    doc = firestore.Client(project=project).collection(COLLECTION).document(day)
    # merge on the one field path: creates the document if the API has not
    # written it yet, and replaces only `finance.modal` if it has.
    doc.set({"finance": {"modal": part}}, merge=[FIELD])


def main(argv):
    dry_run = "--dry-run" in argv
    now = datetime.now(timezone.utc)
    day = now.date().isoformat()
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    try:
        part = shape(fetch(now), now, float(os.environ.get("MODAL_CREDITS_USD", "30")))
        ok = True
    except Exception as error:  # noqa: BLE001  anything: the snapshot must say so
        part = {"at": iso(now), "error": f"{type(error).__name__}: {error}"}
        ok = False
    if dry_run:
        print(json.dumps({f"{COLLECTION}/{day}": {"finance": {"modal": part}}}, indent=2))
    elif not project:
        print("GOOGLE_CLOUD_PROJECT is not set; nothing written", file=sys.stderr)
        return 2
    else:
        write(project, day, part)
        summary = f"error: {part['error']}" if not ok else f"{len(part['rows'])} rows, last day {part['lastDay']}"
        print(f"wrote {COLLECTION}/{day} {FIELD}: {summary}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
