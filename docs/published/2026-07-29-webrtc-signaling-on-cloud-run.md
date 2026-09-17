---
description: Hosting a WebRTC signaling server on Google Cloud Run for a browser co-op game, the platform behaviours that broke it, and what a running match survives.
published: 2026-07-29
---
# Hosting WebRTC signaling on Cloud Run

**Question:** Day Hike's co-op runs peer to peer over WebRTC, so its server only has to
introduce players to each other. How do you host that server for close to nothing, and what
goes wrong when a server that ran fine on `localhost` meets a real serverless platform?

**Short answer:** the static game and the signaling server live on two origins (Firebase
Hosting and Google Cloud Run), which avoids a load balancer's fixed monthly charge. The
signaling service runs as exactly one Cloud Run instance, because rooms live in its memory.
Five things then broke it, none of them visible on `localhost`: a health path
that Google's frontend answers before the container sees it, half-open sockets that look
idle, a 60-minute cap on every request, revision swaps that *drain* old sockets instead of
closing them, and a build that ships Git LFS pointer files without complaint. The fixes are
a different health path, server pings, a host grace window with role-biased reconnection,
deleting superseded revisions on deploy, and a verifier that checks the live site rather
than trusting the deploy command's exit code. What those fixes protect is asymmetric. A
running match survives the host losing its signaling socket; a follower who loses theirs is
removed from the host's game and has to rejoin. That is a deliberate trade: the host needs
some outside signal that a player whose phone died is gone, and the signaling server's view
of the lobby is the only one it has.

How the game itself stays in sync between peers (the fixed step, inputs, snapshots and lag
compensation) is covered in [Browser co-op netcode](/research/browser-coop-netcode). This
article is only about the server that gets peers connected, and the platform under it.

## 1. Why a server that "only introduces peers" still needs care

Signaling is the part of WebRTC the standard leaves to you: before two browsers can open a
data channel, something has to carry the offer, the answer and the ICE candidates between
them. Day Hike's server is a small Node process using the `ws` library. A player who presses
**Invite** creates a lobby; everyone who opens the invite link joins it; the joiners send
their WebRTC offers to the host through the server, and from then on gameplay flows directly
between browsers.

The goal is that losing signaling mid-game does not end the match. Section 4 shows how far
that holds (fully for the host, not for followers). Even that much is harder than it sounds,
for three reasons:

- **One process holds every room.** Rooms are an in-memory map, so the service is pinned to
  a single instance, and that one process has to protect itself: every lobby lives in it.
- **The socket is long-lived.** Each lobby member holds one signaling socket for the whole
  visit, not just for the handshake. Lobby traffic (player names, the roster, the page the
  host is on) rides the same relay, and a host needs its socket to hear about late joiners.
- **Hosting makes socket loss routine.** On `localhost` a signaling socket never drops. On
  Cloud Run it drops at the 60-minute request cap, on every scale-down and on every deploy
  (once old revisions are deleted, section 5).

So the server is small, but it is the one shared, stateful piece in an otherwise
serverless design.

## 2. Two origins instead of a load balancer

| Origin | Serves | Notes |
| --- | --- | --- |
| Firebase Hosting | The built client | Free global CDN and managed certificate; a catch-all rewrite to `index.html` so deep links resolve |
| Google Cloud Run | The signaling server, WebSocket on `/ws` | Scales to zero; at most one instance, deliberately small; 60-minute request timeout |

Putting both behind one origin was the obvious first design, because the client already
opened its socket on the page's own host. It was rejected on cost and maturity:

- **A global external Application Load Balancer** would route `/ws` to Cloud Run and
  everything else to a storage bucket behind Cloud CDN, with no client change at all. GCP
  charges about **$18 a month per project** for its forwarding rules whether or not traffic
  flows (the price when this was designed, in July 2026). That is $216 a year for a demo
  that may go weeks without a visitor, when two origins cost nothing and first-click latency
  is comparable.
- **Cloud Run domain mapping** would give one origin for free, but Google documents it as a
  preview feature that is not production-ready because of latency issues, and it is only
  available in some regions.

The cost picture as designed in July 2026:

| Item | Free allowance | Beyond it |
| --- | --- | --- |
| Firebase Hosting egress | 10 GB a month | $0.15 per GB |
| Cloud Run | 180,000 vCPU-seconds a month, about 50 hours of active lobbies | Billed for instance time |
| Artifact Registry | 0.5 GB | $0.10 per GB a month |

Cloud Run bills instance time, and an open WebSocket keeps the instance's CPU allocated, but
one instance serves every room at once, so ten simultaneous lobbies cost the same as one.
The project has to be on Firebase's pay-as-you-go plan because Cloud Run needs billing,
which also removes the free plan's daily transfer cap. The image registry was later measured
at 57 MB after eight builds, almost all of it one shared base layer, so storage is about
tidiness rather than the bill.

Two origins cost one client change: the signaling URL has to be configurable. It is a
build-time variable with a fallback to the page's own origin for development, where Vite's
dev server proxies `/ws`. An empty value counts as unset, so a variable that failed to
substitute falls back rather than calling `new WebSocket("")`. Section 6 shows how that
fallback still shipped a broken site.

## 3. Cloud Run behaviours that broke it

The server as written for `localhost` could not ship. `new WebSocketServer({ port })`
creates its own HTTP server that answers every ordinary request with 400, so there was
nothing for a health check to read. It became an explicit Node HTTP server with a health
route, a `ws` server with no listener of its own, and an `upgrade` handler that accepts
`/ws` only. Binding one path for development and production means a misrouted upgrade is
refused instead of silently accepted.

### The health path Google answers for you

The health route was first `/healthz`, a common convention. On the default `run.app`
domain, Google's frontend intercepts that exact literal path and answers it itself; the
request never reaches the container. Cloud Run's documentation lists "some paths ending
with `z`" as reserved and recommends avoiding all of them.

What made it expensive is that nothing looked wrong. The Cloud Run **startup probe still
passed**, because it reaches the container directly and never crosses the public edge. The
revision went healthy and served traffic, while every external check read a response the
container never wrote. The route is now `/healthcheck`; the server, the startup probe, the
post-deploy poll and the production verifier all agree on it, and each carries a comment
explaining why, because the obvious clean-up is to rename it back.

### Idle is not dead

Once the peers' data channels are open, signaling goes quiet by design. A socket whose
network vanished without sending a FIN (a phone leaving coverage, a laptop lid closing)
looks exactly like one of those quiet sockets. For a follower that wastes a slot. For a host
it was worse: no close event meant the room never started its grace period (section 4), so
the room was stranded for the life of the process and everyone holding the invite link was
told the host was away, forever.

The server now pings every socket every 30 seconds and terminates any socket that has not
answered the previous ping by the next tick, which puts detection inside a minute. Browsers
answer pings at the protocol level, so this needed no client code. Terminating raises the
same `close` event as a real disconnect, which routes the dead socket into the normal
departure path.

### Size and flow limits

`ws` accepts very large frames by default. That never mattered on `localhost`, but a public
endpoint served by one small instance cannot afford it, so the server caps frame size far
above the largest legitimate message (an SDP offer of a few kilobytes), and `ws` closes just
the offending socket.

The rest of the defences follow well-known patterns, applied at the cheapest point:

- **Refuse before upgrading.** The `upgrade` handler checks an origin allowlist and
  per-address connection limits, and answers a refusal with a real HTTP status before `ws`
  ever creates a socket. The allowlist can be overridden from the environment, so a new
  domain is a configuration change, not a code change.
- **A token bucket per socket, checked before parsing.** A flood is refused before it buys
  the JSON parse it was trying to spend. The socket is closed rather than answered with an
  error per frame, which would reply to a flood with a flood.
- **An outbound backlog ceiling.** `ws` queues whatever a socket cannot flush, in this
  process's memory. A peer that is not reading gets closed instead of buffered for. Closing
  beats silently dropping: a lost offer leaves a peer waiting on a handshake that can never
  finish, while a closed socket reconnects and retries. This one needs no attacker; a phone
  on failing mobile data is a slow consumer.

Every limit sits far above real signaling traffic, which is a join, an offer or answer, a
short burst of ICE candidates, and then silence.

### Cold starts and the startup probe

With a minimum of zero instances, the first **Invite** after an idle period waits for a
container to boot. The server logs that it is listening 1.19 to 1.50 seconds after Cloud Run
starts the instance (measured over one day's starts in September 2026). A first probe at
1 second is therefore a coin flip: win and the cold start is about 1.3 seconds, miss and the
next probe is a whole period later, about 4.1 seconds. Both clusters showed up in the
startup-latency metric. Delaying the first probe to 2 seconds gives up the best case for a
worst case of about 2 seconds, the better trade for the one person waiting.

### Shutting down

Cloud Run sends `SIGTERM` on scale-down and on deploy. The server terminates every socket
rather than closing it politely, because a half-open socket would otherwise hold the HTTP
listener open until its own timeout. Peers therefore see an abnormal close (code 1006),
and section 4 covers what that costs a running match.

## 4. What a dropped signaling socket costs a match

Cloud Run caps any request, a WebSocket included, at 60 minutes. That is a limit on request
duration, not an idle timeout, so keeping a minimum of one instance warm does not avoid it;
only an always-on VM would, at real cost and real operations work. The host's socket *will*
close during a long session, and so will every follower's.

In the first hosted version, that close ended the match for everyone. The server treated
the host's socket closing as the host leaving: it broadcast `host_gone` and deleted the
room, and every client returned to the landing page with the message "The host ended this
session", while the host was fine and the data channels carrying the game were untouched.

The fix protects the host, in four parts.

1. **Socket death is not leaving.** The server distinguishes a socket that dies from an
   explicit `leave` message. A deliberate leave (including one sent on `pagehide` when a tab
   closes) ends a host's lobby at once. A host whose socket dies gets a **60-second grace
   window**: the room is kept, nothing is broadcast, and a host that reconnects with the
   same peer id reclaims the role. Only when the window lapses does `host_gone` go out. The
   peer id is minted once per page load, so a reconnect can reclaim but a reload cannot.
2. **Something has to notice a lapse.** The room registry holds no timer, which keeps it
   deterministic under an injected clock in tests. It was first designed to sweep lapsed
   rooms whenever it was accessed, but a room whose players are mid-game over peer-to-peer
   never touches the registry again, so its lapse would never be noticed. The server process
   drives the sweep on a 10-second interval instead.
3. **The client reconnects on its own.** The signaling client retries with jittered
   exponential backoff (0.5, 1, 2, 4, then 8 seconds, repeating) and resends the same verb,
   room and peer id each time. Handlers are reinstalled on every new socket. A host needs
   nothing more: it only ever answers offers that arrive, so reconnecting restores the path a
   later joiner's offer takes.
4. **A stale close must not evict its replacement.** A reconnected host has a new socket
   under the same peer id, and the old socket's close can arrive much later (a half-open
   socket is only noticed when the heartbeat gives up). Departures are keyed on socket
   identity, not peer id, so that late close is ignored instead of stranding a healthy room.

Signaling errors that only concern joining (the room is full, the host is away) are ignored
once a player's data channel is up; [Browser co-op netcode](/research/browser-coop-netcode)
covers that policy.

### Followers are removed when their socket drops

The grace window is the host's alone. A follower whose signaling socket closes without a
`leave` is treated exactly as if it had left: the server sends `peer-left` to the rest of
the room at once, the host's lobby roster drops that player, and the host removes from its
game every peer no longer on the roster, closing their data channels.

This reverses an earlier decision. An early version had the host remove a player whenever
the server reported them gone, which would have torn down every healthy data channel on each
deploy, so that handler was deleted. Lobbies brought a deliberate version of it back, because a data channel only closes when the other side closes
it. A tab being closed says goodbye to the lobby on `pagehide`, but a killed browser or a
phone that lost its network never closes anything, and without an outside signal that player
would stand in the host's world for good. The signaling server is that signal: a clean exit
reaches it as a `leave`, and the heartbeat reaps a silent socket within a minute. It cannot
tell a follower whose socket dropped while its game kept running from one whose phone died,
so it reports both the same way.

| Signaling event | Host | Followers |
| --- | --- | --- |
| The host's socket drops | Keeps the room for 60 seconds and reclaims it on reconnect | Keep playing |
| A follower's socket drops (its own 60-minute cap, a network blip) | Keeps playing | That follower is removed from the game |
| Every socket drops at once (a deploy) | Recreates the lobby on reconnect | Depends on which socket the server sees close first (below) |
| The host leaves, or its grace window lapses | The lobby ends | The lobby and their game end |

The cost falls at the 60-minute cap. Each socket's cap runs from the moment it opened, so in
a long session every follower's socket reaches it while the host is still connected, and
that follower is removed about once an hour. A deploy is less clear-cut. When the server shuts
itself down it terminates all of its sockets together, so a follower's `peer-left` has no
open host socket left to reach, and followers keep playing; whether deleting a revision always
takes that path, or sometimes closes a follower's socket before the host's, was not measured
(*unverified*).

A removed follower's client makes one attempt to reconnect to the host, then gives up rather
than hide a dead connection behind a retry loop. The attempt starts as soon as the host
closes the channel, but its offer travels over signaling, and the follower's own socket is
still waiting out its reconnect delay of about two seconds. Reading the shipped code, that
attempt then fails at the 15-second handshake timeout and the player is sent back to the
landing page, still a member of the lobby, to rejoin from there (*unverified*: not reproduced
in a live session).

So the trade is this: a player who has really gone leaves the world within a minute, and a
follower in a long session is dropped from the game roughly once an hour and has to rejoin.

### Who gets to be host after everyone drops

The grace window does not cover a simultaneous drop. The registry deletes a room the moment
its last socket goes, and when every socket in a room closes at once (a deploy), the host is
usually not the last one out. In the original design the first peer to reach an empty room
became its host. Every peer then reconnected on the same jittered delay, so the real host
won the race roughly one time in N. Losing it did not disturb the running match, but it
broke the invite link for the rest of the session: only the real host listens for new
offers, so a later joiner's offer was relayed to a peer that discarded it, and the joiner
failed with a misleading ICE error.

The fix was to bias the delay by role. Clients add 1.5 seconds to every reconnect, well
beyond the jitter spread, and the host adds nothing. A peer that does not yet know its role
takes the client delay, because guessing "host" is the guess that loses rooms. It is a
strong bias rather than a guarantee: if the server stays unreachable past the first attempt,
the host's second try and a client's first can overlap.

Lobbies removed the race entirely. A room is now opened only by a `create` message, and
only the player who created the lobby ever sends it; a `join` to a room that does not exist
is refused and the socket closed, and that client simply retries on its next backoff step.
Nobody becomes host by arriving first, so after a full outage the host's `create`
re-registers the lobby and followers find it on their next attempt. The role offset stays,
and now only saves those wasted round trips.

## 5. A revision swap runs two registries

The design assumed a deploy would interrupt every signaling socket at once. Driving two
real browsers against production and redeploying mid-match disproved it. Cloud Run does not
drop established WebSockets when traffic moves to a new revision; it **drains** them, and
the old revision keeps serving its sockets until they end, up to the 60-minute cap.

For that whole drain, two revisions are live with separate in-memory registries. The
single-instance limit holds per revision, not across a revision boundary, so two different
rooms can exist under the same id. The running match is unaffected: its players stay
attached to the old revision and play peer to peer. What breaks is the room's invite link.
A new joiner reaches the new revision, finds no room, and (under the original
first-arrival-hosts rule) became the host of a parallel world of their own. In production,
the two original players kept playing across a redeploy while a third arrival hosted a
separate room under the same id.

Two remedies were considered and rejected:

- **Shared room state.** It sounds like the real fix and is not one on its own. Even if the
  new revision could see that the room exists with host A, relaying a joiner's offer to A
  means reaching A's socket in another process. That needs shared *messaging* (Google's own
  WebSocket guide points at Redis Pub/Sub or Firestore listeners for multi-instance
  services), a far larger and more expensive change than a shared document.
- **The old revision noticing it is stale.** A superseded revision would poll the service's
  public URL, compare the revision that answered with its own, and hang up its sockets when
  they differed. It needed a new environment variable that Terraform could not supply
  without a dependency cycle, a revision marker on the health route, a polling loop and its
  own tests, and it would still converge more slowly than the simpler fix.

The shipped fix is to delete superseded revisions. After a deploy's new revision is healthy
and serving, the deploy script deletes every revision that carries no traffic. That ends
their instances, closes their sockets, and every peer reconnects onto the one live revision,
where the host recreates the lobby (section 4 covers what that means for followers). The split now lasts as long as the client's reconnect
backoff instead of up to an hour. The clean-up never fails a deploy that already succeeded,
and it refuses to delete anything if it cannot read which revision is serving, since
guessing wrong would delete the live one.

That changes rollback. Shifting traffic back to an old revision is no longer possible,
because the old revision is gone; rolling back means redeploying an older image tag. The
image registry's clean-up policies therefore always keep the ten most recent images, which
is how many deploys back a rollback can reach.

One infrastructure lesson generalizes. Terraform owns the service's shape and the deploy
script owns its image tag, so the image field is excluded from Terraform's change
detection; without that, every `terraform apply` silently rolls the service back to
whatever image was current when the configuration was written.

## 6. Deploy traps: pointer files and the wrong signaling URL

Two failures produced a site that looked fine, deployed without an error, and was broken.

**Git LFS pointer files.** The game's binary models are stored in Git LFS. In a checkout
that never fetched them, each file is a text pointer of about 130 bytes, and `vite build`
hashes and emits those pointers into the bundle like any other asset and reports success.
The game then falls back to placeholder capsules exactly as designed, and nothing anywhere
reports an error. The deploy looks clean and every model is a capsule. The build now checks
that the LFS files are materialized *before* building, and the production verifier fetches
the shipped models and checks their binary glTF magic bytes.

**A bundle built without the signaling URL.** Build the client by hand instead of through
the deploy script and the signaling variable is unset. The client falls back to
`wss://<its own host>/ws`, Firebase Hosting's catch-all rewrite answers that upgrade with
`index.html`, and the game is completely unplayable while the page, the assets and the
health check all pass. The verifier now reads the deployed bundle's source and asserts that the real `wss:`
URL appears in it, derived from the same infrastructure output the build reads rather than
typed into the check.

The verifier exists because "the deploy command exited 0" is not evidence that players can
play. It works only against the live site over the network, and a few of its details were
learned the hard way:

- **It performs a real lobby handshake.** It opens a WebSocket, sends `create`, and
  requires the server to answer with the host role. The room id is fresh for every run; it
  used to be a constant, so two overlapping runs landed in the same room and the second
  reported a failure that was only the first run holding the host slot.
- **It fails fast on a close code.** A misrouted upgrade or a dead revision usually shows up
  as a dropped socket, and waiting out a 15-second timeout would report nothing useful.
- **A total outage produces the same failure list** as a single failed check, so whatever
  reads the output never has to parse a stack trace.

The full deploy runs the server first and the client second, so the client is always built
against a signaling URL that already answers.

## 7. Known limits

- **STUN only, no TURN.** The client uses Google's public STUN servers. Some peer pairs
  behind symmetric NAT or strict carrier and corporate networks cannot connect at all; the
  design estimated roughly 10 to 20 percent of pairs (*unverified*: a design-time estimate,
  not measured for this game). Adding TURN is configuration, not code.
- **Room state is not durable.** When every socket in a room closes at once, the room is
  recreated on reconnect; a late join during that gap fails and the player retries.
- **Followers have no grace window.** A follower whose signaling socket drops is removed from
  the game and has to rejoin (section 4).
- **A host reload ends the lobby.** Reclaim is scoped to a page load, so a host who
  refreshes is a new peer, and the lobby ends for everyone.

## Sources

| Source | Covers |
| --- | --- |
| [Cloud Run known issues](https://cloud.google.com/run/docs/known-issues) (Google Cloud) | Reserved URL paths, including paths ending in `z` |
| [Using WebSockets](https://cloud.google.com/run/docs/triggering/websockets) (Cloud Run) | WebSockets are subject to the request timeout of up to 60 minutes; clients should reconnect; shared messaging across instances |
| [Mapping custom domains](https://cloud.google.com/run/docs/mapping-custom-domains) (Cloud Run) | Domain mapping is in preview, not production-ready, and region-limited |
| [`server/src/server.ts`](https://github.com/csarkosh/game-dayhike/blob/main/server/src/server.ts) and [`server/src/index.ts`](https://github.com/csarkosh/game-dayhike/blob/main/server/src/index.ts) | Health route, upgrade handler, heartbeat, flow control, shutdown |
| [`server/src/rooms.ts`](https://github.com/csarkosh/game-dayhike/blob/main/server/src/rooms.ts) | Lobbies, host grace window, identity-keyed departures |
| [`client/src/net/signaling.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/net/signaling.ts) and [`client/src/net/signalingUrl.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/net/signalingUrl.ts) | Backoff, role-biased reconnect, the signaling URL fallback |
| [`client/src/app.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/app.ts) and [`client/src/net/hostSession.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/net/hostSession.ts) | Host-side peer retention from the lobby roster, the follower's single reconnect attempt |
| [`client/src/net/lobby.ts`](https://github.com/csarkosh/game-dayhike/blob/main/client/src/net/lobby.ts) | Lobby messages over the signaling relay |
| [`tools/deploy/lib/revisions.mjs`](https://github.com/csarkosh/game-dayhike/blob/main/tools/deploy/lib/revisions.mjs) | Deleting superseded revisions |
| [`tools/deploy/verify.mjs`](https://github.com/csarkosh/game-dayhike/blob/main/tools/deploy/verify.mjs) and [`tools/deploy/lib/buildClient.mjs`](https://github.com/csarkosh/game-dayhike/blob/main/tools/deploy/lib/buildClient.mjs) | The production verifier and the LFS precondition |
