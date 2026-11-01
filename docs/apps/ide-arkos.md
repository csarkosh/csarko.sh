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
alt: Three Arkos IDE windows fanned out like postcards: in front the multi tasker, three Claude Code sessions each running its own subagents on an unrelated project; behind, the web developer with the app's page in a web tab, and the blogger with posts open in the markdown editor
hero-video: docs/images/hero.mp4
hero-video-alt: The camera pulls back from the tab bar of an Arkos IDE window, its sessions working and waiting, to show it in Navy with the web developer's and the blogger's windows fanned behind it
promo: Sessions that survive updates, restarts and frozen windows. Six built-in themes with animated effects, or your own. A markdown editor you edit in its rendered view, a web pane, a video pane and a file tree with git worktrees.
promo-link: https://github.com/csarkosh/ide-arkos/blob/main/docs/guide.md
---
# Arkos IDE

I run several Claude Code sessions at once, so I built an IDE for it. Through Claude Code's hooks,
every tab shows whether its session is working or waiting on you, and a daemon brings each session
back, resumed, after a frozen window, an update or a restart. Agents inside it can open a video, a
document or a web page in a pane beside you with one command.

Written in Rust with Claude Code, nearly every one of its 600+ commits, and I now build it inside
Arkos itself. The hardest parts started as research with Claude, such as
[keeping the shells alive through an update](/research/update-the-ide-keep-the-shells).
