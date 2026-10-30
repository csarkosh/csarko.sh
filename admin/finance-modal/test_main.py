"""The row shaping, over a fixture of report rows. `python3 -m pytest admin/finance-modal`
or `python3 admin/finance-modal/test_main.py`."""

from datetime import datetime, timezone
from decimal import Decimal

import main

NOW = datetime(2026, 10, 29, 10, 2, 0, tzinfo=timezone.utc)


def row(day, app, cost, env="main", object_id="ap-1"):
    return {
        "object_id": object_id,
        "description": app,
        "environment_name": env,
        "interval_start": datetime.fromisoformat(day).replace(tzinfo=timezone.utc),
        "cost": Decimal(cost),
        "tags": {},
    }


FIXTURE = [
    row("2025-10-03", "cinema-spike", "1.50"),  # 13 months back: monthly only
    row("2026-08-01", "dayhike-record", "0.00"),  # a zero row: dropped everywhere
    row("2026-08-29", "cinema-spike", "2.25"),  # 61 days back: monthly only
    row("2026-08-30", "cinema-spike", "0.75"),  # 60 days back: the first daily row
    row("2026-10-24", "cinema-spike", "40.0001"),
    row("2026-10-24", "dayhike-record", "6.64", env="dev"),
    row("2026-10-20", "cinema-spike", "27.28"),
    row("2026-10-20", "", "0.10", object_id="ap-nameless"),  # no description: the id
]


def test_shape():
    part = main.shape(FIXTURE, NOW, 30.0)
    assert part["at"] == "2026-10-29T10:02:00Z"
    assert part["lastDay"] == "2026-10-24"
    assert part["credits"] == 30.0
    assert part["rows"] == [
        {"day": "2026-08-30", "app": "cinema-spike", "env": "main", "cost": 0.75},
        {"day": "2026-10-20", "app": "ap-nameless", "env": "main", "cost": 0.1},
        {"day": "2026-10-20", "app": "cinema-spike", "env": "main", "cost": 27.28},
        {"day": "2026-10-24", "app": "cinema-spike", "env": "main", "cost": 40.0001},
        {"day": "2026-10-24", "app": "dayhike-record", "env": "dev", "cost": 6.64},
    ]
    assert part["monthly"] == [
        {"month": "2025-10", "app": "cinema-spike", "cost": 1.5},
        {"month": "2026-08", "app": "cinema-spike", "cost": 3.0},
        {"month": "2026-10", "app": "ap-nameless", "cost": 0.1},
        {"month": "2026-10", "app": "cinema-spike", "cost": 67.2801},
        {"month": "2026-10", "app": "dayhike-record", "cost": 6.64},
    ]


def test_shape_empty():
    part = main.shape([], NOW, 30.0)
    assert part["lastDay"] is None
    assert part["rows"] == [] and part["monthly"] == []


def test_month_start():
    d = NOW.date()
    assert main.month_start(d, 0).isoformat() == "2026-10-01"
    assert main.month_start(d, 12).isoformat() == "2025-10-01"
    assert main.month_start(d.replace(month=1), 1).isoformat() == "2025-12-01"
    assert main.month_start(d, -1).isoformat() == "2026-11-01"
    assert main.month_start(d.replace(month=12), -1).isoformat() == "2027-01-01"


if __name__ == "__main__":
    for name, test in list(globals().items()):
        if name.startswith("test_"):
            test()
            print(f"ok {name}")
