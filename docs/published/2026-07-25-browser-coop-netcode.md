---
description: How Day Hike's browser co-op stays responsive: a 60 Hz fixed step, redundant inputs, quantized snapshots, prediction, and host-created lobbies.
published: 2026-07-25
---
# Host-authoritative co-op netcode in the browser

**Question:** Day Hike is a co-op game for up to five players that runs in a browser tab. Peers
talk over WebRTC data channels, and the only server introduces them and steps out. How do you
make your own movement feel instant at a 150 ms round trip, keep five simulations in agreement,
and decide who owns the world, without a game server?

**Short answer:** one player's browser is the authority and everyone else predicts. The
simulation is a pure function stepped at a fixed 60 Hz, so a client can apply its own input
immediately, then rewind to each host snapshot and replay its unacknowledged inputs with the
same code and get the same answer. Inputs travel with redundancy instead of retransmission,
snapshots are quantized and sent unreliably at 20 Hz, and remote players are drawn 100 ms in
the past. Solo play is the same host with nobody connected. The one piece that changed
fundamentally after launch is who becomes host: it used to be whoever reached the room first,
and now it is only the player who opened the lobby.

The architecture is summarized in the game's public
[README](https://github.com/csarkosh/game-dayhike/blob/main/README.md) and
[ARCHITECTURE.md](https://github.com/csarkosh/game-dayhike/blob/main/ARCHITECTURE.md). This
article covers the protocol and the reasons behind it. The hosting half, the signaling server
on Cloud Run and what broke there, is in
[WebRTC signaling on Cloud Run](/docs/webrtc-signaling-on-cloud-run).

The game began as a co-op shooter with a rifle, hitscan and roaming enemies, and several of
these decisions were made for that game. Where the shipped code has moved on, the text says so.

## 1. A host-authoritative star

| Decision | Choice | Why |
| --- | --- | --- |
| Authority | One player's browser; the host also plays | Co-op means trusted peers, so anti-cheat is not a constraint |
| Topology | A star: host to each client, never client to client | Five players is four peer connections, not ten |
| Signaling | A small Node WebSocket server | Connection setup only; no gameplay traffic ever touches it |
| NAT traversal | STUN only, no TURN relay | Works for most home connections; a relay is configuration, not code |
| Movement | A custom kinematic capsule controller | Prediction and replay need exact determinism |
| Physics engine | None | Havok's rewind semantics fight client prediction |

Because the match is peer to peer, a signaling outage in the middle of a match leaves the host's
own game running; a follower whose signaling socket drops is a different story, since the host
removes it from the game and the follower's client makes one attempt to reconnect. The trade-off,
including why it removes every follower about once an hour when their socket reaches its time
limit, is in [WebRTC signaling on Cloud Run](/docs/webrtc-signaling-on-cloud-run).

A restrictive network that STUN cannot get through fails after a 15-second ICE timeout with an
error that says you or the host may be on a restrictive network, rather than hanging.

Each peer connection opens two data channels with different guarantees:

| Channel | Configuration | Carries |
| --- | --- | --- |
| `state` | unordered, `maxRetransmits: 0` | Input commands and snapshots |
| `event` | ordered, reliable | Welcome, joins and leaves, interactions, ping and pong, session end |

A dropped snapshot is worthless by the time a retransmit could deliver it, because the next one
supersedes it. A dropped join is not. Keeping them apart stops a lost event from causing
head-of-line blocking on the state stream. Both channels share one binary codec and one
message-type enum ([protocol.ts](https://github.com/csarkosh/game-dayhike/blob/main/client/src/net/protocol.ts),
[channels.ts](https://github.com/csarkosh/game-dayhike/blob/main/client/src/net/channels.ts)).

## 2. Determinism at a fixed 60 Hz

Prediction only works if replaying identical inputs produces an identical result. Three rules
make that hold.

- **The simulation is isolated.** `client/src` has three layers with one direction of
  dependency, `game/ → net/ → sim/`. `sim/` is plain TypeScript with no Babylon.js, no DOM and no
  wall-clock reads. ESLint forbids the imports, and
  [a test](https://github.com/csarkosh/game-dayhike/blob/main/client/test/architecture.test.ts)
  names any file that breaks the rule. The same isolation is what lets the netcode run headless
  under test.
- **The step is fixed.** Host and client both advance in 16.667 ms ticks, never a variable
  delta. A frame accumulator decides how many ticks to run, and rendering interpolates between
  the last two sim states at monitor rate. A backgrounded tab can hand back a multi-second frame;
  the accumulator runs at most 15 ticks and drops the rest, because catching up tick by tick
  would stall for longer than the gap it is making up
  ([loop.ts](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/loop.ts)).
- **Randomness is state.** The RNG is mulberry32, integer-only and therefore bit-identical on
  every JavaScript engine, and its seed lives inside world state, so AI and spawning replay
  exactly. A test serializes two runs of the world from identical inputs and asserts they match.

Floating-point maths is the remaining hazard. A sine and a cosine in movement's wish direction run
on both sides and during every replay; they are a known cross-engine risk that a fixed-point angle
representation would retire, and they have not been retired yet. The rest of the determinism
guarantees, including how the level id folds in the seed and refuses a mismatched world, are
covered in [An endless world as a pure function](/docs/procedural-world-as-a-pure-function).

## 3. Solo is a host with zero peers

The host runs `tickWorld` directly with its own input, with zero latency and no special-case
code. Clients wrap the same world in predict-and-reconcile. Playing alone creates the same host
session with no peers attached, opens no socket and never contacts the server. There is no
offline mode and no second implementation to drift.

The client's predicted world is deliberately smaller than the host's: it holds only the local
player and is marked non-authoritative, so it never runs enemy AI, the spawn director or respawn
timers. Everything else comes from snapshots. When the director did run on the client, it
invented a second population of enemies that existed nowhere else, chased the local player and
chewed its predicted health between snapshots.

## 4. Inputs: redundancy instead of retransmission

Input is sampled into one command per tick. Counted from the shipped encoder, a command is 15
bytes:

| Field | Type | Notes |
| --- | --- | --- |
| `seq` | `uint32` | Tick sequence number |
| `moveX`, `moveZ` | `int8` each | Movement axes mapped to ±127 |
| `yaw`, `pitch` | `float32` each | Full precision; the host resolves aim from these exact angles |
| `buttons` | `uint8` | Interact, jump, crouch, sprint, lamp |

Every tick the client sends one packet holding every command the host has not yet acknowledged,
capped at the most recent 16, behind a 3-byte header. A lost packet costs nothing, because the
next one already contains what was missed. A packet is therefore 18 to 243 bytes, sent 60 times
a second, so upstream cost grows with round-trip time up to a ceiling of 14,580 bytes a second
of payload. At a 200 ms round trip about twelve ticks are unacknowledged before counting the
host's input buffer and the wait for the next snapshot, so the window sits at or near its cap
(an estimate from the constants, not a measurement). The July 2026 design, with 13-byte commands,
budgeted about 3 KB/s at 50 ms and 9 KB/s at 200 ms.

On the host
([hostSession.ts](https://github.com/csarkosh/game-dayhike/blob/main/client/src/net/hostSession.ts)):

- **Resends are expected.** Any command at or below the last applied sequence, or already queued,
  is dropped.
- **Everything is untrusted, including friends.** A bug or a corrupted packet does as much damage
  as malice: a single non-finite yaw reaches `Math.sin` and turns that player's position into NaN
  permanently, which then poisons every snapshot they appear in. Commands with non-finite angles
  are rejected, axes and pitch are clamped, and yaw is wrapped. The decoder bounds the command
  count by what the buffer can actually hold, and each peer's queue is capped at a fixed depth so
  a burst cannot grow it without limit.
- **A backlog drains.** The host consumes one command per tick per peer, which is also the rate
  the client produces them, so a strict one-for-one diet means a backlog after a hitch never
  shrinks and every input stays permanently late. When more than two commands are queued, the
  host takes two in that tick and applies the extra as an additional movement step for that
  player alone, so the rest of the world still advances exactly once.
- **Presses are edges.** An interaction fires on the tick its bit turns on, once, never while
  held. Edges are ORed across every catch-up command in a tick, so a press that sits on the
  first of two commands still counts.

The sequence number was originally a `uint16`. At 60 Hz that wraps after 65,536 ticks, about 18
minutes. Past that point the host saw every input as already processed and dropped it, while the
client's unacknowledged queue grew without bound and was replayed in full on every snapshot. It
is a `uint32` now, and a test drives 70,000 ticks through a host and client to prove
reconciliation still settles to quantization error.

## 5. Snapshots: quantized, full, 20 Hz

Every third tick the host encodes one snapshot per peer. Each is addressed to one peer because it
carries that peer's `lastProcessedInput`. Fields, as the current encoder writes them:

| Field | Encoding | Precision and range |
| --- | --- | --- |
| Position (players and enemies) | `int32` ×3 at 1/128 m | 7.8 mm steps, about ±16,777 km |
| Velocity (players only) | `int16` ×3 at 1/128 m/s | ±256 m/s |
| Yaw | `uint16` | 65,536 steps around the circle |
| Pitch (players only) | `int8` mapped across ±90° | About 0.7° per step |
| Health, AI state | `uint8` | |
| Grounded, respawn timer | `uint8` each | Respawn in tenths of a second, capped at 25.5 s |
| Headlamp | one byte | Bit 0 on or off, bits 1 to 7 the charge in 127 steps |

That makes a 13-byte header (type, `uint32` tick, `uint32` acknowledged input, and two `uint16`
counts), a 27-byte player record and an 18-byte enemy record.

Two asymmetries are load-bearing:

- **Players carry velocity; enemies do not.** A reconciling client resets to the authoritative
  state and replays from it. Without the authoritative velocity, acceleration would restart from
  a standstill 20 times a second and movement would feel sluggish for reasons that look like a
  physics bug rather than a netcode one. Enemies are only ever interpolated, so they never need it.
- **Pitch is quantized hard because it is presentation only.** It tilts a remote player's head.
  Aim that matters travels in the input stream at full precision.

Positions were `int16` in the first protocol, at the same 1/128 m scale: a 512 m box around the
origin, which was plenty for a hand-built sandbox level. The generated forest outgrew it, so a
player spawned far from the origin came back from the codec at the wrong place. Positions widened
to `int32`, the protocol version was bumped, and a test now sweeps the trailhead and every trail
node for 200 seeds through the codec and requires each to come back within half a step.

Current sizes, counted from the encoder:

| Case | Snapshot | Down per client at 20 Hz | Up for a host with four clients |
| --- | --- | --- | --- |
| Shipped forest: five players, no enemies | 148 bytes | 2,960 bytes/s | 11,840 bytes/s |
| Codec budget test: five players, 30 enemies | 688 bytes | 13,760 bytes/s | 55,040 bytes/s |
| July 2026 design: five players, 30 enemies | 466 bytes | about 9 KB/s | about 36 KB/s |

These are payload bytes, before SCTP, DTLS and UDP headers. The generated forest currently sets
its enemy population to zero, so shipped snapshots carry player records only; the enemy record
stays in the codec, and a test pins the 688-byte worst case. The July design also planned to
delta-encode each snapshot against the client's last acknowledged one. The shipped codec sends
every snapshot in full, which means a lost snapshot needs no baseline bookkeeping at all.

## 6. Prediction and reconciliation

The client applies its own command the moment it is sampled, through the same `tickWorld` the
host runs, so its own movement has no perceived latency. When a snapshot arrives
([clientSession.ts](https://github.com/csarkosh/game-dayhike/blob/main/client/src/net/clientSession.ts)):

1. If its tick is not newer than the last one applied, drop it. The state channel is unordered,
   and an older snapshot would move everything backwards.
2. Reset the local player to the authoritative position, velocity, health, grounded flag, respawn
   timer and headlamp.
3. Drop every buffered command at or below `lastProcessedInput`.
4. Replay the rest through the same movement code.

Identical code plus identical inputs gives an identical result, so on a clean link the
correction is invisible, and a visible snap means the host genuinely disagreed, which is the only
time you want to see one. The client records how far each reconciliation moved the local player
as its prediction error.

Quantization caused the subtlest bug here. A snapshot position rounded to 1/128 m can land a few
millimetres inside the floor. A mover that starts inside the floor gets no collision, so the
reconciled client never re-grounded and silently ran on air acceleration (1.2) while the host ran
on ground acceleration (10). Nothing looked broken; the client just felt like sludge. A test now
requires the reconciled player to stay grounded and within a centimetre of the host's height.

The headless suite pins the behaviour against an in-process network:

| Condition | Requirement |
| --- | --- |
| Perfect link, 300 ticks of weaving movement | Prediction error under 2 cm (quantization only) |
| 75 ms latency, 15 ms jitter, 5% loss, 600 ticks | Client within 0.5 m of the host once in-flight input drains |
| 50 ms link with a one-second blackout | Re-converges to within 1 m |
| 70,000 ticks | Error still under 2 cm and within 5 cm of the host |

Some state is not predicted at all. The headlamp toggle is decided by the host on the press edge
and reaches the client in the next snapshot, so a client never shows a lamp state the host did
not choose.

Remote players and enemies are never predicted. They render 100 ms in the past, blended between
the two snapshots that bracket that moment by arrival time, with yaw interpolated the short way
around the circle so 359° to 1° does not spin. The July design also specified a smoothed tick
offset derived from ping and pong to timestamp inputs. The shipped client uses the once-a-second
ping only to measure round-trip time; inputs carry sequence numbers, and the host's small input
buffer and catch-up rule absorb the timing.

## 7. Lag compensation, designed for a rifle

The shooter needed lag compensation, and the July design specified it this way:

- The host keeps a one-second ring buffer of every enemy position, one frame per tick.
- When a client fires at tick *T*, the host rewinds enemy hitboxes to the world that client
  actually saw, *T* minus its interpolation delay, and runs the hitscan there. Without it, hitting
  a moving enemy means leading it by your ping.
- Because the game is co-op, the host accepts the client's claimed fire tick subject only to loose
  sanity bounds: inside the history buffer and not in the future. PvP would need much stricter
  validation.
- The client predicts effects only: muzzle flash, recoil, tracer and sound. It never predicts
  damage or kills. The host sends hit confirmations on the reliable channel, and those drive
  hitmarkers. Mispredicting a muzzle flash is invisible; mispredicting a kill and then revoking it
  is the worst feeling in a shooter.

That design was built and tested against the in-process network, including a case that separates
two moments in time so a 900 ms peer hits the enemy's old position while a 0 ms peer misses.

On 10 September 2026 the rifle came out. The fire bit became Interact and the reload bit became
the headlamp toggle, on the same wire positions, and an architecture test now fails if a Fire or
Reload button or the combat module reappears. In the shipped game nothing rewinds. An interaction
resolves against the host's present tick: the nearest target within 2.5 m of the eye and inside a
35° cone around the aim ray
([interact.ts](https://github.com/csarkosh/game-dayhike/blob/main/client/src/sim/interact.ts)).
The targets registered so far are fixed in the world, so there is no past position to rewind to.
The input stream still carries full-precision look angles because that resolver uses them.

## 8. Tooling: a fake network, a netgraph and `?net=`

**The transport is the seam.** Host and client sessions take a small `Transport` interface (send and
receive, once per channel) instead of touching `RTCDataChannel`. In production it wraps the two data channels; in tests it is
a `FakeNetwork` with configurable latency, jitter and loss, drawn from a seeded RNG so every run
is reproducible. It drops only state messages, and it never lets an event land before its
predecessor, matching the real channels' contracts. The same fake runs a host and several clients
in one Node process, which is how every requirement in section 6 is tested with no browser.

**The netgraph is a feature, not a nicety.** In game, F3 or the backquote key toggles an overlay
([netgraph.ts](https://github.com/csarkosh/game-dayhike/blob/main/client/src/game/netgraph.ts))
with frame rate, tick, round-trip time, snapshots per second, downstream bytes, entity count,
unacknowledged inputs and the prediction error. Under it is a bar that fills at 20 cm of
correction and turns red past 10 cm, the point where a correction stops being invisible. When
netcode misbehaves, that one number says within seconds whether the problem is prediction. With
200 ms of latency plus jitter and loss in July, it read 0.0 cm at rest and returned to 0.0 cm after
movement, which ruled out systematic drift.

**`?net=` degrades one tab on demand.** Adding `?net=lat:200,jitter:50,loss:10` to the URL wraps
that tab's transports in a proxy before they reach the real data channels. Latency and jitter
apply both when the tab sends and when it receives, so `lat:200` adds roughly 400 ms to that tab's
round trip. Loss drops state messages in both directions; events are delayed but never dropped,
because the event channel is reliable by contract. Values are clamped to 5 seconds of latency,
1 second of jitter and 100% loss. Only the tab that sets it is affected, so one player can
reproduce a bad connection against otherwise healthy peers.

## 9. Lobbies: nobody becomes host by arriving first

The first version routed sessions by URL. Create Game minted a UUID and navigated to
`/game/<uuid>`; the link was the invite, and the signaling server made the first peer into a room
its host. The room id also doubled as the world seed, so two strangers opening the same link
shared a match.

Two rules replaced that:

- **Nobody becomes host by arriving first.** The host is the player who opened the lobby. The
  signaling protocol gained a `create` verb beside `join`
  ([rooms.ts](https://github.com/csarkosh/game-dayhike/blob/main/server/src/rooms.ts)). The client
  mints the lobby id; `create` registers the room with the caller as host. A `create` for a room
  whose host is live is refused as `lobby_taken`, unless it comes from that same host after a drop,
  in which case it is a reclaim. A `join` no longer creates anything: joining a room that does not
  exist is `no_such_lobby`.
- **A seed is not a session.** A `/game/<token>` link only chooses the world. Two people opening
  the same token play two solo games, and neither opens a socket. Only an invite joins players.

Pressing Invite is the only way to become host: it mints a lobby id, opens the socket, sends
`create` and shows the link. Opening `/party/<id>` sends `join`. The lobby lives above page routes
([lobby.ts](https://github.com/csarkosh/game-dayhike/blob/main/client/src/net/lobby.ts)), so
members keep one socket for the whole visit. When the host navigates, including into a game, the
new route is broadcast and followers navigate with it; their games then connect to the host over
WebRTC. Lobby messages ride the server's existing signal relay with a `lobby` key, so they never
collide with WebRTC offers on the same socket. The host always sends the full roster and route,
never diffs, and names from other peers are untrusted: anything that is not a string, is empty
after trimming, or runs past 24 characters becomes `Hiker`.

The change also removed a race where a follower that reconnected before the host could recreate
the room with itself as host; that race, why every socket in a room can drop at once, and how
reconnection now plays out are told in
[WebRTC signaling on Cloud Run](/docs/webrtc-signaling-on-cloud-run).

Some limits are deliberate. There is no host migration: a host closing the tab or reloading ends
the lobby for everyone, and a follower who reloads drops out and needs the link again. Once the
data channels are up, signaling errors such as `host_away` or `room_full` are ignored, because
they describe join attempts and say nothing about a match that is already running. TURN relay,
anti-cheat and PvP stay out of scope, which the co-op, trusted-peer premise in section 1 allows.
