---
description: After a restart nothing survives, but the layout, scrollback and each agent's conversation can come back on their own; how Claude Code and Codex differ.
published: 2026-10-14
categories: Tooling, AI
source: https://github.com/csarkosh/ide-sarkos/blob/main/docs/superpowers/specs/2026-10-14-update-in-place-design.md
series: Arkos IDE notes
---
# Bring the agents back after a reboot

**Question:** After a computer shutdown or restart (an OS update, or turning it off and on again), how can a terminal IDE bring back a developer's coding-agent sessions automatically; what can and cannot come back; what do macOS and existing terminal tools already do; and how do Claude Code and Codex CLI differ in persisting and resuming a session, in the hooks and ids an outer tool can use, and in what a resumed session restores?

**Short answer:** No process survives a reboot. macOS may kill apps outright to speed up a restart, and launchd sends its jobs SIGTERM and then SIGKILL after a timeout whose default is "system-defined" [1], [2], [3]. What can come back is whatever reached the disk first: the layout, each pane's folder, the scrollback text and each agent's conversation. Existing tools stop short of the conversation: Terminal.app and iTerm2 restore window text, and tmux-resurrect, Zellij and VS Code relaunch saved commands as new processes [4], [5], [6], [7], [8]. Rerunning `claude` or `codex` opens a blank conversation, so recovery needs each pane's session id and the agent's own resume command. Both agents now provide both: a `SessionStart` hook that passes `session_id` and `cwd` on stdin with a `source` of `startup`, `resume`, `clear`, `compact` or `fork`, and a resume-by-id command, `claude --resume <id>` or `codex resume <SESSION_ID>` [9], [10], [11], [12]. Claude Code keeps transcripts 30 days by default, lets the caller choose the id with `--session-id`, and documents what resume restores (history, model, most permission modes, unexpired scheduled tasks) and what it does not (background tasks, launch flags, a tool that was mid-run) [11], [13], [14]. Codex has no expiry setting that this research found, and rebuilds history from its rollout file on resume, but documents little else about what comes back [15], [16], [17]. Sarkos IDE's planned recovery uses exactly these pieces: a daemon started at login recreates each shell in its folder, redraws the saved output and runs each recorded resume command, without ever sending the agent a message.

## 1. What a reboot does to a session

After every restart, the author spends a long time finding each coding-agent session and resuming it by hand. The goal is to make that automatic. An earlier report, [Update the IDE, keep the shells](https://csarko.sh/research/update-the-ide-keep-the-shells), covered updating without ending any process; this one covers the case where the processes do die.

No process survives a reboot: not the shell, not the agent, not a build. What can come back automatically is state that was on disk before the power went: the layout, each pane's folder, the text on screen and each agent's conversation. What is lost is whatever was executing at that moment: a half-finished tool call, a running command, shell variables and background jobs.

### 1.1 SIGTERM comes with no stated deadline

Apple's app guide describes **sudden termination**: the system may kill an app's process at once, without any final actions, to speed up logging out, restarting or shutting down [1]. Apps are told to save user data well before termination can happen, and not to keep it in the window-restoration archive, which the system may ignore [1].

Jobs that launchd started get a signal first: SIGTERM to daemons at shutdown and to user agents at logout, which each job should handle [2]. The gap before SIGKILL is the `ExitTimeOut` key, whose default is "system-defined" [3]. No Apple page found for this report gives the overall shutdown deadline. State should therefore be written continuously, with SIGTERM as a final, best-effort flush.

### 1.2 On disk means past the drive's cache

Apple's fsync(2) page says `fsync` hands data to the drive, which may hold it in its cache for some time; the `F_FULLFSYNC` fcntl asks the drive to flush to permanent storage [18]. Rust's `File::sync_all` already calls `fcntl(fd, F_FULLFSYNC)` on Apple targets instead of `fsync` [19], [20]. Writing a temporary copy, syncing it and renaming it over the old file is the usual way to keep a state file consistent; that is general practice, not something the Apple pages read here describe.

### 1.3 launchd can start a daemon at login

At login a per-user launchd loads the property lists in `~/Library/LaunchAgents` [2], [3]. `RunAtLoad` launches a job once when it is loaded and `KeepAlive` keeps it running; both default to false, and the man page cautions that speculative launches slow login [3]. `launchctl bootstrap gui/<uid> <plist>` loads an agent without logging out [21]. On macOS 13 and later, `SMAppService` registers such helpers for an app instead of a hand-installed property list [22], and they appear under Login Items in System Settings, where the user can turn them off [23].

### 1.4 "Reopen windows" brings back windows, not processes

The restart dialog's **"Reopen windows when logging back in"** checkbox decides whether apps reopen their windows; after a forced restart, macOS uses the last setting chosen [24]. Apple's Resume feature saves an app's window state and restores it on the next launch [1]. It restores the view, not a process that ran inside a window.

## 2. What existing tools restore, and the ceiling

### 2.1 Terminal.app and iTerm2 bring back text

Terminal's Resume settings offer **"Restore text when reopening windows"**, a limit on rows restored, and a bookmark after the restored text [4]. The page read is the Terminal 2.10 edition for macOS 10.15, and it does not say whether the working directory is restored or a command rerun; no Apple source found here does.

iTerm2 runs jobs in long-lived server processes instead of as children of the app, so a crash, a force quit or an upgrade leaves them running; by default Cmd-Q still ends them [5]. Its documentation states that a reboot terminates those jobs and does not restore them; only the window contents come back, under a "Session Restored" banner [5].

### 2.2 tmux-resurrect, tmux-continuum and Zellij relaunch commands

tmux-resurrect saves sessions, windows, panes, layouts, each pane's working directory and the program in each pane [6]. By default it relaunches only an allow-list of programs such as vim, less and htop [6]; `@resurrect-processes` extends the list, an entry can name a different restore command, and `:all:` relaunches everything, which the documentation calls dangerous [25]. Pane text returns only with `@resurrect-capture-pane-contents 'on'` [26]. tmux-continuum saves every 15 minutes and, with `@continuum-restore 'on'`, restores the last save when the tmux server starts [27].

Zellij saves each session's layout and the command in each pane, with viewport and scrollback saving off by default (`pane_viewport_serialization`, `scrollback_lines_to_serialize`) [7]. A resurrected command waits behind a "Press ENTER to run..." banner unless `--force-run-commands` is passed [7].

### 2.3 VS Code revives a process after a clean quit

On an application restart, VS Code restores a terminal's content and relaunches the process with its original environment [8]. `terminal.integrated.persistentSessionReviveProcess` defaults to `onExit`, reviving terminals after the last window closes or the quit command runs; the other values are `onExitAndWindowClose` and `never`, and the working directory returns only if the shell supports it [28]. The source warns that time to save during shutdown is limited [28]. Warp restores windows, tabs, panes and recent blocks, and says nothing about processes [29].

### 2.4 The ceiling: a command line is not a conversation

Every tool above restores the shape of the work and, at best, the text and the command that was running; none restores a process. For `htop` a rerun is a full recovery. For a coding agent it is not: `claude` or `codex` started again opens an empty conversation. A fixed restore command such as `claude --continue` loads the most recent session in that folder [14], which is wrong when two panes share a folder. Recovery needs a per-pane record of the session id, captured while the session runs, and the agent's own resume command.

## 3. Claude Code

### 3.1 A transcript written as you work, kept 30 days

Claude Code saves sessions "continuously to local transcript files as you work", as JSONL at `~/.claude/projects/<project>/<session-id>.jsonl`, where `<project>` is the working directory with non-alphanumeric characters replaced by `-` [11]. The entry format is internal and changes between versions [11]. Retention is **`cleanupPeriodDays`**, minimum 1, **default 30**: a background sweep after a session starts deletes older transcripts without a message [13]. The transcript is written asynchronously and may lag the latest messages [9]. No page read states the flush behaviour, so the loss on a power cut is unknown.

### 3.2 Resume by id from any folder, or choose the id up front

`claude --continue` (`-c`) loads the most recent conversation in the current directory. `claude --resume` (`-r`) takes an id, a name or a `.jsonl` path, and opens a picker without one [14]. Since v2.1.223, `claude --resume <session-id>` searches every project, so it works from any directory when exactly one session matches [11]. **`--session-id <uuid>`** sets the id of a new conversation, and `--fork-session` gives a resumed one a new id [14]. `claude -p --resume <session-id>` continues non-interactively [11], [30]. Two terminals resuming the same session without forking write into one transcript, interleaved [11].

On Pro and Max plans, resuming a session idle for more than about an hour with over 100,000 tokens first offers to resume from a summary or as-is [11]. After a reboot, large sessions will often meet that condition.

### 3.3 Hooks report the id at start, on resume and after /clear

Hooks are configured in user, project or local settings files, managed policy, plugins, or skill and subagent frontmatter [9]. Each command hook receives JSON on stdin with `session_id`, `transcript_path`, `cwd`, `permission_mode` and `hook_event_name` [9]. **`SessionStart`** adds `source`: `startup`, `resume` (from `--resume`, `--continue` or `/resume`), `clear`, `compact`, or `fork`, which v2.1.214 introduced [9]. `/clear` starts a new id, so a record must be overwritten on every `SessionStart`. `Notification` (`permission_prompt`, `idle_prompt`) and `Stop`, which does not fire on a user interrupt, signal that Claude is waiting [9].

**`SessionEnd`** reports a `reason` of `clear`, `resume`, `logout`, `prompt_input_exit` or `other`, with no decision control and a **1.5-second** default timeout, adjustable with `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` [9], [31]. No reason names a signal or crash.

**`CLAUDE_CODE_SESSION_ID`** holds the current id in Bash and PowerShell tool subprocesses, hook commands and stdio MCP servers [31]. It is set for Claude's children, not in the shell that started `claude`, so an IDE cannot read it from the pane; the hook is the route.

### 3.4 What a resumed session restores, and what it does not

The sessions page is specific [11]. Restored: the full history including tool calls and results; the model; an agent started with `--agent`; the permission mode for terminal `--continue` and `--resume`, except that `bypassPermissions` is never restored and `auto` returns only if the account still qualifies; an active goal, with counters reset; and scheduled tasks that have not expired.

Not restored: background Bash and monitor tasks; background work that ended with the old process, which appears as a note that Claude reads with the next prompt; and launch flags, so `--mcp-config`, `--settings`, `--plugin-dir`, `--fallback-model` and `--add-dir` must be passed again [11]. A tool that was running "doesn't finish or run again when you resume": Claude sees the call marked as cut off and is told to check whether it took effect before rerunning it [11]. **`CLAUDE_CODE_RESUME_INTERRUPTED_TURN=1`** instead continues an interrupted turn on its own, with "Continue from where you left off." by default, and is documented for SDK mode [31]. The pages are silent on the to-do list and on MCP connections after resume.

For `claude -p`, SIGTERM ends any running Bash command's process tree, runs `SessionEnd` hooks and exits with code 143 [30]. Interactive SIGTERM, SIGHUP and power loss are not documented; the expected state after a reboot is a transcript ending mid-turn, which resume handles as above.

## 4. Codex CLI

### 4.1 A rollout file per thread, with no expiry found

Codex stores each thread as a **rollout**, a JSONL file at `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread-id>.jsonl`, with `CODEX_HOME` defaulting to `~/.codex` [15]. For a new thread the file is created at the first explicit persist, and items are buffered and written on persist, flush or shutdown [15]. The source shows a flush and no fsync, though that was not checked exhaustively. `history.persistence` and `history.max_bytes` govern a separate `history.jsonl`; **no setting that expires rollouts was found**, in the part of the configuration reference that was read [17]. Removal is manual, with `/archive`, `codex unarchive` and `/delete` [32].

### 4.2 Resume by id, or the latest in this folder

`codex resume` will "Continue an interactive session by ID or resume the most recent chat" [12]. Without an argument it opens a picker; `--last` takes the most recent session in the current directory; `--all` searches beyond it; `--include-non-interactive` adds non-interactive sessions [12]. `codex exec resume` does the same non-interactively and takes a follow-up prompt; `codex fork`, `/fork` and `codex exec fork <SESSION_ID>` copy a session into a new one [12]. If the directory differs from the session's, Codex asks which to use, unless `tui.resume_cwd` is `"current"` or `"session"` or `-C` is passed [12]. Resume accepts model and sandbox overrides [12]. **Nothing equivalent to `--session-id` is documented**; Codex assigns the id.

### 4.3 Lifecycle hooks with the same shape as Claude's

Hooks live in `hooks.json` or a `[hooks]` table in `config.toml`, under `~/.codex` or a repository's `.codex`; they are on by default, and `[features] hooks = false` turns them off [10]. "Non-managed hooks must be reviewed and trusted before they run", through `/hooks` [10]. Events are `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`, `Interrupt`, `SessionStart` and `SessionEnd` [10]. Stdin carries `session_id`, `transcript_path` (possibly null), `cwd`, `hook_event_name` and `model`, and the docs warn that "the transcript format isn't a stable interface for hooks" [10]. `SessionStart` has a required `source` of `startup`, `resume`, `clear`, `compact` or `fork` [10], [33]. Text a `SessionStart` hook prints on stdout is added as developer context, so a hook that only records the id must print nothing [10].

**`SessionEnd`** runs "when you archive or delete a conversation that's still open, when Codex closes normally, or after a conversation has been idle and isn't open in any connected client for 30 minutes"; its `reason` is always `other`, and its timeout defaults to 1 second [10]. The older `notify` setting fires only on `agent-turn-complete` and is marked for removal [34]. Commands Codex runs receive **`CODEX_THREAD_ID`** and **`CODEX_SESSION_ID`** [35], [36]; like Claude's variable, these are for children, and whether hooks receive them was not checked.

### 4.4 What a resumed session restores: history, and little else documented

On resume, Codex replays the rollout to rebuild the history, across compactions; interrupted turns are stored as `TurnAborted` events and matched during the replay [16]. That is source code, not documentation. The documentation read does not say whether the approval mode, the sandbox, MCP servers or a running command come back, only that resume accepts model and sandbox overrides [12]. How Codex treats a turn cut off by power loss, with no end event, is undocumented.

### 4.5 The app server exposes thread state

`codex app-server` speaks JSON-RPC and is described as primarily for development and debugging, liable to change [12], [37]. It has `thread/start`, `thread/resume` and `thread/list`, and each thread reports **`notLoaded`, `idle`, `systemError` or `active`**, with flags such as `waitingOnApproval` [37]. A root thread's session id is its own id; a fork keeps its root's session id, and clients should read `thread.sessionId` [37]. Using this means driving Codex through the app server rather than running `codex` in a pane.

## 5. The two compared, and what an IDE needs from each

| | Claude Code | Codex CLI |
|---|---|---|
| Session file | `~/.claude/projects/<project>/<session-id>.jsonl` | `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread-id>.jsonl` |
| Retention | `cleanupPeriodDays`, default 30 | No expiry setting found |
| Latest here | `claude -c` | `codex resume --last` |
| By id | `claude -r <id>` (or name, or path) | `codex resume <SESSION_ID>` |
| Choose id at launch | `--session-id <uuid>` | Not documented |
| Fork | `--fork-session` | `codex fork`, `/fork` |
| Non-interactive | `claude -p --resume <id>` | `codex exec resume <id>` |
| Hook setup | Settings files, plugins | `hooks.json` or `[hooks]`, trusted via `/hooks` |
| `SessionStart` `source` | `startup`, `resume`, `clear`, `compact`, `fork` | Same five |
| `SessionEnd` | Five reasons; 1.5 s default timeout | Reason `other`; normal close, archive, delete or 30 idle minutes; 1 s default |
| Id for children | `CLAUDE_CODE_SESSION_ID` | `CODEX_SESSION_ID`, `CODEX_THREAD_ID` |
| Resume restores | History, model, agent, permission mode (not bypass), goal, scheduled tasks | History (from source code); rest undocumented |
| Not restored | Background tasks, running tool (marked cut off), launch flags | Undocumented |

### 5.1 Both give an outer tool what it needs

Automatic recovery needs two things: a hook that reports the session id and folder whenever a session starts, resumes, clears or forks, and a command that resumes that id. Both agents now provide both. An IDE can register one small `SessionStart` command with each that writes `session_id`, `cwd` and `source` to a file keyed by pane, and build `claude --resume <id>` or `codex resume <id>` from it, without parsing a transcript that both vendors call unstable [10], [11].

### 5.2 The differences change the details

Claude Code can be handed its id with `--session-id`, so an IDE that launches it knows the id before the first prompt [14]; the hook is still needed, because `/clear`, forks and sessions the user starts by hand create new ids. Codex assigns its own id, so the hook is the only documented route, and a hook the IDE installs must be trusted once by the user and must keep stdout empty [10]. The app server says a Codex fork keeps its root's session id [37]; whether a forked thread's hook `session_id` is what `codex resume` expects is not documented and needs a test. Claude Code's launch flags are not restored, so the IDE must keep the original command line, not only the id, for sessions started with `--add-dir` or `--mcp-config` [11].

Neither `SessionEnd` can mark a session finished for good: Claude Code's has no reason for a signal or crash, and Codex's fires on a normal close or after 30 idle minutes, always as `other` [9], [10]. A reboot guarantees neither. This report's inference is that the IDE should watch whether the agent is still the pane's foreground process and drop the resume record only when the user quits the agent while the machine is up.

## 6. The Sarkos IDE recovery design

Sarkos IDE is the author's terminal-pane IDE for running many coding-agent sessions side by side, written in Rust with gpui for macOS. A window, `sarkos`, attaches to a daemon, `sarkosd`, that owns every pseudo-terminal, so the shells are the daemon's children. The recovery design is planned for a coming milestone and has not shipped. It accepts that nothing survives the daemon's death and plans recovery instead.

### 6.1 Four parts

**Disk-backed replay buffers.** The daemon writes each session's output buffer to `~/Library/Application Support/sarkos/sessions/<id>.replay` a few seconds after output arrives, and in full on SIGTERM. After a reboot the window shows the old output under a divider line, then the fresh shell.

**A session manifest.** For each session it records the working directory, the shell, and the agent inside it as a kind and a resume command, taken from the agent's `SessionStart` hook: `claude --resume <id>` first, `codex resume <id>` in a later milestone. The two hooks deliver the same fields, so the record is the same for both, and the IDE needs no other knowledge of which agent a shell is running.

**Start at login.** A launchd agent, `~/Library/LaunchAgents/sh.csarko.sarkosd.plist`, installed by the window on first run with the user's consent, starts `sarkosd` at login. The daemon reads the manifest, recreates each shell in its folder, runs the recorded resume command where there is one, and marks the tab "resumed after restart". **It only resumes and never sends a message**, so the user decides when each agent continues.

**Reopen the windows.** Once the daemon is listening, `sarkos` is launched in each project folder that had a window open.

Sessions always stay on the local machine. A daemon on another computer is the only way a process could outlive a reboot, and it is ruled out for privacy.

### 6.2 How the design fits the platform and the agents

The replay files follow Apple's advice to save well before termination [1]: the flush seconds after output is the guarantee, and the flush on SIGTERM is a bonus with a "system-defined" budget [3]. As a launchd agent, `sarkosd` falls under the documented rule that user agents get SIGTERM at logout [2], and writing each file with `sync_all`, as the update handover file already is, would take it past the drive's cache [19].

Resuming without a message fits how Claude Code treats an interrupted turn. It marks the cut-off tool and asks the model to check it, and continues on its own only if `CLAUDE_CODE_RESUME_INTERRUPTED_TURN` is set [11], [31], so the IDE should leave that variable unset. A session that ran with `bypassPermissions` comes back in the default mode [11], the safer state for a restart nobody is watching.

One extension follows from launchd's keys: a `KeepAlive` dictionary with `Crashed` restarts a job after a crash [3]. A daemon crash also kills the shells, so the same manifest path would recover them. The spec does not include this.

## 7. Limits and open questions

**What is lost stays lost.** A running build, a dev server, an SSH connection, shell variables and background jobs end with the reboot. Claude Code marks the running tool as cut off; Codex's handling of an in-flight turn is undocumented.

**Codex's resume is thinly documented.** Beyond history, the docs do not say what a resumed Codex session restores, and the replay behaviour above comes from source code that can change [16]. Neither agent documents an interactive session's behaviour on SIGTERM, SIGHUP or power loss, so how much of the last turn reaches the transcript is unknown.

**Transcripts can expire.** Claude Code deletes transcripts older than `cleanupPeriodDays` [13]. Before resuming, the IDE should check that the recorded `transcript_path` still exists, and otherwise open a plain shell with a note.

**Installation and ordering.** The design writes a property list into `~/Library/LaunchAgents`; `SMAppService` is Apple's modern route but serves helpers inside an app bundle [22], which a command-line install may lack. macOS's "Reopen windows" may also relaunch `sarkos` at login [24], so the window must cope with being opened by macOS or by the recovery step, and wait for the daemon either way. No Apple page read documents the order in which launchd agents and reopened apps start.

## 8. Sources

1. Apple, "Core app design," Mac App Programming Guide, Apple Documentation Archive. Accessed: Oct. 14, 2026. [Online]. Available: https://developer.apple.com/library/archive/documentation/General/Conceptual/MOSXAppProgrammingGuide/CoreAppDesign/CoreAppDesign.html
2. Apple, "Creating launch daemons and agents," Apple Documentation Archive. Accessed: Oct. 14, 2026. [Online]. Available: https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html
3. Apple, "launchd.plist(5)," Xcode manual pages, mirrored at keith.github.io. Accessed: Oct. 14, 2026. [Online]. Available: https://keith.github.io/xcode-man-pages/launchd.plist.5.html
4. Apple, "Terminal settings: Window," Terminal User Guide 2.10 for macOS 10.15. Accessed: Oct. 14, 2026. [Online]. Available: https://support.apple.com/en-us/guide/terminal/trmlwindw/2.10/mac/10.15
5. G. Nachman, "Session restoration," iTerm2 documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://iterm2.com/documentation-restoration.html
6. The tmux-plugins authors, "tmux-resurrect," GitHub repository. Accessed: Oct. 14, 2026. [Online]. Available: https://github.com/tmux-plugins/tmux-resurrect
7. Zellij, "Session resurrection," Zellij user guide. Accessed: Oct. 14, 2026. [Online]. Available: https://zellij.dev/documentation/session-resurrection.html
8. Microsoft, "Terminal advanced," Visual Studio Code documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://code.visualstudio.com/docs/terminal/advanced
9. Anthropic, "Hooks reference," Claude Code documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://code.claude.com/docs/en/hooks
10. OpenAI, "Hooks," Codex documentation, ChatGPT Learn. Accessed: Oct. 14, 2026. [Online]. Available: https://learn.chatgpt.com/docs/hooks
11. Anthropic, "Manage sessions," Claude Code documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://code.claude.com/docs/en/sessions
12. OpenAI, "Command line options," Codex documentation, ChatGPT Learn. Accessed: Oct. 14, 2026. [Online]. Available: https://learn.chatgpt.com/docs/developer-commands?surface=cli
13. Anthropic, "Settings reference," Claude Code documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://code.claude.com/docs/en/settings-reference
14. Anthropic, "CLI reference," Claude Code documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://code.claude.com/docs/en/cli-reference
15. OpenAI, "codex," GitHub repository, file codex-rs/rollout/src/recorder.rs. Accessed: Oct. 14, 2026. [Online]. Available: https://github.com/openai/codex/blob/main/codex-rs/rollout/src/recorder.rs
16. OpenAI, "codex," GitHub repository, file codex-rs/core/src/session/rollout_reconstruction.rs. Accessed: Oct. 14, 2026. [Online]. Available: https://github.com/openai/codex/blob/main/codex-rs/core/src/session/rollout_reconstruction.rs
17. OpenAI, "Configuration reference," Codex documentation, ChatGPT Learn. Accessed: Oct. 14, 2026. [Online]. Available: https://learn.chatgpt.com/docs/config-file/config-reference
18. Apple, "fsync(2)," Xcode manual pages, mirrored at keith.github.io. Accessed: Oct. 14, 2026. [Online]. Available: https://keith.github.io/xcode-man-pages/fsync.2.html
19. Rust Project, "rust," GitHub repository, file library/std/src/sys/fs/unix.rs. Accessed: Oct. 14, 2026. [Online]. Available: https://raw.githubusercontent.com/rust-lang/rust/master/library/std/src/sys/fs/unix.rs
20. Rust Project, "rust," GitHub repository, file library/std/src/fs.rs. Accessed: Oct. 14, 2026. [Online]. Available: https://raw.githubusercontent.com/rust-lang/rust/master/library/std/src/fs.rs
21. Apple, "launchctl(1)," Xcode manual pages, mirrored at keith.github.io. Accessed: Oct. 14, 2026. [Online]. Available: https://keith.github.io/xcode-man-pages/launchctl.1.html
22. Apple, "SMAppService," Apple Developer Documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://developer.apple.com/documentation/servicemanagement/smappservice
23. Apple, "Manage login items and background tasks on Mac," Apple Platform Deployment. Accessed: Oct. 14, 2026. [Online]. Available: https://support.apple.com/guide/deployment/manage-login-items-background-tasks-mac-depdca572563/web
24. Apple, "Prevent apps and windows from reopening on Mac," Apple Support. Accessed: Oct. 14, 2026. [Online]. Available: https://support.apple.com/en-us/102318
25. The tmux-plugins authors, "Restoring programs," tmux-resurrect documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://raw.githubusercontent.com/tmux-plugins/tmux-resurrect/master/docs/restoring_programs.md
26. The tmux-plugins authors, "Restoring pane contents," tmux-resurrect documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://raw.githubusercontent.com/tmux-plugins/tmux-resurrect/master/docs/restoring_pane_contents.md
27. The tmux-plugins authors, "tmux-continuum," GitHub repository. Accessed: Oct. 14, 2026. [Online]. Available: https://github.com/tmux-plugins/tmux-continuum
28. Microsoft, "vscode," GitHub repository, file src/vs/workbench/contrib/terminal/common/terminalConfiguration.ts. Accessed: Oct. 14, 2026. [Online]. Available: https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/contrib/terminal/common/terminalConfiguration.ts
29. Warp, "Session restoration," Warp documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://docs.warp.dev/terminal/sessions/session-restoration
30. Anthropic, "Run Claude Code programmatically," Claude Code documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://code.claude.com/docs/en/headless
31. Anthropic, "Environment variables," Claude Code documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://code.claude.com/docs/en/env-vars
32. OpenAI, "Codex CLI," Codex documentation, ChatGPT Learn. Accessed: Oct. 14, 2026. [Online]. Available: https://learn.chatgpt.com/docs/codex/cli
33. OpenAI, "codex," GitHub repository, file codex-rs/hooks/schema/generated/session-start.command.input.schema.json. Accessed: Oct. 14, 2026. [Online]. Available: https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/session-start.command.input.schema.json
34. OpenAI, "codex," GitHub repository, file codex-rs/hooks/src/legacy_notify.rs. Accessed: Oct. 14, 2026. [Online]. Available: https://github.com/openai/codex/blob/main/codex-rs/hooks/src/legacy_notify.rs
35. OpenAI, "codex," GitHub repository, file codex-rs/protocol/src/shell_environment.rs. Accessed: Oct. 14, 2026. [Online]. Available: https://github.com/openai/codex/blob/main/codex-rs/protocol/src/shell_environment.rs
36. OpenAI, "codex," GitHub repository, file codex-rs/core/src/exec_env.rs. Accessed: Oct. 14, 2026. [Online]. Available: https://github.com/openai/codex/blob/main/codex-rs/core/src/exec_env.rs
37. OpenAI, "Codex App Server," Codex documentation, ChatGPT Learn. Accessed: Oct. 14, 2026. [Online]. Available: https://learn.chatgpt.com/docs/app-server
