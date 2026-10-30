#!/usr/bin/env python3
"""Claude Code usage for the Billing page (admin.csarko.sh/finance/).

Claude Code on a claude.ai subscription has no billing endpoint: the plan is a flat fee and
the usage is in the local transcripts (`~/.claude*/projects/**/*.jsonl`, one JSON line a
message, each assistant message carrying `usage` with its token counts and `model`). This
script sums them per day and per model for the last 60 days and 13 months, prices each row
at the first-party API list price (what the same tokens would cost as API calls, the
plan's value, never a bill), and writes `finance.claude` into today's Firestore snapshot
(`snapshots/<YYYY-MM-DD>`, project csarko-sh), where the admin API reads it like Modal's part.
No transcript text leaves this Mac: tokens, models and days only.

  tools/claude-usage-sync.py             write today's part
  tools/claude-usage-sync.py --dry-run   print it and write nothing

Needs gcloud signed in as the owner (`gcloud auth print-access-token`); nothing else.
"""
import glob, json, os, subprocess, sys, urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

PROJECT = "csarko-sh"
ROOTS = [os.path.expanduser(p) for p in ("~/.claude/projects", "~/.claude2/projects")]
# $ per million tokens: input, cache write (1.25x input), cache read, output. First-party list
# prices (the claude-api skill's table, 2026-10); a model not here is priced as Opus 5.5.
PRICES = {
    "claude-fable-5-1": (10.0, 12.5, 0.25, 50.0),
    "claude-fable-5": (10.0, 12.5, 0.25, 50.0),
    "claude-opus-5-5": (4.0, 5.0, 0.20, 20.0),
    "claude-opus-5": (5.0, 6.25, 0.50, 25.0),
    "claude-opus-4-8": (5.0, 6.25, 0.50, 25.0),
    "claude-opus-4-7": (5.0, 6.25, 0.50, 25.0),
    "claude-opus-4-6": (5.0, 6.25, 0.50, 25.0),
    "claude-sonnet-5-5": (2.0, 2.5, 0.20, 10.0),
    "claude-sonnet-5": (2.0, 2.5, 0.20, 10.0),
    "claude-sonnet-4-6": (3.0, 3.75, 0.30, 15.0),
    "claude-haiku-5-5": (0.10, 0.125, 0.01, 0.50),
    "claude-haiku-4-5": (1.0, 1.25, 0.10, 5.0),
}
DEFAULT_PRICE = PRICES["claude-opus-5-5"]
DAYS = 60
MONTHS = 13


def usd(model, t):
    p = PRICES.get(model, DEFAULT_PRICE)
    return (t[0] * p[0] + t[1] * p[1] + t[2] * p[2] + t[3] * p[3]) / 1e6


def collect(since_month):
    days = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0, 0]))  # day -> model -> in, write, read, out, messages
    files = 0
    for root in ROOTS:
        for path in glob.glob(os.path.join(root, "*", "*.jsonl")):
            files += 1
            try:
                with open(path, "rb") as fh:
                    for line in fh:
                        if b'"usage"' not in line:
                            continue
                        try:
                            r = json.loads(line)
                        except ValueError:
                            continue
                        m = r.get("message") or {}
                        u = m.get("usage") if isinstance(m, dict) else None
                        if not u:
                            continue
                        day = str(r.get("timestamp", ""))[:10]
                        if day < since_month or not day:
                            continue
                        model = m.get("model") or "?"
                        if model == "<synthetic>":
                            continue
                        t = days[day][model]
                        t[0] += u.get("input_tokens", 0) or 0
                        t[1] += u.get("cache_creation_input_tokens", 0) or 0
                        t[2] += u.get("cache_read_input_tokens", 0) or 0
                        t[3] += u.get("output_tokens", 0) or 0
                        t[4] += 1
            except OSError:
                continue
    return days, files


def row(key, name, model, t):
    return {key: name, "model": model, "input": t[0], "cacheWrite": t[1], "cacheRead": t[2], "output": t[3], "messages": t[4], "usd": round(usd(model, t), 2)}


def part(now):
    today = now.date()
    first_month = (today.replace(day=1) - timedelta(days=31 * (MONTHS - 1))).replace(day=1)
    days, files = collect(first_month.isoformat())
    day_floor = (today - timedelta(days=DAYS - 1)).isoformat()
    daily = [row("day", d, m, t) for d in sorted(days) if d >= day_floor for m, t in sorted(days[d].items())]
    months = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0, 0]))
    for d, ms in days.items():
        for m, t in ms.items():
            acc = months[d[:7]][m]
            for i in range(5):
                acc[i] += t[i]
    monthly = [row("month", mo, m, t) for mo in sorted(months) for m, t in sorted(months[mo].items())]
    return {
        "at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "lastDay": max(days) if days else None,
        "files": files,
        "rows": daily,
        "monthly": monthly,
        "pricing": "first-party API list price, 2026-10; the plan's value, not a bill",
    }


def write(day, data):
    token = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True, check=True).stdout.strip()
    url = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/snapshots/{day}?updateMask.fieldPaths=finance.claude"
    body = json.dumps({"fields": {"finance": {"mapValue": {"fields": {"claude": encode(data)}}}}}).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        return res.status


def encode(v):
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, str):
        return {"stringValue": v}
    if isinstance(v, list):
        return {"arrayValue": {"values": [encode(x) for x in v]}}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {k: encode(x) for k, x in v.items()}}}
    raise TypeError(type(v))


def main():
    now = datetime.now(timezone.utc)
    data = part(now)
    total = sum(r["usd"] for r in data["monthly"] if r["month"] == now.strftime("%Y-%m"))
    if "--dry-run" in sys.argv:
        print(json.dumps({k: (v if k not in ("rows", "monthly") else f"{len(v)} rows") for k, v in data.items()}, indent=1))
        print(f"this month at list price: ${total:,.2f}")
        for r in data["monthly"]:
            if r["month"] == now.strftime("%Y-%m"):
                print(f"  {r['model']:<22} ${r['usd']:>9,.2f}  {r['messages']} messages")
        return
    status = write(now.strftime("%Y-%m-%d"), data)
    print(f"wrote snapshots/{now:%Y-%m-%d} finance.claude ({len(data['rows'])} daily rows, {len(data['monthly'])} monthly rows, this month ${total:,.2f} at list price): HTTP {status}")


if __name__ == "__main__":
    main()
