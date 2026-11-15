---
description: A terminal layout manager for many Claude Code sessions at once: panes with tabs, a docked Chrome pane, a file tree, and a daemon that keeps them alive.
status: released
page: https://apps.csarko.sh/ide-arkos
platforms: macOS
license: GPL-3.0
repo: https://github.com/csarkosh/ide-arkos
released: 2026-10-15
order: 2
link: Install and docs
tags: Rust, GPUI, macOS, Claude Code
alt: Six Arkos IDE windows fanned out like postcards, each in its own theme: in front the multi tasker, three Claude Code sessions each running its own subagents on an unrelated project; behind, the blogger, the data analyst, the hacker, the student and the web developer
hero-video: docs/images/hero.mp4
hero-video-alt: The camera pulls back from the tab bar of an Arkos IDE window, its sessions working and waiting, to show it in Navy Runic with every other persona's window fanned behind it, each in its own theme
swap: docs/images/multitasker-dark.png Tokyo Rain | docs/images/multitasker-navy.png Navy ; docs/images/blogger-dark.png Peach Watercolor | docs/images/blogger-lavender.png Lavender Watercolor ; docs/images/indie-game-dev-dark.png Timo Purple | docs/images/indie-game-dev-solar.png Arabia Solar
layouts: Inbox -inbox | Grid
layouts-show: docs/images/multitasker-solar.png
layouts-lede: Pick one in Settings and switch whenever you like: the same sessions and files, regrouped.
layouts-copy: Every session in one list, sorted by what it asks of you: needs you, unread, new, working, quiet. One session at full size, the files it opened beside it. | Panes and tabs you split and arrange, every session in view at once, each tab marked when it is working or waiting on you.
blurb: a Mac app that keeps many Claude Code sessions running side by side
---
# Arkos IDE

I run several Claude Code sessions at once, so I built an IDE for it. Through Claude Code's hooks,
every tab shows whether its session is working or waiting on you, and a daemon brings each session
back, resumed, after a frozen window, an update or a restart. Agents inside it can open a video, a
document or a web page in a pane beside you with one command.

Written in Rust with Claude Code, nearly every one of its 600+ commits, and I now build it inside
Arkos itself. The hardest parts started as research with Claude, such as
[keeping the shells alive through an update](/research/update-the-ide-keep-the-shells).
