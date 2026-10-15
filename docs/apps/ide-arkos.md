---
description: A terminal layout manager for many Claude Code sessions at once: panes with tabs, a docked Chrome pane, a file tree, and a daemon that keeps them alive.
status: released
page: https://apps.csarko.sh/ide-arkos
platforms: macOS
license: GPL-3.0
repo: https://github.com/csarkosh/ide-arkos
released: 2026-10-15
order: 1
link: Install and docs
sections: Session awareness, After a restart, Sidebar and viewer, Browser pane, Keyboard, Config, Updating, If you get headaches, License
tags: Rust, GPUI, macOS
---
# Arkos IDE

A grid of terminal panes with tabs for running many Claude Code sessions side by side, a docked
Chrome pane, and a file tree with a git worktree explorer, in a window that stays light on memory
and scrolls smoothly. Every session lives in a separate daemon, so a frozen window never loses
work, and a restart brings them all back where they were.

Written in Rust with GPUI, for Apple silicon Macs. Installed from the Homebrew tap, it updates itself.
