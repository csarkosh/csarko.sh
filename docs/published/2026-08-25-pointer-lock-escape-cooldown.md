---
description: Chromium refuses pointer lock for 1.25 s after Esc. What failed in the browser, and how an 8-byte patch to prebuilt Electron removed the cooldown.
published: 2026-08-25
---
# Pointer lock's Esc cooldown and an 8-byte patch

**Question:** Day Hike is a first-person game that runs in Chromium. Every time a player
presses Esc to open the pause menu, the next click to resume does nothing for over a second.
Where does that dead zone come from, can a page get rid of it, and if not, what is the
cheapest way to ship a runtime without it?

**Short answer:** Chromium's browser process refuses to re-grant pointer lock for **1.25 s**
after the user escapes one. The duration is a compile-time constant with no flag or switch.
A page can avoid it only when the page itself released the lock, or when the tab is
fullscreen. The fullscreen route worked until a macOS window-manager exit left
`document.fullscreenElement` reporting fullscreen in a windowed tab, so it was reverted. The
browser build keeps the cooldown and softens it with a pause menu. The desktop build runs on
Electron, which compiles the same controller, and there the fix is a binary patch: Electron
publishes Breakpad symbols for every release, which give the exact file offset of
`PointerLockController::HandleUserPressedEscape()`, and replacing its first two instructions
with `mov w0, #0; ret` (8 bytes on macOS arm64; `xor eax, eax; ret`, 3 bytes, on Windows x64)
hands Esc to the page. Measured relock after Esc drops from 1268–1526 ms to 2–29 ms. No
Chromium checkout and no compile. The patched builds are published as
[electron-gamepatch](https://github.com/csarkosh/electron-gamepatch/blob/main/README.md).

Versions: the first experiments ran on Electron 44.0.0 (Chromium 152.0.7977.54); the build
that ships is Electron 44.1.1 (Chromium 152.0.7977.65). The Chromium source below is quoted
from the current `main` branch; its constant and gate agree with the disassembly in section 5.

## 1. The cooldown

The constant and the gate live in
`chrome/browser/ui/exclusive_access/pointer_lock_controller.cc`:

```cpp
constexpr base::TimeDelta kEffectiveUserEscapeDuration =
    base::Milliseconds(1250);

// RequestToLockPointer(web_contents, user_gesture, last_unlocked_by_target)
if (!last_unlocked_by_target && !web_contents->IsFullscreen()) {
  if (!user_gesture) { /* kRequiresUserGesture */ }
  if (base::TimeTicks::Now() <
      last_user_escape_time_ + kEffectiveUserEscapeDuration) {
    /* kUserEscapeCooldown */
  }
}
```

Only `HandleUserPressedEscape()` sets `last_user_escape_time_`, and it does so in the same
call that ejects the lock. Two exemptions follow from the gate:

- **A page-initiated release never arms the timer.** If the page called
  `document.exitPointerLock()`, `last_unlocked_by_target` is true and the next request is
  granted at once.
- **A fullscreen tab skips the gate entirely**, cooldown and user-gesture check included.

The comment above the gate gives the reason: it stops a misbehaving site from constantly
re-locking the pointer after the user has tried to get out. That is a sound default for the
web. For a first-person game it turns every Esc into a dead zone: click, nothing, click again.

## 2. What we tried in the browser

1. **Release the lock ourselves wherever we can.** When the game unlocks for its own reasons
   (the command bar, for example), it calls `exitPointerLock()` explicitly, so those relocks
   are exempt. This works and is kept. It cannot help with Esc itself, because Chromium
   ejects the lock before the page sees the key.
2. **Fullscreen on play, plus Keyboard Lock.** Entering fullscreen when play starts and
   calling `navigator.keyboard.lock(["Escape"])` voids the cooldown (fullscreen exemption) and
   makes a tap of Esc reach the page instead of ejecting the lock; the player holds Esc to
   leave fullscreen. It worked perfectly until a player left fullscreen with the **macOS green
   window button**. Instrumentation showed Chrome fires **no `fullscreenchange`** on that
   window-manager exit: `document.fullscreenElement` stayed set while the window was plainly
   windowed (`innerHeight` went from 923 to 836 with the element still reported). Every
   re-entry strategy built on top of that state lost to it in practice: retrying after the
   fullscreen promise, resyncing the flag when it contradicted the geometry, and detecting
   the exit from resize events. The fullscreen approach was reverted in full; the shipped
   client never requests HTML fullscreen.
3. **A pause menu.** Losing the lock opens a Resume / Exit overlay, driven off
   `pointerlockchange`, with game input suppressed while it is open. The time it takes to
   move the mouse to Resume absorbs most of the 1.25 s. A Resume click that lands too early
   is refused and the player clicks again; Esc pressed quickly a second time leaves the menu
   up for the same reason. This is what the browser build ships today
   ([`pauseMenu.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/pauseMenu.ts)).

The client's Esc handler is written for both environments
([`input.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/input.ts)):
on `keydown` for Escape while locked, it calls `exitPointerLock()`. In a browser the lock is
already gone by then, so it does nothing. In a runtime where Esc does not eject the lock, the
same handler is the whole Esc flow, and because the release is page-initiated it arms no
cooldown.

## 3. Electron has the same controller, and one more limit

A desktop shell was the next option, because it owns its window: no green-button problem and
no need for HTML fullscreen. The question was whether Electron behaves differently.

- **The cooldown and the eject are stock.** Electron compiles the same
  `pointer_lock_controller.cc`. Its own Chromium patch for exclusive access touches the
  fullscreen controller, not pointer lock.
- **The eject happens before the main process can see the key.** In Electron 44.1.1,
  `WebContents::PreHandleKeyboardEvent` asks the exclusive-access manager first and emits
  `before-input-event` only if it did not handle the key:

  ```cpp
  if (exclusive_access_manager_.HandleUserKeyEvent(event))
    return content::KeyboardEventProcessingResult::HANDLED;
  ...
  bool prevent_default = Emit("before-input-event", tweaked_event);
  ```

  A physical Esc while locked confirmed it: the lock ejected, the keydown was consumed, and
  only the harmless keyup reached `before-input-event`. There is no main-process hook that can
  intercept it.
- **Injected keys do not test this path.** Keys sent through the DevTools protocol or
  `webContents.sendInputEvent` bypass `PreHandleKeyboardEvent`: an injected Esc neither
  ejects the lock nor fires `before-input-event`, so an automated test built on them passes
  on stock Electron and proves nothing. Only a key press delivered through the operating
  system exercises the path. On macOS that is
  `osascript -e 'tell application "System Events" to key code 53'`; on Windows, PowerShell's
  `[System.Windows.Forms.SendKeys]::SendWait('{ESC}')`.
- **A second, renderer-side rate limit.** Polling for the relock every 100 ms on stock
  Electron produced `SecurityError: Pointer lock cannot be acquired immediately after the
  user has exited the lock` for roughly the first 300 ms, then `NotAllowedError: Too many
  pointer lock requests in a short window of time`. That one comes from Blink's own pointer
  lock controller, which keeps a sliding window of recent request timestamps and rejects
  requests while the window is full. It is why the measured stock gap overshoots 1250 ms, and
  it means a "retry until granted" Resume button must poll slower than that window or it makes
  the wait longer. Such a retry loop was scoped as a stopgap for stock Electron; the shipped
  client has none.
- The only other refusal seen in testing was `WrongDocumentError` on a window hidden behind
  others.

## 4. Two shapes for the fix, and why not a source fork

Either of two one-function changes removes the dead zone:

| Shape | Change | Effect |
|---|---|---|
| `zero` | `kEffectiveUserEscapeDuration` becomes 0 | Esc still ejects the lock in the browser process; relock is immediate |
| `noeject` | `HandleUserPressedEscape()` returns `false` without ejecting | Esc reaches the page like any other key; the page releases the lock, which arms no cooldown |

`noeject` is the one the game is written for: the page owns Esc outright, and the existing
handler in `input.ts` opens the menu. Its cost is that a page which never releases the lock
can only be escaped by switching away from the window. That is acceptable for an app that
loads one game and nothing else; it would not be for a general browser.

The obvious delivery is an Electron source fork with one extra patch in Electron's patch
series. It was costed and not built: a Chromium checkout of tens of gigabytes, a first clean
build estimated at several hours on Apple Silicon (an estimate, never measured), and a re-sync
and rebuild for every Chromium security release. A compile cache that Electron's build tooling
can use might cut the rebuilds; that was scoped but never tried, so it is *unverified*.

What made a binary patch possible is that both changes are tiny at the instruction level.
Because the duration is `constexpr`, it is inlined into the comparison as an immediate
(1,250,000 microseconds, `0x1312D0`). And `HandleUserPressedEscape()` is 17 instructions on
arm64, so overwriting its prologue with "return false" is a legal replacement for the whole
function.

## 5. Finding the bytes on macOS arm64

No pattern scanning and no guessing. Electron publishes Breakpad symbols with every release
(`electron-v44.0.0-darwin-arm64-symbols.zip`, 128 MB). The `Electron Framework.sym` file lists
every function's address and size, plus a per-instruction source-line table, and its `MODULE`
line carries the binary's UUID, which is checked against the framework before trusting any
address. The 1.4 GB dSYM is not needed. In the framework, the `__TEXT` segment has virtual
address 0 at file offset 0, so a symbol address is also a file offset.

| Function (Electron 44.0.0, darwin-arm64) | Address | Size |
|---|---|---|
| `PointerLockController::RequestToLockPointer(WebContents*, bool, bool)` | `0x903c5cc` | `0xfc` |
| `PointerLockController::HandleUserPressedEscape()` | `0x903ca3c` | `0x44` |

`llvm-objdump -d` with start and stop addresses shows the gate exactly as the source reads
(the line table maps it to the comparison in section 1):

```
903c61c: 52825a09  mov  w9, #0x12d0
903c620: 72a00269  movk w9, #0x13, lsl #16     ; w9 = 0x1312D0 = 1,250,000 us
903c624: ab090108  adds x8, x8, x9             ; last_user_escape_time_ + duration
903c630: eb08001f  cmp  x0, x8                 ; Now() < ...
903c634: 5400024b  b.lt                        ; -> kUserEscapeCooldown
```

Each shape is one 8-byte write:

| Shape | Offset | Before | After |
|---|---|---|---|
| `zero` | `0x903c61c` | `095a8252 6902a072` | `09008052 1f2003d5` (`mov w9, #0; nop`) |
| `noeject` | `0x903ca3c` | `f44fbea9 fd7b01a9` | `00008052 c0035fd6` (`mov w0, #0; ret`) |

Changing the framework invalidates its code signature, so it is re-signed ad hoc. Stock
Electron is already only ad hoc and linker signed, so nothing is lost, and a packager signs
the final app with a real identity anyway. One detail matters for a byte-exact result: signing
the framework binary in place makes `codesign` seal the whole bundle even without `--deep`,
adding files the upstream zip does not have. Signing a copy outside the bundle and copying it
back avoids that (the
[design notes](https://github.com/csarkosh/electron-gamepatch/blob/main/docs/design.md)
cover it).

## 6. Measuring it

The test app is small: synthetic clicks lock the pointer (clicks are fine; only keys take the
bypass in section 3), a real Esc goes through the operating system, then the main process
clicks every 100 ms until `pointerlockchange` reports locked, and records the gap. Three
rounds per build on Electron 44.0.0, macOS arm64:

| Build | Relock gap after Esc | Attempts | Page saw `keydown Escape` while locked |
|---|---|---|---|
| stock | 1322 / 1526 / 1526 ms | 14–16 | no |
| `zero` | 12 / 12 / 3 ms | 1 | no |
| `noeject` | 10 / 24 / 20 ms | 1 | **yes**; the page called `exitPointerLock()` itself |

Neither patched build ever saw a refusal. Then the real game ran in the `noeject` build,
driving the actual flow: click the canvas, real Esc, click the pause menu's Resume. Three
instrumented runs:

| Step | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| Click to locked | 127 ms | 96 ms | 80 ms |
| Esc `keydown` reached the page while locked | yes | yes | yes |
| Page released, menu open | 27 ms | 34 ms | under 10 ms |
| Resume click to relocked | **12 ms** | **13 ms** | **16 ms** |
| `pointerlockerror` or rejected requests | 0 | 0 | 0 |

No client change was needed. An earlier, uninstrumented run reported a 1286 ms relock; it was
a race in the test driver (it read the Resume button's position before the menu existed, so
the click missed) and it never reproduced once the page was instrumented.

## 7. Windows x64

The same method carries over with two format changes and a different probe.

- **Symbol address to file offset.** Windows symbols give a relative virtual address, not a
  file offset, so the PE section table is walked: find the section containing the address,
  then `offset = rva - VirtualAddress + PointerToRawData`. In Electron 44.1.1's `electron.exe`,
  `HandleUserPressedEscape()` is at RVA `0x7c53420`, `.text` starts at RVA `0x1000` and raw
  offset `0x600`, so the file offset is `0x7c52a20`.
- **Binary identity.** Instead of a Mach-O UUID, the executable's CodeView debug record (the
  RSDS GUID and age), formatted the way Breakpad formats it, must equal the `.sym` module id.
- **The bytes.** The prologue starts with three single-byte pushes, `push rsi; push rdi;
  push rbx` (`56 57 53`), replaced by `xor eax, eax; ret` (`31 c0 c3`). Same length, same
  effect as the arm64 write. `electron.exe` ships unsigned, so there is no re-signing, and a
  byte compare of patched against upstream prints exactly three differing bytes.
- **The probe.** Esc is sent with PowerShell `SendKeys` on a hosted Windows CI runner. The
  stock build runs as a mandatory control: if stock *passes*, the runner is not delivering
  real keystrokes and the result is thrown out. Without that control, a runner that silently
  dropped the key would make every build look patched.

Measured on the CI runners for Electron 44.1.1, three rounds each:

| Runner | Build | Relock gap after Esc | Attempts |
|---|---|---|---|
| Windows x64 | stock | 1268 / 1317 / 1327 ms | 13–14 |
| Windows x64 | `noeject` | 11 / 2 / 9 ms | 1 |
| macOS arm64 | `noeject` | 3 / 29 / 18 ms | 1 |

The patch README summarises the arm64 numbers and the page-side contract
([pointerlock-noeject](https://github.com/csarkosh/electron-gamepatch/blob/main/patches/pointerlock-noeject/README.md)).

## 8. Delivery

**Route A, shipped: republish patched Electron releases.** electron-gamepatch republishes
official Electron releases with the `noeject` patch on darwin-arm64 and win32-x64 and
everything else byte-identical. A project adds two lines to `.npmrc` and installs Electron as
usual; packagers see a normal Electron. The
[README](https://github.com/csarkosh/electron-gamepatch/blob/main/README.md) has the setup,
the platform table and how to verify a release with `cmp`, and the patch itself is a small
declarative file,
[`patch.json`](https://github.com/csarkosh/electron-gamepatch/blob/main/patches/pointerlock-noeject/patch.json),
naming the symbol, the expected bytes and the replacement.

No offsets are stored, because they move. The same `HandleUserPressedEscape()` prologue sat
at `0x903ca3c` in Electron 44.0.0's arm64 framework and at `0x908e3b0` in 44.1.1's, with
identical bytes. The tool resolves the symbol per release, asserts the expected bytes before
writing, disassembles the result, and checks that the binary differs from upstream only at
the declared sites (plus the signature on macOS). If a new Electron's compiler output changes
the function, the byte assertion fails and nothing is published until someone re-derives the
bytes. Adding another patch follows the
[runbook](https://github.com/csarkosh/electron-gamepatch/blob/main/.agents/new-patch.md).

The game's desktop build also proves the patch survived packaging, and there was a trap
there. On macOS the packaged framework is compared with the mirror's outside the regions code
signing owns. On Windows an exact compare is never possible: the packager (electron-builder
26.15.3, as measured) writes an integrity resource into the executable's `.rsrc` section
*before* its after-pack hook runs, and edits the icon and version strings after it, so the
executable never matches the mirror's byte for byte at any moment. The rule became "equal
outside `.rsrc`": the same section list, and identical raw bytes for every section except the
resources.

**Route B, documented, never built: a source fork.** A byte rewrite can express scalar and
branch changes and early returns. A change that needs new state, a new function or a runtime
switch needs a real Electron fork and the costs in section 4. That is the escalation path if a
future patch cannot be written as bytes; the pointer-lock fix did not need it.

## 9. Epilogue: the shell loads the live site

The first desktop builds bundled the game client, for offline start and real versioning.
Within a day that decision cost more than it bought: an installed copy carried a client that
the live server no longer spoke to, and nothing short of a new desktop release could fix
it. The shell is now a thin launcher
([`main.cjs`](https://github.com/csarkosh/game-dayhike/blob/main/desktop/main.cjs)): one
window that loads the live site, sandboxed and context-isolated, with no preload and no IPC,
a permission handler that grants pointer lock and native fullscreen and nothing else, and a
static offline page with a Retry button when the site cannot be reached. It appends its own
version to the user agent so the page can offer a newer shell. Every web deploy is now the
desktop update, and a desktop release is cut only when the patched Electron underneath
changes. Offline start was given up knowingly.

## Sources

| Source | Covers |
| --- | --- |
| [`pointer_lock_controller.cc`](https://source.chromium.org/chromium/chromium/src/+/main:chrome/browser/ui/exclusive_access/pointer_lock_controller.cc) (Chromium) | The 1.25 s constant, the gate and its exemptions, `HandleUserPressedEscape()` |
| [Blink `pointer_lock_controller.cc`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/page/pointer_lock_controller.cc) (Chromium) | The renderer-side sliding-window rate limit and both error messages |
| [`electron_api_web_contents.cc` at v44.1.1](https://github.com/electron/electron/blob/v44.1.1/shell/browser/api/electron_api_web_contents.cc) (Electron) | `PreHandleKeyboardEvent` handling exclusive access before `before-input-event` |
| [`webContents` API](https://www.electronjs.org/docs/latest/api/web-contents) (Electron) | `before-input-event` and `sendInputEvent` |
| [Keyboard: lock()](https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/lock) (MDN) | Keyboard Lock and press-and-hold Esc in fullscreen |
| [Pointer Lock 2.0](https://w3c.github.io/pointerlock/) (W3C) | `requestPointerLock`, `exitPointerLock`, `pointerlockchange` |
| [Breakpad symbol files](https://chromium.googlesource.com/breakpad/breakpad/+/master/docs/symbol_files.md) (Breakpad) | `MODULE` and `FUNC` records used to locate the functions |
| [electron-gamepatch](https://github.com/csarkosh/electron-gamepatch/blob/main/README.md) and its [probe](https://github.com/csarkosh/electron-gamepatch/blob/main/test/probe/main.js) | The shipped patch, its verification and the relock probe |
