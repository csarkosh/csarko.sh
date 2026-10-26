---
description: Cookieless web analytics: a 3 KB script and a 1 MB static collector that counts visits and the path each one took, written as JSON lines.
status: released
page: https://apps.csarko.sh/lib-visits
platforms: Linux, macOS
alt: One visit, start to finish: arrived from a Google search, read three pages for 41 seconds, 22 seconds and 3 minutes, then clicked out to GitHub
license: GPL-3.0
repo: https://github.com/csarkosh/lib-visits
released: 2026-10-15
tags: Rust, JavaScript, Analytics, Claude Code
order: 3
---
# lib-visits

When my analytics host went down, I researched with Claude [what a cookieless counter can
know](/research/visits-without-cookies), then built lib-visits with Claude Code, from design doc to
first release in one day. A 3 KB script and a small Rust collector count visits and the path each
one took, with no cookies, no stored ID and no fingerprinting.

It counts csarko.sh. Its events land in BigQuery as JSON lines, so Claude can answer which pages
people read and where they came from, straight from the command line.
