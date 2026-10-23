---
description: Why an IDE update kills the shells and Claude Code agents inside it, which tools keep them, what execve preserves, and how a daemon can swap itself in place.
published: 2026-10-14
categories: Tooling
source: https://github.com/csarkosh/ide-sarkos/blob/main/docs/superpowers/specs/2026-10-14-update-in-place-design.md
series: Arkos IDE notes
---
# Update the IDE, keep the shells

**Question:** Why does updating an IDE end the terminal sessions and the Claude Code agents running inside it; which tools avoid that, and how; what do Unix process and pseudo-terminal semantics actually allow; and how can Sarkos IDE update in place, with its daemon replacing itself by `exec` while the shells stay its children, so that no session is ever lost?

**Short answer:** An update ends sessions because the terminal's master side and the shell's parent live in a process the update quits: Electron's updater closes every window and quits the app [1], VS Code reconnects to a live process only on a window reload and relaunches a new one on an application restart [2], [3], a reply on Cursor's forum calls the loss a known limitation and recommends tmux [4], and a Zed RFC says every terminal process dies when Zed restarts for an update [5]. Multiplexers such as tmux survive any client restart because a separate server owns the terminals, but the server itself cannot be upgraded live: a new client refuses an old server across a protocol change, and killing the server ends every session [6], [7]. Claude Code's resume reloads the conversation in a new process; tools that were running do not finish [8]. Servers that upgrade without dropping work either start a second process and pass it their listening sockets (nginx, HAProxy, Envoy, tableflip) or re-execute themselves in place (systemd, sshd) [9], [10], [11], [12], [13]. `execve` keeps the process id, parent, children, session, controlling terminal and every descriptor not marked close-on-exec, and drops caught signal handlers, other threads and memory [14], [15]; a descriptor sent to another process carries the terminal but not parenthood, because only a parent can wait for a child [16], [17]. Sarkos IDE's design uses exactly this: the daemon that owns every terminal writes a handover file, clears close-on-exec on its terminal masters and listening socket, and execs the new binary in the same process, so the shells never see their parent change; the window reconnects on its own, and the daemon relaunches it when its binary changed too. One gap remains: nothing survives the daemon's death, a logout or a reboot.

## 1. What an update does today

Every IDE the author has used ends their Claude Code sessions when it updates. Their employer requires updates within seven days of release, so updates get delayed, and when one happens the work in flight is lost.

### 1.1 VS Code: reconnect on reload, revive on restart

Since version 1.54 (February 2021), VS Code spawns terminal processes under a separate "pty host" process instead of the window process, and restores local terminal processes when a window reloads [18]. The documentation now names two modes. **Process reconnection** applies "when reloading a window (for example, after installing an extension)" and reconnects to the previous process. **Process revive** applies "when restarting VS Code": the content is restored "and the process is relaunched using its original environment" [2]. Revive shipped in version 1.61, whose notes are blunt: "Terminal processes are disposed of when a VS Code window is closed," and the new setting uses the recorded buffer "to recreate processes" [3].

No VS Code page read for this report says what an update does to the pty host. The inference is direct, though: an update requires the application to quit, so it is a restart, and revive applies. The tab, scrollback and environment come back; the shell is a new process, and any agent, build or SSH connection inside the old one is gone. A Claude Code issue shows the user response: after an extension update the terminal offered to relaunch, and the reporter declined, writing "I don't want to restart it because I would lose those processes" [19].

### 1.2 Cursor: loses processes on reload as well

Cursor is a fork of VS Code and does worse. In a December 2025 forum request titled "Preserve Terminal Processes Across Updates/Restarts", a reply calls the loss a known limitation of the VS Code architecture: the integrated terminal stops its processes on restart or update, and the workaround is tmux or screen, so services keep running "even if Cursor is fully closed" [4]. A September 2025 bug report says Cursor 1.5.9 closes terminals even on a window reload, where VS Code keeps them; a macOS user reproduced it with a running `ping`, and replies through December 2025 say the team is working on it, with no fix confirmed [20].

### 1.3 Zed and JetBrains

A Zed RFC from March 2026 states the problem plainly: "When Zed restarts (update, crash, or intentional quit), all terminal processes die." It proposes a per-session pty-host daemon that outlives the editor, keeps headless terminal state for replay and resizes the terminal on reattach, Unix only [5]. The discussion shows no maintainer response and nothing merged. JetBrains documents that its terminal "saves tabs and sessions when you close the project or IntelliJ IDEA," preserving tab names, working directory and shell history [21]. The page does not say that running processes continue.

### 1.4 The shared pattern: quit, replace, relaunch, restore the view

Electron's `autoUpdater.quitAndInstall()` "will close all application windows first, and automatically call `app.quit()`" [1]. Chrome applies an update on relaunch and "saves your opened tabs and windows and reopens them automatically when it restarts" [22]. Both restore the view, not the running work.

The IDE process holds the master side of each pseudo-terminal and is the shell's parent. When it exits, the master closes. Under standard terminal semantics the kernel then hangs up the terminal and the shell's process group receives `SIGHUP`. The Linux pty(7) page describes the master and slave pair but not the hangup [23], so that step is stated from general terminal behaviour, not from a source read for this report.

## 2. The multiplexer answer and its ceiling

### 2.1 A server that outlives the client

tmux separates the two roles an IDE combines: "The server and each client are separate processes which communicate through a socket in /tmp," and sessions persist when a client detaches [6]. Quitting or updating the terminal application ends only a client. That is why Cursor's reply recommends tmux, and why iTerm2's tmux integration promises that "when iTerm2 quits or the ssh session is lost, tmux keeps running," with `tmux -CC attach` restoring the windows [24].

### 2.2 The server itself cannot be upgraded

The protection stops at the server. "Once all sessions are killed, tmux exits," and `kill-server` will "destroy all sessions" [6]. A running server keeps its old binary. When a newly installed client meets it across a protocol change, the client prints "protocol version mismatch (client N, server M)" and exits with status 1 [7]. The tmux FAQ has no entry on upgrading a live server [25]. The choices are to kill the server, ending every session, or to keep the old binary until the sessions end.

Herdr, a newer multiplexer, describes the same ceiling from a vendor's point of view: Zellij 0.44 made its client and server forward-compatible but "still doesn't replace the running server while keeping live PTYs" [26]. Herdr's own answer passes the terminal master descriptors to a new server over `SCM_RIGHTS`, same machine only, with full-screen programs redrawn on a best-effort basis [26].

### 2.3 Resurrection is a rerun, not survival

Zellij's session resurrection serialises the layout and each pane's command, and after a restart re-runs the commands behind a "Press ENTER to run..." banner [27]. The shape of the session returns; the processes are new.

### 2.4 Claude Code's resume recovers the conversation, not the work

`claude --continue` and `claude --resume` reopen a saved transcript in a new process [8]. The documentation is explicit about the limits: "A tool that was still running when the previous process ended, for example in a crash, doesn't finish or run again when you resume." Background Bash and monitor tasks are not restored either [8]. The page does not say that shell state is restored. Resume is a good fallback after a loss; it is not a way to update without one.

## 3. How servers upgrade without dropping work

Network servers solved a narrower version of this problem long ago.

| System | How the new code takes over | Handed over | Not handed over |
|---|---|---|---|
| nginx | `USR2` starts the new executable; `WINCH` drains old workers; `QUIT` ends the old master | Listening sockets | Existing connections, which finish on old workers |
| HAProxy | New process fetches listeners from the old one over a Unix socket (`-x`); `-sf` retires the old one | Listening sockets, by `SCM_RIGHTS` | Existing connections |
| Envoy | A second full process initialises, requests the listen sockets over a Unix-socket RPC, tells the old one to drain | Listen sockets, counters, most gauges | Connections, which must finish within the drain time |
| systemd | Fd store keeps a service's descriptors across its restart; `daemon-reexec` re-executes the manager | Stored descriptors; serialised manager state | Processes |
| sshd | On `SIGHUP`, executes itself with its original name and options | Configuration is re-read | Listening sockets, closed first |
| tableflip | Go library: starts a new copy, passes listening descriptors, waits for `Ready()` | Listening descriptors | The old process, which exits |
| Erlang/OTP | Release handler suspends processes, calls `code_change/3`, resumes them | Process state, transformed | Runtime changes, which need an emulator restart |

The fork-and-hand-over designs keep a live fallback: the old nginx master "does not close its listen sockets," so an upgrade can be rolled back [9], and it respawns its workers if the new binary's process exits [28]. HAProxy measured the gain: over 2,000 requests a restart failed 11, a plain reload 1, and the socket transfer none [10]. Its management guide still admits "two small windows of a few milliseconds each" where connections can fail, and says that in master-worker mode `SIGUSR2` makes the master re-execute itself, without saying whether its pid changes [29]. tableflip allows "at most two processes" at once [30] and kills a new child that is not ready within a default one-minute timeout [31]. Envoy says outright that connections are not transferred [11], and Erlang, which transforms live process state, still needs a full emulator restart when the runtime itself changes [32].

The re-exec designs are closer to this problem. systemd's fd store returns descriptors a service pushed with `FDSTORE=1` "at the next start or restart," and is off unless `FileDescriptorStoreMax=` is raised from its default of 0 [33], [34]. For the manager itself, `daemon-reexec` "will serialize the manager state, reexecute the process and deserialize the state again" [12]. sshd re-reads its configuration "by executing itself with the name and options it was started with" [13]; its source sets `SIGHUP` to ignored just before `execv` so the new image does not inherit a default action, and logs "RESTART FAILED" and exits if the exec fails [35].

The lesson: every fork-and-hand-over design transfers listening sockets and lets old work drain, but a shell running an agent for three days cannot be drained, and none of these systems hands over a child process. Keeping children requires keeping the process.

## 4. What the kernel allows

### 4.1 `execve` keeps the process and replaces the program

POSIX requires the new image to "inherit at least" the process ID, parent process ID, process group ID, session membership and controlling terminal [14]. Open descriptors stay open unless they carry `FD_CLOEXEC`. Caught signals revert to default, ignored ones stay ignored (whether an ignored `SIGCHLD` stays ignored is unspecified), and the signal mask is inherited [14]. Linux adds that all other threads are destroyed and that memory mappings and timers are not preserved [15]. The archived macOS page lists the same inherited identifiers and terminal [36].

The pid is the whole point. A child's parent pid names the same process before and after the exec, so the kernel never sees the parent die, no reparenting happens, and the children stay the caller's children.

### 4.2 Close-on-exec decides what survives

At the kernel level a new descriptor does not carry close-on-exec unless the caller asks; `F_SETFD` changes the flag, and setting it that way in a multithreaded program races with a concurrent fork and exec [37]. Rust inverts the default: `CLOEXEC` is "set by default on all file descriptors opened by the standard library" [38]. A Rust daemon therefore carries nothing across an exec unless it clears the flag on purpose, which is the safe default.

### 4.3 Only a parent can wait

`wait` and `waitpid` report "state changes in a child of the calling process" and fail with `ECHILD` otherwise [16]. Orphans go to init or the nearest subreaper, and if `SIGCHLD` is ignored, exited children leave no zombie and their status is lost [16]. On macOS the adopter would be launchd; that is inferred. `SCM_RIGHTS` passes "a reference to an open file description," the equivalent of a `dup` into the receiver [17]. It moves a terminal master, not parenthood. A daemon that receives masters this way can read and write the terminals but cannot `waitpid` the shells. That is the limit of the Herdr approach and of the systemd fd store.

### 4.4 The author's measurement on macOS

The author tested this on a Mac running macOS 26.2 (Darwin 25.6.0) with Python 3. A process forked a child on a pseudo-terminal, made the master inheritable, and replaced itself with `os.execv`. (Python marks `pty.openpty()` descriptors close-on-exec, so `os.set_inheritable` was needed first.) After the exec the process had the **same pid (1814) and the same parent pid (1812)**. The inherited master still read the child's output, `hi-after-exec`. `waitpid` on the child returned `(1867, 1792)`, exit code 7, so the new image reaped a child the old image had forked. A `SIGCHLD` handler installed before the exec was `SIG_DFL` afterwards.

A second test measured how much a shell can write while nobody reads. Non-blocking writes in 100-byte chunks to a terminal slave, with no reader on the master, were accepted up to **exactly 1,024 bytes** before `EAGAIN`. XNU's `tty.h` defines `TTYHOG` as 1024 [39]; which constant sets the limit is inferred. During an exec, then, output waits in the kernel and nothing is lost, but a shell that prints more than about a kilobyte blocks on `write` until the new image reads again. The new image must also reinstall its `SIGCHLD` handling and check every child once, since a child can exit while no handler is installed.

### 4.5 Homebrew moves the binary under a running process

Homebrew installs each version as a keg under the Cellar and symlinks it into the prefix; `brew upgrade` then runs `brew cleanup`, which removes old versions unless `HOMEBREW_NO_INSTALL_CLEANUP` is set [40]. A running process keeps its deleted file open by ordinary Unix semantics, so it keeps running the old version, and a re-exec must target the new file. Rust's `current_exe` warns that through a symlink some platforms return the link and others its target [41]; on Apple platforms the standard library calls `_NSGetExecutablePath` and does not canonicalise the result [42]. The author checked the rest on the same Mac: a three-line Rust program that prints `current_exe` reports its real path when run directly and the symlink's path when run through a symlink, in both cases exactly the path it was launched by. A process launched as `/opt/homebrew/bin/sarkos` therefore knows that path, and can ask the file now behind it for its version after an upgrade.

## 5. The Sarkos IDE design: exec in place

Sarkos IDE is the author's terminal-pane IDE for running many Claude Code sessions side by side, written in Rust with gpui for macOS. A window process, `sarkos`, attaches to a daemon, `sarkosd`, that owns every pseudo-terminal, so updating the window (quit, replace, relaunch) already keeps every session. What follows is the design for replacing the daemon too. It is an approved spec scheduled as its own milestone before the Homebrew tap; it is not implemented yet.

### 5.1 Why exec and not a hand-off

The daemon replaces itself with the new binary by `execve`, in the same process. The pid does not change, so the shells stay its children, `waitpid` keeps working, and the terminal masters and the listening socket pass through. Handing descriptors to a fresh process over `SCM_RIGHTS` was rejected because it reparents the shells to launchd: the new daemon could never reap them, and exit detection would fall back to end-of-file on the terminal, which an earlier milestone found unreliable when a background job holds the terminal open.

Two parts of the daemon change first. `std::process::Child` is in-memory state that cannot survive an exec, so each session keeps its **pid** and uses `libc::waitpid(pid, WNOHANG)` and `libc::kill`. The portable-pty crate cannot adopt an existing descriptor, so about a hundred lines over libc replace it: `openpty`, a spawn whose `pre_exec` calls `setsid`, sets the controlling terminal with `TIOCSCTTY` and makes the slave the standard streams, `TIOCSWINSZ` for resize, and `adopt(fd)` for the resume path.

### 5.2 The handover in the old daemon

A client sends `Request::Upgrade { exe }`. The daemon checks that `exe` is a regular file named `sarkosd`, owned by the current user and executable, then runs it as `sarkosd --check-handover`, which prints its protocol range and exits 0. Only if that succeeds does anything change. The daemon stops accepting clients and parks each session's reader; bytes that arrive meanwhile wait in the kernel buffer measured in section 4.4.

It then writes the **handover file**, `~/Library/Application Support/sarkos/handover-<pid>.bin`, mode 0600, with `sync_all` and an atomic rename. It records the format and daemon versions, the listening socket's descriptor number, and per session the id, working directory, pid, exit status if ended, title, Claude state, master descriptor number, window size and replay bytes.

The daemon clears `FD_CLOEXEC` on every terminal master and on the listening socket, and on nothing else. It calls `execve(exe, ["sarkosd", "--resume", <path>], env)`. If `execve` returns, it failed: the daemon restores the flags, restarts its readers, deletes the file and answers with the error. Nothing is lost.

### 5.3 Resume in the new daemon

The new image validates the handover file before touching any descriptor. It sets `FD_CLOEXEC` again on each inherited master and rebuilds the reader thread, input writer and replay ring from the record. A session recorded as ended stays ended. For each live session it calls `waitpid(pid, WNOHANG)` once, since a shell may have exited during the swap. It then adopts the listening socket, starts accepting and deletes the file. The target is under one second for four sessions with full 16 MB replay rings.

### 5.4 The window reconnects by itself

Today a dropped daemon connection leaves the window dead behind a banner. Under this design the window retries after 250 ms, doubling to 2 s, for as long as it is open. On reconnect it sends `Hello`, lists sessions and runs its existing reconcile path, so each tab reattaches and redraws from the replay. A banner appears only after 10 s without a connection.

### 5.5 The update, end to end

`brew upgrade sarkos` replaces both binaries on disk while the old processes keep running the old files. The window checks on launch, on focus and every five minutes by running the binary at its own launch path with `--version`. On macOS `current_exe` returns that launch path unresolved (section 4.5), the `/opt/homebrew/bin/sarkos` symlink Homebrew repoints, which is what the check needs: the resolved Cellar path is the old version, and `brew cleanup` deletes it. A newer version shows "update ready" in the status bar and adds the palette command "Update Sarkos IDE now".

The command first compares the daemon's version, reported in `Response::Hello`, with the `sarkosd` on disk; if they differ, it sends `Upgrade` and waits for the reconnect. It then sends `Request::RelaunchClient { exe, cwd }`: the window saves its workspace and quits, and the daemon, seeing the disconnect, launches the new window in that directory. The new window reattaches every tab. The daemon always updates first, so a window is never newer than its daemon.

### 5.6 Protocol rules

The wire format is postcard, which is not self-describing, so new enum variants are only appended, existing structs never change shape, and new fields mean a new variant. `Hello` carries the window's protocol version and the daemon answers with the range it speaks. A daemon refuses a window newer than its maximum with an error naming the fix. The current daemon does not understand `Upgrade`, so the first move to this design needs one `pkill -x sarkosd`, and only that once.

### 5.7 Failure modes

| Failure | Behaviour |
|---|---|
| New `sarkosd` fails `--check-handover` | Old daemon keeps running; error banner in the window |
| `execve` fails | Old daemon restores its readers and keeps running; error banner |
| New daemon rejects the handover file | Fatal: logged, sessions lost; guarded by the check above and the format version |
| A shell exits during the swap | `waitpid` at resume catches it; the exit is reported on the next attach |
| New `sarkos` fails to launch after the window quits | Daemon relaunches the old window binary from the last `Hello` |
| A second update starts mid-update | `Upgrade` is refused with "already upgrading" until the resume completes |

The daemon execs only a path sent by a same-user client over its 0600 socket, after the name and ownership checks. No new privileges or network access are involved.

## 6. What it does not cover, and open questions

**Daemon death is still final.** The design replaces the daemon without killing it. A crash, a logout or a reboot still ends every session, because the shells are its children. A later section of the spec plans recovery for that case in a following milestone: replay buffers flushed to disk, a per-session manifest, and a launchd agent that recreates each shell in its folder and runs `claude --resume` on the recorded conversation. That restores the layout, the history and the conversation, not the processes; a running tool or build is still lost, within the limits in section 2.4.

**The point of no return is real.** nginx and tableflip keep the old process alive until the new one is ready [9], [30]. Exec in place cannot: once `execve` succeeds the old program is gone, and a new daemon that rejects the handover file loses every session. Running the new binary with `--check-handover` first and versioning the file narrow that window, but a crash during resume is unrecoverable. That is the price of keeping parenthood.

**Output stalls during the swap.** With about 1 KiB of kernel buffer on macOS, a session printing heavily blocks for the length of the exec.

**Signal state needs care.** Caught handlers reset and the signal mask carries over [14]. The new daemon has to set its `SIGCHLD` handling explicitly, never inherit an ignore setting that would discard exit statuses [16], and sweep its children once at start.

**Some facts were not verified.** No VS Code source read here states what an update does to the pty host; the inference in section 1.1 is strong but it is an inference. Linux terminal buffer sizes were not measured; the design targets macOS only.

## 7. Sources

1. Electron, "autoUpdater," Electron documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://www.electronjs.org/docs/latest/api/auto-updater
2. Microsoft, "Terminal advanced," Visual Studio Code documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://code.visualstudio.com/docs/terminal/advanced
3. Microsoft, "September 2021 (version 1.61)," Visual Studio Code release notes. Accessed: Oct. 14, 2026. [Online]. Available: https://code.visualstudio.com/updates/v1_61
4. smile2wild, "Preserve Terminal Processes Across Updates/Restarts," Cursor Community Forum. Accessed: Oct. 14, 2026. [Online]. Available: https://forum.cursor.com/t/preserve-terminal-processes-across-updates-restarts/147353
5. dsturnbull, "RFC: Persistent terminal sessions across Zed restarts," zed-industries/zed, GitHub discussion #50584. Accessed: Oct. 14, 2026. [Online]. Available: https://github.com/zed-industries/zed/discussions/50584
6. The tmux authors, "tmux(1)," OpenBSD manual pages. Accessed: Oct. 14, 2026. [Online]. Available: https://man.openbsd.org/tmux
7. The tmux authors, "tmux," GitHub repository, file client.c. Accessed: Oct. 14, 2026. [Online]. Available: https://raw.githubusercontent.com/tmux/tmux/master/client.c
8. Anthropic, "Manage sessions," Claude Code documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://code.claude.com/docs/en/sessions
9. NGINX, Inc., "Controlling nginx," nginx documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://nginx.org/en/docs/control.html
10. HAProxy Technologies, "Truly seamless reloads with HAProxy - no more hacks!," HAProxy blog. Accessed: Oct. 14, 2026. [Online]. Available: https://www.haproxy.com/blog/truly-seamless-reloads-with-haproxy-no-more-hacks
11. The Envoy authors, "Hot restart," Envoy documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/operations/hot_restart
12. The systemd authors, "systemctl(1)," Linux manual pages, man7.org. Accessed: Oct. 14, 2026. [Online]. Available: https://man7.org/linux/man-pages/man1/systemctl.1.html
13. The OpenBSD project, "sshd(8)," OpenBSD manual pages. Accessed: Oct. 14, 2026. [Online]. Available: https://man.openbsd.org/sshd.8
14. The Open Group, "exec," The Open Group Base Specifications Issue 8 (POSIX.1-2024). Accessed: Oct. 14, 2026. [Online]. Available: https://pubs.opengroup.org/onlinepubs/9799919799/functions/exec.html
15. The Linux man-pages project, "execve(2)," Linux manual pages, man7.org. Accessed: Oct. 14, 2026. [Online]. Available: https://man7.org/linux/man-pages/man2/execve.2.html
16. The Linux man-pages project, "wait(2)," Linux manual pages, man7.org. Accessed: Oct. 14, 2026. [Online]. Available: https://man7.org/linux/man-pages/man2/wait.2.html
17. The Linux man-pages project, "unix(7)," Linux manual pages, man7.org. Accessed: Oct. 14, 2026. [Online]. Available: https://man7.org/linux/man-pages/man7/unix.7.html
18. Microsoft, "February 2021 (version 1.54)," Visual Studio Code release notes. Accessed: Oct. 14, 2026. [Online]. Available: https://code.visualstudio.com/updates/v1_54
19. anthropics/claude-code, "[BUG] VS Code extension prompts to relaunch terminal after update," GitHub issue #11157. Accessed: Oct. 14, 2026. [Online]. Available: https://github.com/anthropics/claude-code/issues/11157
20. spearsec, "Terminal Sessions Terminate on Window Reload/App Restart," Cursor Community Forum. Accessed: Oct. 14, 2026. [Online]. Available: https://forum.cursor.com/t/terminal-sessions-terminate-on-window-reload-app-restart/132499
21. JetBrains, "Terminal," IntelliJ IDEA 2025.2 Help. Accessed: Oct. 14, 2026. [Online]. Available: https://www.jetbrains.com/help/idea/2025.2/terminal.html
22. Google, "Update Google Chrome," Google Chrome Help. Accessed: Oct. 14, 2026. [Online]. Available: https://support.google.com/chrome/answer/95414
23. The Linux man-pages project, "pty(7)," Linux manual pages, man7.org. Accessed: Oct. 14, 2026. [Online]. Available: https://man7.org/linux/man-pages/man7/pty.7.html
24. iTerm2, "tmux integration," iTerm2 documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://iterm2.com/documentation-tmux-integration.html
25. The tmux authors, "FAQ," tmux GitHub wiki. Accessed: Oct. 14, 2026. [Online]. Available: https://github.com/tmux/tmux/wiki/FAQ
26. C. Celik, "Live updates without killing your terminal processes," Herdr blog. Accessed: Oct. 14, 2026. [Online]. Available: https://herdr.dev/blog/live-updates-without-killing-your-terminal-processes/
27. Zellij, "Session resurrection," Zellij user guide. Accessed: Oct. 14, 2026. [Online]. Available: https://zellij.dev/documentation/session-resurrection.html
28. NGINX, Inc., "nginx," GitHub repository, file src/os/unix/ngx_process_cycle.c. Accessed: Oct. 14, 2026. [Online]. Available: https://github.com/nginx/nginx/blob/master/src/os/unix/ngx_process_cycle.c
29. HAProxy Technologies, "HAProxy 3.0 management guide," HAProxy documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://docs.haproxy.org/3.0/management.html
30. Cloudflare, "tableflip," GitHub repository. Accessed: Oct. 14, 2026. [Online]. Available: https://github.com/cloudflare/tableflip
31. Cloudflare, "tableflip," GitHub repository, file upgrader.go. Accessed: Oct. 14, 2026. [Online]. Available: https://raw.githubusercontent.com/cloudflare/tableflip/master/upgrader.go
32. Ericsson AB, "Release handling," Erlang/OTP system documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://www.erlang.org/doc/system/release_handling.html
33. The systemd authors, "sd_notify(3)," Linux manual pages, man7.org. Accessed: Oct. 14, 2026. [Online]. Available: https://man7.org/linux/man-pages/man3/sd_notify.3.html
34. The systemd authors, "systemd.service(5)," Linux manual pages, man7.org. Accessed: Oct. 14, 2026. [Online]. Available: https://man7.org/linux/man-pages/man5/systemd.service.5.html
35. OpenSSH, "openssh-portable," GitHub repository, file sshd.c. Accessed: Oct. 14, 2026. [Online]. Available: https://raw.githubusercontent.com/openssh/openssh-portable/master/sshd.c
36. Apple, "execve(2)," Mac OS X manual pages, Apple Documentation Archive. Accessed: Oct. 14, 2026. [Online]. Available: https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/execve.2.html
37. The Linux man-pages project, "F_SETFD(2const)," Linux manual pages, man7.org. Accessed: Oct. 14, 2026. [Online]. Available: https://man7.org/linux/man-pages/man2/F_SETFD.2const.html
38. Rust Project, "Trait CommandExt," Rust standard library documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://doc.rust-lang.org/std/os/unix/process/trait.CommandExt.html
39. Apple, "xnu," GitHub repository (apple-oss-distributions), file bsd/sys/tty.h. Accessed: Oct. 14, 2026. [Online]. Available: https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/bsd/sys/tty.h
40. Homebrew, "Manpage," Homebrew documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://docs.brew.sh/Manpage
41. Rust Project, "Function current_exe," Rust standard library documentation. Accessed: Oct. 14, 2026. [Online]. Available: https://doc.rust-lang.org/std/env/fn.current_exe.html
42. Rust Project, "rust," GitHub repository, file library/std/src/sys/paths/unix.rs. Accessed: Oct. 14, 2026. [Online]. Available: https://raw.githubusercontent.com/rust-lang/rust/master/library/std/src/sys/paths/unix.rs
