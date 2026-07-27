# Online Multiplayer Plan (N0–N9)

Exploration branch: `claude/online-multiplayer`. This document is the
actionable implementation plan for online 1v1 multiplayer, produced from
codebase analysis, internet research, and a working de-risking spike
committed alongside it (see §2 and Appendix A). It follows the same
conventions as `plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md`: every
workstream is gated by tests written first, each workstream is a commit
point, and numeric thresholds are measured before they are pinned.

## 0.1 Locked decisions (user-confirmed)

1. **Deliverable of the exploration branch**: this plan + the committed
   spike (done). Implementation is a follow-up.
2. **Friend play**: private room with a short shareable code — no
   accounts, no login.
3. **Matchmaking**: also required — a simple quick-match queue that
   pairs the two longest-waiting players. No skill rating.
4. **Infra**: serverless free tiers (Cloudflare), $0 target at friend
   scale; the only conceivable paid element is TURN relay overage,
   which the research shows is effectively unreachable (§3.4).
5. **Scope**: 1v1 now; the architecture must not need a rewrite for
   2v2 later (§4.6). Tournaments/spectating/accounts are explicit
   non-goals (§8).
6. **Network conditions**: must degrade gracefully across a realistic
   spread (≤ ~150ms RTT, jitter, moderate loss) — see N7's impairment
   matrix.

## 0.2 The single architectural insight everything follows from

This game is **already almost a deterministic lockstep game**:

- One fixed 120Hz tick (`FixedStepCoordinator`), one rAF loop, physics
  stepped exactly once per tick in a fixed order
  (`GameRuntime.onFixedTick`: gameFlow.update → input → physics.step →
  applyPhysicsResults).
- A project-wide "no unseeded randomness" rule that has been enforced
  since Phase 2 — grep confirms zero `Math.random`/`Date.now`/
  `performance.now` in `src/physics`, `src/game-flow`, `src/ai`
  gameplay paths (AI uses seeded Mulberry32; VFX/audio/assets use
  seeded streams and are presentation-only).
- The entire per-tick gameplay influence of a player is one tiny value:
  `CarInput` = 5 analog axes + 3 booleans (`PhysicsTypes.ts:21`).
- The AI opponent is fed through the exact same seam as the player:
  `physics.setCarInput(OPPONENT_CAR_ID, aiInput)` — a remote human's
  inputs drop into the same call.
- `resetWorld({ carCreationOrder, kickoffVariantIndex })` is a fully
  deterministic world reset (used by every real kickoff) that restores
  boost/jump/dodge runtime state — a canonical shared starting point.

So the cheapest architecture that is also the *best-feeling* one at
this game's scale is: **peer-to-peer deterministic lockstep over a
WebRTC DataChannel, exchanging only inputs**, with a tiny serverless
control plane for room codes, matchmaking, and connection establishment.
No game server simulates anything; no state is streamed; per-player
bandwidth is ~4 KB/s. The spike (§2) proves the two critical
preconditions — cross-instance determinism and input-exchange sync over
a real RTCDataChannel — on this exact codebase.

## §2 Spike results (committed on this branch)

Three artifacts, all runnable today:

1. **`tests/unit/netspikeDeterminism.spec.ts`** (vitest, runs in the
   default suite): two completely independent `PhysicsFacade` instances
   run a canonical 3000-tick chaos script (driving, jumps, dodges,
   boost, aerials, powerslides on both cars) and must end
   **bit-identical** (exact JSON equality, not tolerance-based). An
   anti-vacuity test perturbs one input tick and requires divergence.
   Result: **PASS** on the standard build; final-state hash
   `d12dfc99`; measured step cost **0.198 ms/tick** (node).
2. **`vitest.netspike.config.ts`**: the same spec re-run with
   `@dimforge/rapier3d-compat` aliased to
   `@dimforge/rapier3d-deterministic-compat@0.19.3` (the vendor's
   cross-platform-deterministic build — same version, same API).
   Result: **PASS unmodified** (true drop-in), hash `d12dfc99`
   (identical to the standard build on this machine), step cost
   **0.193 ms/tick** — i.e. **no measurable performance penalty** in
   this scene. The golden hash is pinned in the spec: running it on any
   other machine is the cross-machine determinism verification. (The
   alias was canary-verified to actually take effect: pointing it at a
   nonexistent package fails resolution.)
3. **`tests/netspike/webrtc-lockstep.spec.ts`** (Playwright): two real
   browser pages, a real `RTCPeerConnection`/DataChannel between them
   (trickle ICE relayed through the test process — standing in for the
   production signaling Worker), each page generating only its own
   car's inputs and receiving the peer's over the wire, then both
   simulating the full 3000-tick match. Gates: both pages bit-identical
   to each other AND to the node-side hash (chromium-vs-node,
   same wasm binary, different JS engines). Result: **PASS** (4 s
   wall-clock) — the DataChannel connected on host candidates, both
   pages produced `d12dfc99`, matching node exactly. Every premise of
   the recommended architecture is now demonstrated on this codebase.

Two environment lessons already learned (baked into the spike, will
bite production if forgotten): non-trickle ICE ("wait for gathering
complete") hangs forever in sandboxed Chromium — production signaling
must be trickle; and mDNS candidate obfuscation breaks host-candidate
connectivity where no mDNS responder exists — irrelevant in production
(real STUN reflexive candidates) but required for CI.

**What the spike deliberately does not prove**: true cross-machine
determinism (one container = one machine). Mitigations: the vendor
guarantees it for the deterministic build; the pinned golden hash makes
any second machine a one-command verification; and N2's in-match desync
detector makes even a wrong guarantee fail safe (detected within ~1s,
match aborted gracefully) rather than silently.

## §3 Research findings

### 3.1 Rapier determinism (the load-bearing fact)

- The standard `@dimforge/rapier3d-compat` build is deterministic
  same-machine/same-binary only; the dedicated
  `@dimforge/rapier3d-deterministic-compat` build guarantees
  **cross-platform determinism** — same results on different machines,
  browsers, OSes (vendor docs: rapier.rs "Determinism"). It exists at
  the exact version this repo pins (0.19.3) and the spike proves it is
  a drop-in with no measurable perf cost here.
- Rapier also exposes `world.takeSnapshot()`/`World.restoreSnapshot()`
  (byte-exact world serialisation) — useful later for rollback or
  mid-match state audit, but NOT required for the recommended
  input-delay lockstep (which never restores state).
- Sources: <https://rapier.rs/docs/user_guides/javascript/determinism/>,
  npm `@dimforge/rapier3d-deterministic-compat`.

### 3.2 Transport: WebRTC DataChannel

- The only browser transport with unordered/unreliable delivery —
  mandatory for input streaming (a TCP-like ordered stream head-of-line
  blocks every later input behind one lost packet; WebSocket cannot
  shed this).
- Configuration: `{ ordered: false, maxRetransmits: 0 }` + app-level
  redundancy (each packet re-sends the last ~8 ticks of inputs, so any
  single packet's arrival fills all recent gaps — loss only matters if
  a whole redundancy window is lost, and then lockstep stalls briefly
  rather than desyncs).
- Requires a signaling channel (we own one anyway: the room's
  WebSocket), STUN for NAT traversal, TURN as relay-of-last-resort.

### 3.3 Control plane: Cloudflare Workers + Durable Objects (free plan)

- Free plan includes Durable Objects: **100k requests/day** and
  **313k GB-s/day** duration, with WebSocket hibernation (idle rooms
  cost nothing) and a 20:1 billing discount on incoming WS messages;
  outgoing WS messages are free.
- Sizing: signaling for one match ≈ a few dozen messages total
  (SDP + ICE candidates + lifecycle), matchmaking a handful more. Even
  1,000 matches/day ≈ low thousands of billed requests — ~2 orders of
  magnitude inside the free tier. The control plane is genuinely $0.
- Sources: <https://developers.cloudflare.com/durable-objects/platform/pricing>,
  <https://developers.cloudflare.com/workers/platform/pricing/>.

### 3.4 NAT traversal: Cloudflare STUN free, TURN ~free

- `stun.cloudflare.com` is **free and unlimited**.
- Cloudflare Realtime TURN: **1,000 GB/month free**, then $0.05/GB;
  credentials are minted server-side (our Worker). A fully-relayed
  match at our bandwidth (~4 KB/s/player each way ≈ 10–15 MB per
  5-minute match) means the free terabyte covers ~70,000 relayed
  matches/month — and TURN is only used for the minority of pairings
  where direct + STUN-reflexive paths both fail (typically ~10–20%).
  Effective cost at friend scale: $0.
- Sources: <https://developers.cloudflare.com/realtime/turn/faq/>,
  <https://developers.cloudflare.com/realtime/sfu/pricing>.

### 3.5 Codebase audit — multiplayer-relevant seams and hazards

Verified directly against the source on this branch:

- `CarInput` (8 fields) is the complete per-tick player influence;
  `CarControlProfile` (dodge deadzone, air-roll sensitivity) is a
  **sim-affecting per-car setting** — it must be exchanged once in the
  match handshake and applied to the owning car on BOTH peers (N5).
- `setCarState` restores pose/velocity but NOT boost/jump/dodge
  runtime state — irrelevant for input-delay lockstep (never restores),
  but it means **rollback would need a new snapshot API**
  (`world.takeSnapshot()` + facade runtime state); noted as a future
  enhancement, not in the critical path (§4.5).
- `MatchFlowController` is deterministic per tick given the same
  physics states (kickoff round-robin counter, goal blast, celebration
  timers are all tick-counted) — it can simply run identically on both
  peers. Its three MP hazards: the **F13 AI-stuck watchdog** teleports
  `OPPONENT_CAR_ID` (must be disabled when the opponent is human); the
  **pause gate** freezes the fixed tick (`isPaused()` early-return in
  `GameRuntime.onFixedTick`) which is impossible in MP (N5 replaces
  pause with a non-freezing menu + forfeit); and `update()` consumes
  local UI intents that must be either disabled or synchronized.
- The **release gate asserts zero external network requests**
  (`tests/release/release-gate.spec.ts`) — multiplayer traffic must be
  strictly opt-in (nothing fires until the player enters the ONLINE
  menu) so the gate survives with a carve-out only on the online flow
  (N8).
- The rAF loop stops in background tabs (browser throttling) — a
  backgrounded player stalls the match. N7 handles detection + UX (the
  same class of problem as a network stall, handled by the same
  machinery).

## §4 Architecture

### 4.1 Netcode model: deterministic lockstep with adaptive input delay

Chosen over the alternatives:

| Model | Verdict | Why |
|---|---|---|
| **P2P deterministic lockstep (input delay)** | **CHOSEN** | Determinism proven on this codebase; ~4 KB/s; zero server compute; no state restore needed; scales to 4 peers for 2v2; the only model that is simultaneously free AND faithful (both players see the exact same physics) |
| P2P rollback (GGPO-style) | Deferred enhancement | Best feel at high RTT, but needs a complete snapshot/restore API the facade lacks today. Measured budget says it's viable later (~40 resim ticks/8 ms frame); §4.5 keeps the door open |
| Client-server authoritative + prediction | Rejected | Requires a server simulating Rapier at 120Hz for every match — exceeds serverless free tiers immediately (313k GB-s/day ≈ a handful of concurrent sims), adds a relay hop to every input, and duplicates the physics in a second runtime |
| Host-authoritative P2P (one browser simulates, streams state) | Rejected | 20–50 KB/s state streaming, host advantage (guest plays on delayed state), host migration complexity, and still needs prediction code on the guest |

Mechanics (all in N2):

- Tick T's local input is sampled, quantized (§4.3), queued for
  transmission, and scheduled for local application at tick
  `T + delay` — both peers apply every car's input at the same tick.
- `delay` starts at 4 ticks (33 ms) and adapts to measured RTT/jitter
  within [2..10] ticks (17–83 ms), changed only at safe boundaries
  (kickoff resets) to avoid mid-play timeline warps.
- A peer may only advance to tick T when it holds the remote input for
  T; otherwise the sim **stalls** (renders a "connection" indicator
  past ~150 ms, N7). Redundant transmission makes stalls rare at
  realistic loss rates.
- **Desync detector**: every 60 ticks each peer sends
  `fnv1a(cars+ball+boostPads JSON)` for its newest simulated tick;
  mismatch at the same tick = desync → graceful abort UX (never a
  silently-diverged match). This is also the permanent in-production
  guard on the cross-machine determinism guarantee.
- Match clock: peers agree at handshake that "tick 0 = kickoff
  countdown start"; per-frame tick budget comes from the shared tick
  timeline, NOT local wall-clock (`FixedStepCoordinator.advance` gets a
  netcode-gated variant — the coordinator already exposes the seam).

### 4.2 Topology

```
Browser A ⇄ (WebRTC DataChannel: inputs, hashes, ping) ⇄ Browser B
    ⇅                                                       ⇅
    └────────── wss: Room Durable Object (Cloudflare) ──────┘
                 (signaling, lobby, presence — control only)
```

The Room WebSocket stays connected during the match as a low-rate
control channel (rematch, forfeit, clean leave) and as the signaling
path for ICE restarts on network changes.

### 4.3 Wire protocol (N2/N3)

- **Quantize-then-simulate**: analog axes are quantized to int8
  (steps of 1/127) at the *sampling* seam, and the quantized value is
  what BOTH the local sim uses and the wire carries — the two sims can
  never disagree about an input's exact float value. (The spike's 1/64
  quantization already validated quantized-input determinism.)
- Input frame: 5 axes × int8 + 1 button byte + tick varint ≈ 8 bytes.
- Packet: header (session id, newest tick, ack) + the last ~8 input
  frames (redundancy window) ≈ 80–100 bytes, sent every 2 ticks
  (60 packets/s) → ~5 KB/s upstream per player including overhead.
- Control messages (hashes, ping/pong, delay renegotiation) ride the
  same channel with a 1-byte type discriminator.

### 4.4 Control plane (N4) — one Worker, two Durable Object classes

- **RoomDO** (one instance per room code): issues 5-char codes
  (~33M combinations, unguessable at our scale + rate-limited);
  relays signaling between exactly two WebSockets; tracks lobby state
  (both ready → start handshake: app version check, deterministic-build
  hash check, `CarControlProfile` + cosmetics exchange, kickoff seed);
  hibernates when idle; self-destructs after inactivity TTL.
- **MatchmakingDO** (single instance): FIFO queue of waiting players;
  pairs the two oldest, creates a room, hands both the code. A queue
  entry dies with its WebSocket (no ghost entries).
- **TURN credential endpoint**: mints short-lived Cloudflare Realtime
  TURN credentials so keys never ship in the client bundle.
- Deployed with `wrangler`; local development and CI use
  `wrangler dev`/miniflare (free, offline).

### 4.5 Rollback: explicitly deferred, deliberately unblocked

Input-delay lockstep at ≤ 83 ms added delay is appropriate for this
game (fast but not twitch-aim). If real-world feel at high RTT
disappoints, the upgrade path is: snapshot API
(`world.takeSnapshot()` + facade runtime state, measured budget ~40
resim ticks per 8 ms frame) + predict-remote-input-as-repeat. Nothing
in N1–N7 hard-codes against it; the input buffer and tick timeline are
exactly what rollback needs too.

### 4.6 2v2-readiness constraints (binding on all workstreams)

- The sync core keys everything by `CarId`, never "the player/the
  opponent"; peer count is a session parameter.
- Tick confirmation = "have inputs from ALL remote cars" (max over
  peers), already the natural generalisation.
- RoomDO capacity is a constant (2 today); the handshake carries a car
  roster, not a hard-coded pair.
- Full-mesh WebRTC for 4 peers (6 links) is the accepted 2v2 topology;
  bandwidth stays trivial (~15 KB/s).

## §5 Workstreams

Ordering: N0 → N1 → N2 → N3/N4 (parallel) → N5 → N6 → N7 → N8. Each is
a commit point with test-first gates, in the style of the F-plan.

### N0 — Deterministic build swap + permanent determinism gates

1. Swap `package.json` dependency: `@dimforge/rapier3d-compat` →
   `@dimforge/rapier3d-deterministic-compat@0.19.3` (imports unchanged
   via a vite/vitest/tsconfig alias, or a global find-replace of the
   specifier — pick one, document in build-decisions).
2. Promote the netspike determinism spec to a permanent gate
   (rename `tests/unit/simDeterminism.spec.ts`), golden hash pinned;
   delete `vitest.netspike.config.ts` (no longer needed — the main
   config IS the deterministic build now).
3. Full regression sweep: every existing physics-numeric test must
   stay green — the spike measured bit-identical results on this
   machine so zero threshold drift is *expected*; if any test moves,
   that is a real cross-build difference to investigate, not re-pin.
4. Docs: `docs/physics-deviations.md` N0 section.

**Gates**: determinism spec green under the main config; full vitest +
Playwright sweeps green; verify-on-second-machine instruction recorded
(run the determinism spec anywhere else; hash must be `d12dfc99`).

### N1 — Sim/net seam refactor (pure refactor, zero behaviour change)

1. Introduce `CarInputSource` (`sampleForTick(tick): CarInput`) with
   three implementations: `LocalDeviceSource` (wraps today's
   `input.sampleGameplayInputForTick` + quantization from §4.3),
   `AiSource` (wraps `modules.ai.update`), `RemoteSource` (N2 feeds
   it; stub here).
2. `GameRuntime.onFixedTick` consumes a `Map<CarId, CarInputSource>`
   instead of the hard-coded player/AI branches; assembly of the map
   happens at match start (SP: local + AI — identical behaviour).
3. Extract a `TickAdvanceGate` seam on `FixedStepCoordinator.advance`
   (SP: always-open gate object; MP: lockstep confirmation, N2).
4. Make the F13 watchdog and AI construction conditional on "opponent
   is AI" (session parameter; always true in SP).
5. Quantization applied in `LocalDeviceSource` **now** (SP too) so SP
   and MP simulate identical input space — re-measure any input-feel
   tests (1/127 steps are below perceptibility; gates catch surprises).

**Gates**: the entire existing suite green unmodified EXCEPT tests
that reach into replaced internals (update mechanically, no threshold
changes); new unit tests for source-map assembly and quantization
round-trip (int8 → float → int8 identity).

### N2 — Lockstep core (pure TS, no real network)

New module `src/netcode/`: `LockstepSession` — per-car input buffers,
delay scheduling, tick confirmation, stall accounting, desync hasher,
`RemoteSource` implementation, packet encode/decode (§4.3), and a
`FakeLink` test double with configurable latency/jitter/loss/dup.

**Gates** (all vitest, the workhorse of the whole plan):
1. Two `PhysicsFacade`s + two `LockstepSession`s over `FakeLink` at
   {0ms, 50ms±10, 120ms±30, 3% loss, 10% loss+dup} run scripted 3000
   tick matches → bit-identical final states, zero desync flags, stall
   time bounded (measure, then pin with margin).
2. Encode/decode property tests (round-trip identity over the full
   quantized input space; malformed-packet rejection).
3. Desync detector: inject a single forged input on one side → detected
   within one hash interval, session enters `DESYNCED` terminal state.
4. Redundancy window: drop every packet carrying tick T except one →
   still confirms T (proves loss only stalls when a whole window dies).

### N3 — WebRTC transport (`PeerLink`)

`RTCPeerConnection` wrapper implementing the same link interface as
`FakeLink`: unordered/unreliable channel config, trickle-ICE via the
signaling client, keepalive + RTT/jitter estimation (feeding §4.1's
adaptive delay), ICE restart on `connectionstatechange` failures,
clean teardown. Config takes ICE servers (STUN always; TURN creds when
provided).

**Gates**: the netspike Playwright test evolves into the N3 E2E — two
pages, real DataChannel, but now running `LockstepSession` over
`PeerLink` in real time for a scripted stretch → hashes agree;
unit tests for reconnect/ICE-restart state machine against a mock RTC
API; the §2 environment lessons (trickle, mDNS flag) encoded in CI.

### N4 — Control plane (`backend/` wrangler project)

RoomDO + MatchmakingDO + TURN-cred endpoint per §4.4, with the
handshake protocol (version/build-hash/profile/cosmetics/kickoff-seed)
defined in a shared `src/netcode/protocol.ts` imported by both client
and Worker (one source of truth).

**Gates**: miniflare/`vitest-pool-workers` integration tests — create
room → join by code → signaling relayed both ways; queue pairs two
clients and both receive the same room; dead-socket queue eviction;
room TTL cleanup; version-mismatch handshake rejection; rate limits.
Free-tier arithmetic documented in `backend/README.md`.

### N5 — Online match flow

`MatchFlowController` online session mode: synchronized start (both
`READY` → agreed tick 0), goals/celebration/kickoffs replayed
identically from the shared timeline (they already are — gate it),
pause key opens a **non-freezing** overlay (sim continues; car gets
neutral input while menu focused) with FORFEIT + settings; disconnect
(peer link dead > grace) → result screen (win by abandonment);
rematch via RoomDO round-trip; `CarControlProfile`/cosmetics applied
from handshake to the correct cars on both peers; F13 watchdog off;
tournament/AI-difficulty UI paths unreachable in online mode.

**Gates**: vitest two-facade full-match simulations over `FakeLink`
through goals, kickoffs, overtime, forfeit, disconnect-mid-match;
state-hash agreement at every kickoff boundary; Playwright: full
two-page online match happy path (score a goal, see identical
scoreboard both sides).

### N6 — Lobby UI + matchmaking UX

Main menu: `ONLINE` → {QUICK MATCH, CREATE ROOM, JOIN ROOM}. Create
shows the code (click-to-copy + shareable URL `?room=CODE` deep link);
join = code entry; quick match = queue status + cancel; in-match
connection HUD (ping, quality dots, "reconnecting…" toast); error
surfaces (room full/expired, version mismatch, connection failed with
"likely NAT" hint). All screens follow R11 controller-nav conventions
(`data-menu-root`, `data-menu-back`, F9 focus visibility) and reuse
the retro-ui components.

**Gates**: Playwright against a **local** `wrangler dev` control plane
(no external network — keeps release-gate philosophy intact): create/
join/quick-match flows end-to-end into a live two-page match; deep-link
join; controller navigation + focus visibility on every new screen;
error-path rendering (kill the room mid-join).

### N7 — Resilience & feel under bad networks

Impairment harness: a test-only knob on `PeerLink` (and reusable
`FakeLink` profiles) injecting latency/jitter/loss/reorder/burst-gap;
adaptive-delay tuning against the matrix; stall UX (indicator ≥150 ms,
input-neutral hold, auto-abort after sustained outage ~10 s with
result-by-abandonment); background-tab detection (visibility API →
warn + same stall machinery); wall-clock catch-up bounded by
`MAX_CATCH_UP_STEPS` semantics extended to the shared timeline.

**Gates**: matrix runs (RTT 0/50/100/150 ms × jitter 0/±20/±40 ms ×
loss 0/2/5%) all finish scripted matches synced with pinned stall-time
ceilings; burst-outage (2 s dead air) recovers without desync;
backgrounded-peer simulation stalls then recovers; 10 s outage aborts
to the correct result on both sides.

### N8 — Release/integration pass

Config plumbing for the control-plane URL (env-driven, defaults to
same-origin `/api` in production, `wrangler dev` port locally);
**offline-first guarantee**: SP untouched with zero network calls until
the ONLINE menu is entered — release-gate's "no external requests" test
keeps passing for the SP flow, plus a new gate asserting no MP endpoint
is contacted before opt-in; full-suite sweeps both projects;
docs (`build-decisions.md` architecture entry, `backend/README.md`
deploy runbook, cost table refresh); screenshot QA of the lobby flows;
cross-machine determinism checklist executed once for real (two
physical machines, golden hash + a real internet match).

## §6 Infra runbook (one-time user actions, ~15 minutes)

1. Create a free Cloudflare account; `npm i -g wrangler && wrangler login`.
2. `cd backend && wrangler deploy` (Workers free plan; DO enabled by
   default on free since 2024-25 — the SQLite-backed classes we use).
3. Enable Cloudflare Realtime (TURN) in the dashboard → copy the TURN
   key id/secret into `wrangler secret put` (two secrets).
4. Set the deployed Worker URL in the game's production env
   (`VITE_MP_CONTROL_URL`) — or serve the SPA from the same Worker
   (Workers Assets, also free) so it's same-origin `/api`.
5. Optional custom domain: free on Cloudflare if the domain is there.

## §7 Cost table (at friend scale, and the ceiling)

| Component | Free allowance | Our usage @ ~100 matches/day | Cost |
|---|---|---|---|
| Workers requests | 100k/day | few thousand | $0 |
| Durable Objects (rooms, queue) | 100k req + 313k GB-s/day, WS hibernation | few thousand req, near-zero duration (hibernating rooms) | $0 |
| STUN (`stun.cloudflare.com`) | unlimited | all connection attempts | $0 |
| TURN (Cloudflare Realtime) | 1,000 GB/month | ~15 MB per *relayed* match × ~15% of matches ≈ &lt;1 GB/mo | $0 |
| Game traffic (P2P) | n/a — peer bandwidth | ~5 KB/s per player | $0 |
| **Total** | | | **$0/month** |

The realistic ceiling before any dollar is spent: ~10k matches/day
(Workers request cap) or ~65k fully-relayed matches/month (TURN) —
both absurd for this project. First paid step if ever needed: Workers
Paid, $5/month.

## §8 Explicit non-goals

Accounts/friends lists/presence, ranked/skill matchmaking, spectating,
online tournaments, >2 players (designed-for but not built), server
anti-cheat (P2P lockstep is input-authoritative; a determined cheater
can send impossible-looking-but-legal inputs — acceptable for
room-code friend play and casual quick match; documented so it's a
known trade, not a surprise), mobile touch controls, host migration
(no host exists).

## §9 Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cross-machine determinism fails despite vendor guarantee | Low | Pinned golden hash = one-command verification on any machine (N0); per-match handshake compares build hashes; in-match desync detector (N2) makes the failure mode "detected + graceful abort", never silent divergence; N8 checklist does one real cross-machine match before shipping |
| Strict NATs defeat STUN | Medium (~10–20% of pairings) | TURN relay minted per-match (§3.4), free at our scale |
| Input-delay feel at high RTT (>150 ms) | Medium for intercontinental pairs | Adaptive delay caps at 83 ms + honest connection-quality UI; rollback upgrade path kept open (§4.5) |
| Background-tab throttling stalls matches | Certain when it happens | Same machinery as network stalls + visibility warning (N7) |
| Free-tier terms drift | Low | Control plane is ~300 lines of portable DO code; §7 documents today's numbers with sources |
| Lockstep stall cascades on lossy links | Medium | 8-tick redundancy window (loss ⇒ stall only when an entire window dies, N2 gate 4), impairment matrix pins ceilings (N7) |

## Appendix A — Spike artifact inventory & results

| Artifact | What it proves | Result |
|---|---|---|
| `tests/unit/netspikeDeterminism.spec.ts` | Cross-instance bit-identical sim on the real facade; measures step cost; anti-vacuity | PASS (standard AND deterministic builds), hash `d12dfc99`, ~0.19–0.20 ms/tick, rollback budget ~40 ticks/8 ms |
| `vitest.netspike.config.ts` | `-deterministic` 0.19.3 build is a drop-in (alias canary-verified); golden hash pinned for cross-machine verification | PASS, no perf penalty measured |
| `tests/netspike/webrtc-lockstep.spec.ts` | Real RTCDataChannel between two pages; input-exchange lockstep to bit-identical state; chromium-vs-node hash agreement | PASS — both pages `d12dfc99`, equal to node; connected via trickle-ICE host candidates in ~4 s total |
| `tests/netspike/inputScript.ts` | Canonical chaos script + runner, one definition shared verbatim by node and browser | (harness) |
