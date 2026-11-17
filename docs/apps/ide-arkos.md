---
description: A terminal layout manager for many Claude Code sessions at once: panes with tabs, a web pane, a markdown editor, a file tree and a daemon that keeps them alive.
status: released
page: https://apps.csarko.sh/ide-arkos
platforms: macOS
license: GPL-3.0
repo: https://github.com/csarkosh/ide-arkos
released: 2026-10-15
order: 2
link: Install and docs
tags: Rust, GPUI, macOS, Claude Code
alt: Seven Arkos IDE windows fanned out like postcards, each in its own theme. In front, the multi tasker: three Claude Code sessions side by side, each running its own subagents on an unrelated project. Behind, the blogger with a launch plan in the markdown editor, the data analyst with a weekly report and its chart, the hacker hardening a service in Matrix green, the indie game dev with a dungeon crawl in pixel-framed purple, the student with lecture notes on a ruled notebook page, and the web developer with the app's page in a web tab
hero-video: docs/images/hero.mp4
hero-video-alt: The camera pulls back from the session list of an Arkos IDE window, its sessions sorted by what they need from you, to show it in Tokyo Rain with every other persona's window fanned behind it, each in its own theme
swap: docs/images/multitasker-dark-inbox.png Tokyo Rain | docs/images/multitasker-navy-inbox.png Material Navy ; docs/images/blogger-dark-inbox.png Watercolor Peach | docs/images/blogger-lavender-inbox.png Watercolor Lavender ; docs/images/indie-game-dev-dark-inbox.png Timo Purple | docs/images/indie-game-dev-solar-inbox.png Solar Arabia
blurb: a Mac app that keeps many Claude Code sessions running side by side
---
# Arkos IDE

I run several Claude Code sessions at once, so I built an IDE for it. Through Claude Code's hooks,
every tab shows whether its session is working or waiting on you, and a daemon brings each session
back, resumed, after a frozen window, an update or a restart. Agents inside it can open a video, a
document or a web page in a pane beside you with one command.

Written in Rust with Claude Code, nearly every one of its 1,200+ commits, and I now build it inside
Arkos itself. The hardest parts started as research with Claude, such as
[keeping the shells alive through an update](/research/update-the-ide-keep-the-shells).
