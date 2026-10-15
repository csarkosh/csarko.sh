---
description: Cookieless web analytics: a 3 KB script and a 1 MB static collector that counts visits and the path each one took, written as JSON lines.
status: released
page: https://apps.csarko.sh/lib-visits
platforms: Linux, macOS
alt: One visit, start to finish: arrived from a Google search, read three pages for 41 seconds, 22 seconds and 3 minutes, then clicked out to GitHub
license: GPL-3.0
repo: https://github.com/csarkosh/lib-visits
released: 2026-10-15
tags: Rust, JavaScript, Analytics
---
# lib-visits

Visits and journeys for your site, with no cookies, no stored ID and no fingerprinting. One script
of 3,068 bytes on the page and one static binary on the server, which writes what it sees as JSON
lines: where a visit came from, each page it read, how long and how far, and where it went next.

It runs anywhere a binary runs, and the events go wherever you keep logs. It counts csarko.sh.
