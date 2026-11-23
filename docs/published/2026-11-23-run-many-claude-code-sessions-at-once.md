---
description: Worktrees keep parallel Claude Code sessions apart, hooks and agent view say which one needs you, and only the conversation survives a restart.
published: 2026-11-23
categories: Tooling, AI
series: Arkos IDE notes
related: update-the-ide-keep-the-shells, bring-the-agents-back-after-a-reboot
project: ide-arkos
pill: See the inbox in Arkos IDE
project-line: Arkos IDE, a Mac app that keeps many Claude Code sessions running side by side, is the author's own answer to this question: its session list sorts by which session needs you.
closing: Open Arkos IDE with three sessions running and watch the session list. A session asking for a permission rises under Needs you as it asks, not six seconds later, because Arkos listens for the PermissionRequest hook (section 3); one that has finished waits under Unread. That is sections 3 and 5 put into one list.
asks: How do you run many Claude Code sessions at once and know which needs you?
---
# How to run many Claude Code sessions at once

**Question:** When several Claude Code sessions run at once, how do you keep their edits apart, know which one is waiting on you, and keep them through a closed window or a restart?

**Short answer:** Give each session its own git worktree: `claude --worktree` makes one, and background sessions move into one by themselves. Claude Code's hooks report when a session works, asks for a permission and stops, and as of Nov 23, 2026 Anthropic's agent view lists background sessions by state; for terminal sessions, terminals such as cmux mark the pane that needs you. A closed window is survivable through agent view or tmux. A restart stops every session, and `--resume` brings back only the conversation.

**What that leaves open:** where each signal goes blind. No hook fires when you interrupt a session or answer a permission, a permission notification waits about six seconds, and tmux silences panes you are not looking at. By the end you can check which of these a given setup covers, and what ten sessions cost against a plan's usage limit.

**In numbers:**

- **About 6 s** before Claude Code's permission notification fires, against an instant `PermissionRequest` hook ([section 3](#hooks-say-what-a-session-is-doing-with-two-blind-spots)).
- **No hook** fires when you interrupt a session with Esc or Ctrl+C ([section 3](#hooks-say-what-a-session-is-doing-with-two-blind-spots)).
- **Three terminals**, Ghostty, Kitty and iTerm2 (once its alerts are on), get Claude Code's desktop notification; others get nothing without setup ([section 4](#getting-the-signal-to-you-terminals-tmux-and-phones)).
- **Ten sessions use quota about ten times as fast** as one, in Anthropic's words ([section 5](#one-list-of-every-session-agent-view-and-the-tools)).

## 1. Five sessions are five things to check

A blogger who tried running several Claude Code sessions side by side wrote the sentence that frames this whole document: "Five sessions don't give me five workers. They give me five things to check." [1] Their summary of why they stopped was that "The work wasn't the problem. The context switching was." [1] That is not a rare setup. Another author logged 204 sessions in two weeks, with a peak of 13 running at once, usually one per git worktree [2]. That author built an open-source tool for the problem, so treat their framing as an interested party's, but the data is specific: of 507 blocked commands, 25 were `git add -A` run while another session was active in the same tree [2].

Anthropic's own overview lists five ways to work on several tasks at once: subagents, agent view, agent teams, dynamic workflows and projects [3]. This document is about the plainest of them, several separate Claude Code sessions that you start and watch yourself, and about the three problems that show up as soon as there are more than two.

The first is that edits collide: two sessions change the same file and one overwrites the other. The second is that you do not know which session is waiting on you, so a permission prompt sits unanswered while you watch a different terminal. The third is that sessions disappear: a closed window, an app update or a restart ends work that you cannot easily describe again. One commenter who runs agents in tmux with a worktree each says it "keeps things lightweight but means I have zero observability into what each agent is actually doing" [4].

The order of the sections follows the order the problems bite. Edits that collide come first, because without isolation nothing else matters.

## 2. Worktrees keep the edits apart, not the ports

A git worktree is a second working directory with its own files and branch that shares the repository's history and remote with your main checkout [5]. Anthropic's recommended workflow for parallel sessions is exactly this: `claude --worktree feature-auth` in one terminal, and the same command with a different name in a second terminal to start an isolated parallel session [6]. By default the worktree is created under `.claude/worktrees/<name>/` at the repository root, on a new branch named `worktree-<name>` [5]. The `--worktree` flag (short form `-w`) was added in v2.1.49, released Feb 19, 2026 [7], [8].

Background sessions, which section 5 covers, isolate themselves. Dispatched from agent view or started with `claude --bg`, a session moves itself into a worktree under `.claude/worktrees/` before it edits files [9]. There are exceptions: a session you moved to the background from an open terminal with the left arrow or `/background` keeps editing where it already was, and outside a git repository there is no isolation at all, so Anthropic's advice is to avoid dispatching parallel sessions that edit the same files [9]. Agent teams, a separate feature, do not isolate their teammates in worktrees [3].

The isolation has edges, and Anthropic documents them. Claude Code enforces it with four checks, covering file edits, the command's working directory, git redirects such as `git -C` and `GIT_DIR`, and the shape of the command. The docs add: "None of them tracks which files a shell command writes, so a command that writes into the main checkout without running git there, such as `cp` or a shell redirect, isn't refused by them." [5] Two things stay shared on purpose. The `.git` directory is shared, because git commands in a worktree write to the main repository's. And choosing "Yes, and don't ask again" for a Bash command in a worktree saves the rule to the main checkout's `.claude/settings.local.json`, where it applies to every other worktree of the repository and survives the worktree's removal [5].

What a worktree never separated is everything that is not files. One Hacker News commenter put it as "worktrees isolate code, not the environment. Port 3000/5432/8080 still gets fought over." [10] The author of the 13-session data says their sessions "share one process table, one set of ports, one pool of RAM, one disk, and sometimes one working tree," and that "The problem is that the agent has no idea the other sessions exist." [2] A worktree is a fresh checkout, so Anthropic's docs tell you to initialize your development environment there; a `.worktreeinclude` file copies gitignored files such as `.env`, and the `worktree.symlinkDirectories` setting avoids duplicating large directories [5], [11]. Databases and running dev servers are not in that list, which matches the practitioners' reports.

Merge conflicts do not disappear either; they move to merge time. Anthropic's worktree page, as read for this research, describes isolating edits and does not describe resolving merges. A commenter who runs parallel sessions picks "tasks for each tree that are unlikely to have merge conflicts" [12], and another commenter's complaint is that most of these tools do little to make merges or conflicts with the main branch simpler [13].

Isolation is settled by a worktree per session. Knowing which session needs you is not, and the first place to look for that is the hooks Claude Code already runs.

## 3. Hooks say what a session is doing, with two blind spots

A hook is a command that Claude Code runs when something happens in a session. Every event passes the command a JSON object with fields such as `session_id`, `transcript_path` and `cwd` [14]. Read together, the events say what state a session is in, and the table below is that mapping. Look at the second column: the one permission signal that arrives instantly and the one that arrives about six seconds later are both in it.

| Event | Fires when | State it signals |
|---|---|---|
| `UserPromptSubmit` | A prompt is submitted, and on turns Claude Code starts on its own [14] | Working begins |
| `PreToolUse`, `PostToolUse` | Before and after a tool call [14] | Working |
| `PermissionRequest` | Claude Code is about to ask you for permission [14] | Waiting for permission, at once |
| `Notification` with `permission_prompt` | The prompt "has waited about six seconds" [14] | Waiting for permission, about 6 s later |
| `Stop` | The main agent has finished responding [14] | Finished, or waiting for your reply |
| `Notification` with `idle_prompt` | Claude "finished responding about 60 seconds ago and you haven't typed since" [14] | A reminder that it is still your move |
| `StopFailure` | The turn ends on an API error [14] | Failed |
| `SessionEnd` | A session terminates [14] | Gone |

Two rows need a note. `Stop` cannot tell a finished task from a question put to you; the input carries `last_assistant_message`, so a script can read it and guess [14]. And `PermissionRequest` does not fire for a sandboxed command's network request, which only the `permission_prompt` notification reports [14].

The first blind spot is the interrupt. The reference says `Stop` "Does not run if the stoppage occurred due to a user interrupt," and API errors fire `StopFailure` instead [14]. Pressing Esc or Ctrl+C fires nothing. A maintainer of a tmux plugin reported in issue #70370 that "no hook fires. There is no interrupt/abort event"; that issue was closed as not planned on Aug 5, 2026 for inactivity [15]. Issue #9516, a request for a user-interrupt hook open since Oct 14, 2025, has a commenter running several sessions in tmux who sets "working" on `UserPromptSubmit` and "idle" on `Stop`, and who reports the session showing as working indefinitely after an interrupt [16]. A board driven by hooks therefore shows an interrupted session as working until its next event. As of Nov 23, 2026 the hooks reference contains no interrupt event; whether a later release adds one is unconfirmed.

The second blind spot is the answer. The research found no hook that reports a permission or a question was answered. The nearest event is `PostToolUse`, which arrives only after the approved tool has run, so a long command keeps a session looking blocked after you answered. The Arkos IDE guide says the same thing: "No hook says a permission or a question was answered" [17].

Two other sources of state are weaker. The status line receives JSON session data on stdin, and its documented fields include no working or waiting state; Claude Code debounces updates at 300 ms, its event-driven triggers "can go quiet when the main session is idle," and it hides during permission prompts [18]. Transcripts live at `~/.claude/projects/<project>/<session-id>.jsonl`, but Anthropic says the entry format "is internal to Claude Code and changes between versions, so scripts that parse these files directly can break on any release" [19]. Reading them is possible and fragile.

The hooks produce the signal. It still has to reach you, and that depends on the terminal.

## 4. Getting the signal to you: terminals, tmux and phones

Claude Code's own notification setting is `preferredNotifChannel`, which defaults to `auto`. With `auto`, Claude Code "sends a desktop notification when it detects iTerm2, Ghostty, or Kitty, rings the bell in Terminal.app only when its audible bell is off, and does nothing elsewhere" [11]. That is the source of the three terminals in the In numbers list. For any other terminal, such as Warp or the VS Code integrated terminal, Anthropic's terminal page says to use a hook or set the channel to `terminal_bell` [20]. iTerm2 shows its desktop notification only after you turn on its alert settings [20].

tmux adds a second gap. Desktop notifications do not reach the outer terminal until you set `allow-passthrough on` in `~/.tmux.conf`, and even then the docs warn: "With this sample, a pane in a window you aren't viewing sends none." [20] For someone who keeps one session per tmux window, that means the sessions you are not looking at are the ones that stay silent.

A `Notification` hook fills the gap, and it runs alongside the built-in notification instead of replacing it [20]. You receive the hook event even with desktop notifications turned off, since the setting changes only how you are alerted, not whether the hook runs [14]. The hooks guide shows `osascript -e 'display notification "Claude Code needs your attention" with title "Claude Code"'` for macOS and `notify-send` for Linux [21]. It also names the traps: `osascript` routes through the Script Editor app, so if that app lacks notification permission the command fails silently, and `notify-send` needs a notification daemon that headless servers, SSH sessions and most containers do not have [21]. For a phone, a PyPI package that sends these events to ntfy exists [22]; this research did not test it.

One more channel is documented but unevenly supported. If a terminal implements the OSC 7501 Program Status Protocol, it can show whether each interactive session is working, waiting on you or done; it needs Claude Code v2.1.295 or later and does not report background sessions [20]. The docs do not name a terminal that implements it, and this research did not find one.

The cmux author describes the pain this solves. They used Ghostty with many split panes and native macOS notifications, and found that Claude Code's notification body is always the same generic waiting line [23]. One notification per session works for two or three sessions. Past that, what scales is one list.

## 5. One list of every session: agent view and the tools

Anthropic's answer is agent view. `claude agents` opens "one screen for all your background sessions: what's running, what needs your input, and what's done" [9]. It was introduced as a research preview in v2.1.139, released May 11, 2026 [9], [8], and as of Nov 23, 2026 it is still described that way. A session has one of six states: Working, Needs input, Idle, Completed, Failed or Stopped [9]. You dispatch work with `claude --bg "<prompt>"`, `/bg`, or the left arrow on an empty prompt; Space peeks at a session, you can reply without attaching, and Enter attaches [9]. While agent view is open, Claude Code sends a notification through your configured channel when a local background session starts needing input, finishes or fails [9]. The matching hook types, `agent_needs_input` and `agent_completed`, fire only while agent view is open in a terminal [14].

The scope matters. The docs describe agent view for background sessions, including ones you move into it with the left arrow, and this research found no documented single screen for separate interactive sessions in other terminals. That gap is why the community tools below exist.

The quota is the other limit. Anthropic's agent view page says: "running ten agents in parallel uses quota roughly ten times as fast as running one" [9]. Pro and Max plans have a five-hour session limit and a weekly limit, shared across Claude and Claude Code [24]. This research found no documented cap on the number of background sessions, and no Anthropic sentence recommending a number for one person. A cost trap sits in the idle ones: your first message after a break longer than the cache lifetime misses the cache and reprocesses your full context [25]. Ten sessions cost ten sessions' tokens, plus the cost of waking each one.

The tools below sit between plain terminals and agent view. The table compares what the research could confirm from each tool's own pages; look at the "Needs-you signal" column, where the answers differ most, and at the cells that say not checked.

| Tool | Isolation | Needs-you signal | After a restart | Stars, Nov 23, 2026 |
|---|---|---|---|---|
| Claude Squad, AGPL-3.0, last release Aug 20, 2026 [26] | A worktree and a tmux session per task | A status list in its terminal UI; details not checked | tmux holds sessions while the machine runs; not checked after a restart | 8,857 |
| cmux, a Ghostty-based macOS terminal [23] | None; it is a terminal, not a worktree manager | A blue ring on the pane, a lit tab, an unread badge and a notification panel [23] | Restores windows, panes, working directories and best-effort scrollback, but "they do not keep arbitrary live processes running" [23] | 28,921 |
| vibe-kanban, Apache-2.0 [27] | A branch, a terminal and a dev server per workspace | A kanban board; details not checked | Not checked | 28,795 |
| Conductor, macOS only, free as of Nov 23, 2026 per its site [28] | A branch, a worktree and a run environment per workspace [28] | Not found in the pages read | Not found | No public repository |
| Crystal [29] | Git worktrees | Not checked | Not checked | 3,128 |

Two entries carry a warning. vibe-kanban announced it is sunsetting: its team wrote that "the vast majority are free users and we couldn't find a business model that we could get excited about" and that the project "will live on, open source and community maintained" [30]; it still shipped v0.1.46 on Nov 15, 2026 [27]. Crystal is deprecated: its README says "Crystal is deprecated and replaced by Nimbalyst" [29]. Conductor's own site says "At some point we plan to charge for collaboration features" [28].

A list helps only if the sessions are still there tomorrow, and a window can close, an app can update and a Mac can restart before then.

## 6. A closed window, an update, a restart: what survives each

The three events differ, so they are taken one at a time.

**A closed window.** A plain `claude` run is tied to its terminal and ends when the terminal closes, unless you send it to the background [9]. Background sessions are the exception: "Background sessions don't need any terminal open to keep working," because a supervisor process runs them [9]. If that supervisor stops, on macOS and Linux sessions stop about a minute later unless `claude agents` runs again, and a finished or waiting session left unattached for about an hour may have its process stopped, with the conversation staying on disk; pinning it with Ctrl+T keeps it running [9]. The community route is tmux or zellij. cmux's docs say a local tmux server survives cmux quitting, crashing and updating, but "cannot survive logout, restart, shutdown, or power loss" [23]. Zellij saves sessions as "waiting to be recreated after an intentional quit or an unintentional crash," and it "does not immediately run resurrected commands" [31].

**An update, and sleep.** For background sessions, "Session state persists on disk through auto-updates and supervisor restarts. Sessions are also preserved when your machine sleeps." [9] That sentence covers agent view only. What a terminal session does through an update of the terminal app depends on the app and on tmux, as the cmux line above shows.

**A restart or shutdown.** "Shutting down still stops running sessions." [9] Afterwards a session that was working shows as failed if it last progressed within 48 hours, and as stopped beyond that [9]. For any session, `claude --resume` reopens the saved conversation. It restores the history, the model, the permission mode with exceptions, and an active goal with its counters reset [19]. It does not rerun a tool that was still running when the process ended, and "Background Bash and monitor tasks aren't restored" [19]. A background subagent, command or workflow that ended with the old process shows up as a note that it did not finish; Claude reads the note with your next prompt rather than starting a turn from it [19]. Launch flags are not restored either: `--mcp-config`, `--plugin-dir`, `--add-dir`, `--settings`, `--fallback-model` and the tool allow and deny flags have to be passed again [19].

Two cautions apply to resuming. If you resume the same session in two terminals at once, both write to one transcript and messages can go missing; adding `--fork-session` to each command keeps both conversations [19]. And transcripts are kept for 30 days by default, controlled by `cleanupPeriodDays` [19]; the sweep deletes them without showing a message [11]. The "Resume this conversation?" dialog also estimates the share of your five-hour limit that the saved conversation alone would use [19].

Two earlier reports on this site go deeper on the two cases a tool can fix: [Update the IDE, keep the shells](https://csarko.sh/research/update-the-ide-keep-the-shells) and [Bring the agents back after a reboot](https://csarko.sh/research/bring-the-agents-back-after-a-reboot).

All the pieces exist: worktrees, hooks, a notification path, a list, tmux and `--resume`. The remaining question is how one app puts them together.

## 7. One way to put the pieces together: Arkos IDE

The author of this page built Arkos IDE, so read this section as one option among the others, written from its own guide. As of Nov 23, 2026, it installs eight Claude Code hook entries by itself, merging them into `~/.claude/settings.json` each time it starts, after writing a `.bak` file [17]. From those hooks it sorts each session into a state: working; needs you (a permission, a question or a plan to approve); unread, which means it stopped and you have not looked yet; unanswered, which is still your move after you looked; or ended [17]. The sidebar lists sessions grouped by what they need, a "Next session that needs you" command in the palette goes to the first one that is your move, and the Dock icon counts sessions that need you or are unread [17]. A terminal bell marks a tab as waiting too, so a `claude` set to ring the bell works without hooks [17].

Its answer to the second blind spot is a convention: Enter or a digit typed into a session that needs you counts as the answer, and the session shows as working again [17]. That is a guess about your intent, since no hook confirms it. The first blind spot applies to Arkos IDE as to every hook-driven tool: the guide describes a session as working after a prompt is sent or a tool runs, and with no interrupt event, a session you stopped with Esc keeps that mark until the next event arrives. The guide does not claim a way around it.

For the other two problems, the guide describes a daemon that keeps shells through an app update, applying the update "with every shell still there" [17]. After a restart, the daemon recreates each shell in its folder and types `claude --resume <id>` into those that had a Claude Code session; it brings back no half-finished tool call, running build, shell variable or background job [17]. Its history and manifest sit on the Mac [17]. Those are the two cases the earlier reports cover. It runs on Macs with Apple silicon and macOS 14 or later [32].

None of this settles the quota. However the sessions are listed, ten of them draw on the same five-hour and weekly limits.

## Sources

1. A. Dytko, "I stopped running parallel Claude Code sessions," Substack, Nov. 10, 2026. Accessed: Nov. 23, 2026. [Online]. Available: https://productpeak.substack.com/p/i-stopped-running-parallel-claude
2. M. Kang, "I ran 13 Claude Code sessions at once. Here's what the data revealed," HackerNoon, Nov. 11, 2026. Accessed: Nov. 23, 2026. [Online]. Available: https://hackernoon.com/i-ran-13-claude-code-sessions-at-once-heres-what-the-data-revealed
3. Anthropic, "Run agents in parallel," Claude Code Docs. Accessed: Nov. 23, 2026. [Online]. Available: https://code.claude.com/docs/en/agents.md
4. saadn92, comment on Hacker News, Apr. 1, 2026. Accessed: Nov. 23, 2026. [Online]. Available: https://news.ycombinator.com/item?id=47604127
5. Anthropic, "Run parallel sessions with worktrees," Claude Code Docs. Accessed: Nov. 23, 2026. [Online]. Available: https://code.claude.com/docs/en/worktrees.md
6. Anthropic, "Common workflows," Claude Code Docs. Accessed: Nov. 23, 2026. [Online]. Available: https://code.claude.com/docs/en/common-workflows
7. Anthropic, "CHANGELOG.md," anthropics/claude-code, GitHub. Accessed: Nov. 23, 2026. [Online]. Available: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
8. Anthropic, "Releases," anthropics/claude-code, GitHub. Accessed: Nov. 23, 2026. [Online]. Available: https://github.com/anthropics/claude-code/releases
9. Anthropic, "Manage agents with agent view (background agents)," Claude Code Docs. Accessed: Nov. 23, 2026. [Online]. Available: https://code.claude.com/docs/en/agent-view.md
10. NBenkovich, comment on Hacker News, Feb. 23, 2026. Accessed: Nov. 23, 2026. [Online]. Available: https://news.ycombinator.com/item?id=47121950
11. Anthropic, "All settings (settings reference)," Claude Code Docs. Accessed: Nov. 23, 2026. [Online]. Available: https://code.claude.com/docs/en/settings-reference.md
12. hydropax, comment on Hacker News, Sep. 1, 2026. Accessed: Nov. 23, 2026. [Online]. Available: https://news.ycombinator.com/item?id=49516365
13. sathish316, comment on Hacker News, Dec. 30, 2025. Accessed: Nov. 23, 2026. [Online]. Available: https://news.ycombinator.com/item?id=46429365
14. Anthropic, "Hooks reference," Claude Code Docs. Accessed: Nov. 23, 2026. [Online]. Available: https://code.claude.com/docs/en/hooks.md
15. "Feature request: a hook event for user interrupt/abort of a turn," Issue #70370, anthropics/claude-code, GitHub. Accessed: Nov. 23, 2026. [Online]. Available: https://github.com/anthropics/claude-code/issues/70370
16. "[FEATURE] User Interrupt Hook," Issue #9516, anthropics/claude-code, GitHub. Accessed: Nov. 23, 2026. [Online]. Available: https://github.com/anthropics/claude-code/issues/9516
17. Arkos IDE, "Arkos IDE guide," GitHub. Accessed: Nov. 23, 2026. [Online]. Available: https://github.com/csarkosh/ide-arkos/blob/main/docs/guide.md
18. Anthropic, "Customize your status line," Claude Code Docs. Accessed: Nov. 23, 2026. [Online]. Available: https://code.claude.com/docs/en/statusline
19. Anthropic, "Manage sessions," Claude Code Docs. Accessed: Nov. 23, 2026. [Online]. Available: https://code.claude.com/docs/en/sessions.md
20. Anthropic, "Configure your terminal for Claude Code," Claude Code Docs. Accessed: Nov. 23, 2026. [Online]. Available: https://code.claude.com/docs/en/terminal-config.md
21. Anthropic, "Automate actions with hooks (hooks guide)," Claude Code Docs. Accessed: Nov. 23, 2026. [Online]. Available: https://code.claude.com/docs/en/hooks-guide.md
22. "claude-code-ntfy-notification-hook," PyPI. Accessed: Nov. 23, 2026. [Online]. Available: https://pypi.org/project/claude-code-ntfy-notification-hook/
23. manaflow-ai, "cmux," GitHub repository. Accessed: Nov. 23, 2026. [Online]. Available: https://github.com/manaflow-ai/cmux
24. Anthropic, "Using Claude Code with your Pro or Max plan," Claude Help Center. Accessed: Nov. 23, 2026. [Online]. Available: https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan
25. Anthropic, "Manage costs effectively," Claude Code Docs. Accessed: Nov. 23, 2026. [Online]. Available: https://code.claude.com/docs/en/costs.md
26. smtg-ai, "claude-squad," GitHub repository. Accessed: Nov. 23, 2026. [Online]. Available: https://github.com/smtg-ai/claude-squad
27. BloopAI, "vibe-kanban," GitHub repository. Accessed: Nov. 23, 2026. [Online]. Available: https://github.com/BloopAI/vibe-kanban
28. Conductor, "Conductor," conductor.build. Accessed: Nov. 23, 2026. [Online]. Available: https://www.conductor.build/
29. stravu, "crystal," GitHub repository. Accessed: Nov. 23, 2026. [Online]. Available: https://github.com/stravu/crystal
30. Vibe Kanban, "Vibe Kanban is sunsetting," vibekanban.com, Apr. 10, 2026. Accessed: Nov. 23, 2026. [Online]. Available: https://www.vibekanban.com/blog/shutdown
31. Zellij Contributors, "Session resurrection," Zellij documentation. Accessed: Nov. 23, 2026. [Online]. Available: https://zellij.dev/documentation/session-resurrection.html
32. Arkos IDE, "README: Install," GitHub. Accessed: Nov. 23, 2026. [Online]. Available: https://github.com/csarkosh/ide-arkos#install
