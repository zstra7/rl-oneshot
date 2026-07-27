# Online Polish Plan (P-series): smoother netcode, identity, pause votes, friction

Executor notes: this plan is written to be run workstream-by-workstream by a
Claude Sonnet session. Every design decision is already made — do not
re-litigate architecture; implement, run the gate, commit, push, move on.
Branch: `claude/online-multiplayer`. **No backend/Worker changes are needed
anywhere in this plan** (the control plane already relays handshake payloads
verbatim — verified in `backend/src/RoomCore.ts:155`).

## Current architecture (what you're building on)

Online play is **host-authoritative state-sync** (see the S-series commits):

- `src/netcode/StateSyncSession.ts` — tick-aligned input exchange (quantized,
  redundant, unreliable DataChannel), hold-last prediction (never stalls),
  host streams `StateSyncSnapshot` every 4 ticks, guest consumes newest.
- `src/core/GameRuntime.ts` `applyHostSnapshot()` — the guest REWINDS to the
  snapshot and REPLAYS buffered inputs to its present ("rewind+replay
  reconciliation"); if the gap exceeds `ONLINE_MAX_REPLAY_TICKS` it adopts the
  host's tick via `FixedStepCoordinator.setTickForOnlineSync`.
- `src/physics/PhysicsFacade.ts` `getWorldSnapshot()/applyWorldSnapshot()` —
  full mutable sim state (bodies + car runtime + pads + sensors).
- `src/game-flow/MatchFlowController.ts` — host runs the match; the guest is
  in `guestMode` (no local countdown/clock/goal detection) and mirrors
  `MatchAuthorityState` from each snapshot via `applyAuthorityState()`.
- `src/netcode/MultiplayerSession.ts` — lobby → PeerLink → session
  orchestration. Offerer = host = drives `car-player`. `match-start` carries
  `peers[]` with each peer's opaque handshake `payload` (currently `{}`).
- `src/stores/onlineStore.ts` — lobby UI state; builds the session with
  `handshakePayload: {}` today.
- `src/netcode/AdaptiveDelay.ts` — N7's RTT→input-delay policy. EXISTS BUT IS
  NOT WIRED to anything. `PacketType.Ping/Pong` exist in
  `src/netcode/protocol.ts`; the session answers pings but never sends them.

## Ground rules (apply to every workstream)

1. Single-player must be completely unaffected. `YOU`/`CPU` labels, pause
   freeze, AI, tournament — all SP behaviour is frozen. Online-only branches.
2. Never trust the remote peer. Every value that arrives from the other
   client (nickname, colors, votes) is validated/sanitized on receipt with
   safe fallbacks. A hostile payload must not crash or inject markup.
3. After each workstream: `npx vue-tsc --noEmit` clean → new tests pass →
   FULL `npx vitest run` green (422+ tests, no regressions) →
   `npm run validate` passes → commit with a descriptive message → push
   (`git push -u origin claude/online-multiplayer`).
4. Keep the pure-core/thin-adapter style: policy in testable pure modules,
   I/O at the edges. Match surrounding comment density and tone.
5. If a gate fails, fix forward within the workstream; do not disable tests.

---

## P1 — Netcode feel: adaptive delay, correction smoothing, rate alignment, slimmer snapshots

### P1.1 RTT measurement + adaptive input delay
- `StateSyncSession`: send `encodePingPacket(nonce)` every 30 ticks (drive it
  from a new `onTickHousekeeping(tick)` called by GameRuntime right where
  `prune(tick)` is called today — fold prune into it). Track in-flight nonce →
  timestamp; on Pong, update an EMA RTT (`alpha=0.2`) and jitter EMA
  (|sample−ema|). Expose `getRttMs(): number | null` and
  `getJitterMs(): number`.
- Make `inputDelayTicks` mutable inside the session (private field seeded
  from config). Add `maybeAdaptDelay(nowTick)`: at most once per 600 ticks
  (5s), compute `recommendDelayTicks(rtt, jitter)` from
  `src/netcode/AdaptiveDelay.ts`; apply only if it differs from the current
  delay by ≥2 ticks (hysteresis). Raising the delay is safe mid-stream (the
  submit loop just fills further ahead); lowering simply waits — under
  state-sync, delay is purely local timing, unlike lockstep, so no cross-peer
  coordination is needed.
- GameRuntime submit loop already reads `session.inputDelayTicks` each frame —
  no change needed there beyond calling the housekeeping hook.

**Gate P1.1** — new `tests/unit/adaptiveStateSync.spec.ts`:
- over a FakeLink with `latencyTicks: 12` (≈100ms one-way at the fake tick
  rate you advance), pings flow and `getRttMs()` converges to a positive
  value (assert `> 0` after N pumps/advances; FakeLink time is ticks, so
  fake the clock via injected `now()` — add an optional `now` fn to the
  session config, defaulting to `performance.now`).
- `maybeAdaptDelay` raises delay for large RTT (≥ recommendDelayTicks
  result) and holds (hysteresis) for a ±1-tick recommendation change.
- Existing `stateSyncSession.spec.ts` still green.

### P1.2 Correction smoothing (kill visual pops)
Reconciliation is positionally exact when inputs were known, but a
mispredicted remote input produces a small instantaneous visual jump at
apply time. Smooth it at the RENDER layer only (never touch sim state):
- In `GameRuntime.applyHostSnapshot()`: before applying, record each car's
  and the ball's current position (`physics.getCarState(...).position`,
  `getBallState().position`); after the apply+replay completes, compute the
  delta (old − new). Pass deltas to
  `PhysicsRenderBinding.addCorrectionOffset(carId | "ball", delta)`.
- `src/integration/PhysicsRenderBinding.ts`: keep a per-body offset vector;
  each `updateRenderFrame`, add the offset to the interpolated transform and
  decay it exponentially (half-life 50ms, i.e. `offset *= 0.5^(dt/0.05)`);
  clamp: if an incoming delta's magnitude exceeds 1.5m, ignore it (a real
  teleport — kickoff reset — must snap, not glide). Zero all offsets when
  `gameFlow.getMatchState()` is a kickoff/countdown state.

**Gate P1.2** — new `tests/unit/correctionSmoothing.spec.ts` (pure math is in
the binding; construct it with the real modules the existing binding tests
use — check `tests/unit` for an existing PhysicsRenderBinding spec pattern,
else test the decay/clamp policy by extracting it to a small pure helper
`src/integration/CorrectionOffset.ts` and unit-testing that):
- a 0.3m delta decays below 1cm within 300ms of simulated frames;
- a 2.0m delta is rejected (offset stays 0);
- offsets reset on kickoff.

### P1.3 Guest tick-rate alignment (bound the replay window)
Left alone, guest and host tick counters drift (independent rAF clocks), so
the replay window can grow over a long match. Nudge the guest's clock:
- In `applyHostSnapshot()` compute `lead = lastSimulated − snapshot.tick`;
  EMA it (`alpha=0.1`) on the online session context (store in GameRuntime,
  e.g. `onlineLeadEma`). Target lead = `clamp(rttTicks/2 + 2, 2, 12)` using
  `session.getRttMs()` (fallback 4 when null).
- In the frame loop (`GameRuntime.frame`), online-guest only: scale
  `frameDelta` by `1 + clamp((target − leadEma) * 0.004, −0.03, +0.03)`
  before `fixedStepCoordinator.advance`. (Guest runs ≤3% fast/slow until the
  lead converges — imperceptible.)

**Gate P1.3** — extend `tests/unit/fixedStepCoordinator.spec.ts` or a new
spec: pure function `computeRateScale(leadEma, targetLead)` (extract it to
`src/netcode/RateAlignment.ts`) returns 1.0 at target, >1 when behind
(lead < target), <1 when ahead, clamped to [0.97, 1.03]. Full suite green.

### P1.4 Slimmer snapshots
- In `encodeSnapshotPacket` (`src/netcode/protocol.ts`), serialize with a
  JSON replacer that rounds every number to 5 decimals
  (`Math.round(v*1e5)/1e5` — keep integers exact by checking
  `Number.isInteger` first). Replay corrects any sub-0.01mm loss; snapshots
  shrink meaningfully.

**Gate P1.4** — in `tests/unit/snapshotCodec.spec.ts`: add a test asserting a
real captured snapshot encodes to `< 4000` bytes and still round-trips
through `decodePacket` with every position within 1e-4 of the original.
`tests/unit/worldSnapshot.spec.ts` convergence tests still green.

---

## P2 — Identity & cosmetics: nicknames + the opponent's real car

### P2.1 Nickname setting + sanitizer
- New pure helper `src/netcode/Nickname.ts`:
  `sanitizeNickname(raw: unknown): string` — must be a string; trim; collapse
  runs of whitespace to one space; strip chars outside `[A-Za-z0-9 _-]`;
  max 12 chars; if empty after all that, return `"PLAYER"`.
- `src/stores/settingsStore.ts`: add persisted `online.nickname` (default
  `"PLAYER"`), following the existing persistence pattern in that store.
- `src/components/menu/OnlineLobby.vue` (home screen): a labelled text input
  bound to the store (sanitize on blur), `data-testid="online-nickname"`.

### P2.2 Handshake payload carries identity + cosmetics
- `src/stores/onlineStore.ts` `startSession()`: build
  `handshakePayload: { name, bodyColor, boostColor }` from settingsStore
  (nickname + the existing `car.bodyColor`/`car.boostColor`).
- New pure helper `src/netcode/PeerCosmetics.ts`:
  `parsePeerPayload(payload: unknown): { name: string; bodyColor: string | null; boostColor: string | null }`
  — sanitizeNickname for name; colors must match `/^#[0-9a-fA-F]{6}$/` else
  `null`. This is the ONLY way remote payload fields are ever read.

### P2.3 Per-car cosmetics application
- Extend the single-car override APIs to per-car (keep the old names as
  wrappers so nothing else changes):
  - assets module: `setCarColorOverride(carId, hex | null)` (existing
    `setPlayerCarColorOverride(hex)` delegates with `PLAYER_CAR_ID`). Find it
    via `grep -rn "setPlayerCarColorOverride" src/`.
  - `VfxModule`: `setCarBoostColor(carId, hex)` (existing
    `setPlayerBoostColor` delegates).
- `GameRuntime.startOnlineSession()`: after installing input sources, map
  `context.peers` by role (offerer → `PLAYER_CAR_ID`, answerer →
  `OPPONENT_CAR_ID`), `parsePeerPayload` each, then for BOTH cars: apply
  body color override (fallback: leave the default team tint when null) +
  `physicsRenderBinding.rebuildCarVisual(carId)` + boost color. Store
  `{ localName, remoteName }` on the runtime and expose
  `getOnlineNicknames(): { local: string; remote: string } | null`.
- `endOnlineSession()`: clear the OPPONENT car override + rebuild, restore
  the local player's own SP colors (they're in `settingsStore`), clear names.

### P2.4 HUD labels
- `src/components/hud/GameplayHud.vue` lines ~60-61: when online (read via
  `onlineStore` — add `localName`/`remoteName` there, set on `match-ready`
  from the same parsed payloads, cleared on close), show the two nicknames
  instead of `YOU`/`CPU`. IMPORTANT (from the S-series): the answerer's
  "own" score is `opponentScore` — the runtime already flips the score
  perspective in `sessionStateForLocalPlayer()`, and the HUD's left column
  is always "the local player". So: left label = local nickname, right =
  remote nickname, no score rewiring needed.
- `ResultsScreen.vue`: online branch shows "<WINNER-NICKNAME> WINS" (the
  perspective-flipped `winner` already means "player" = the local human).

**Gate P2** — new `tests/unit/onlineIdentity.spec.ts`:
- sanitizeNickname: trims/collapses/strips/caps at 12; `""`, `null`, 47-char
  emoji spam, `"<script>"` all come out safe (`"script"` etc. / `"PLAYER"`).
- parsePeerPayload: valid payload passes through; junk types, bad hex,
  oversized name → sanitized/null fallbacks; `payload: null` → all defaults.
- `multiplayerSession.spec.ts`: extend the existing match-ready test to send
  peers with payloads and assert they surface in `context.peers` untouched
  (transport is payload-agnostic; parsing happens at the runtime edge).
- Full suite + validate green. Manual check (optional but recommended):
  appendix repro script prints both nicknames from the HUD DOM.

---

## P3 — Online pause with vote-to-continue

Product behaviour (decided):
1. ESC/pause in an online match opens the pause OVERLAY for that player only;
   the sim keeps running (this is already true — do not regress it).
2. The overlay gains **REQUEST MATCH PAUSE**. When BOTH players have an
   active pause request, the HOST actually pauses the match for both.
3. While match-paused, the overlay shows **VOTE TO CONTINUE (n/2)**. When
   both have voted yes, the host resumes. Votes reset on every transition.
4. LEAVE MATCH still forfeits immediately (existing behaviour).

Implementation (decided):
- **Wire**: new `PacketType.Vote = 6` in `protocol.ts`: 2 bytes
  `[type, kind]`, kinds: `1 = pause-request`, `2 = continue-yes`,
  `3 = rematch-yes` (used by P4.3). Unreliable channel → the sender
  re-sends its active vote every 15 ticks for as long as it holds it (from
  the session housekeeping hook); votes are idempotent. Decode returns
  `{ type, kind }`; malformed → null.
- **State**: host-authoritative. `StateSyncSession` exposes
  `setLocalVote(kind, active)` and `getRemoteVote(kind): boolean` (remote
  vote considered active if seen within the last 60 ticks — track
  last-seen tick per kind). Add to `MatchAuthorityState`:
  `pauseRequests: number; continueVotes: number` (host fills from its own
  local vote + the guest's; guest mirrors for UI display only).
- **Host logic** (in `GameRuntime.driveOnlineSubmit`, host branch): if not
  paused and `localVote(pause) && remoteVote(pause)` → `gameFlow.pauseMatch()`
  + clear both pause votes. If paused and both continue-votes →
  `gameFlow.resumeMatch()` + clear votes.
- **Freeze semantics**: when `online && gameFlow.isPaused()`, install the
  advance gate `canAdvance: () => false` semantics — concretely: in
  `driveOnlineSubmit`, early-return before submitting inputs, and in the
  frame loop skip `fixedStepCoordinator.advance` when online-paused (the
  cleanest hook: `startOnlineSession` installs
  `setAdvanceGate({ canAdvance: () => !modules.gameFlow.isPaused() })`
  instead of `ALWAYS_ADVANCE`). Both peers' tick counters therefore freeze
  while paused; on resume the normal reconcile absorbs the few-tick skew.
- **Paused snapshots**: `onFixedTick` never runs while paused, so the host
  must keep the guest informed from the FRAME level: in `driveOnlineSubmit`,
  host + `isPaused()` → every ~10th frame send a snapshot
  (`tick: physics.getTick()`, current world, current authority state).
  Guest applies → mirrors PAUSED → freezes too; and the same channel
  carries the resume.
- **Guest UI + votes**: new facade methods on GameRuntime:
  `requestOnlinePause(active: boolean)`, `voteOnlineContinue(active: boolean)`
  → `session.setLocalVote(...)`. `PauseMenu.vue` online branch renders the
  request/vote buttons + `n/2` from the mirrored authority counts (read via
  the session-state event — add the two counts to `GameSessionState` ONLY if
  trivial; otherwise expose `getOnlineVoteCounts()` on the runtime and poll
  it in the HUD like other per-frame readouts).

**Gate P3** — new `tests/unit/onlineVotes.spec.ts` (FakeLink, host+guest
sessions):
- vote packets round-trip; `getRemoteVote` true while re-sent, decays to
  false ~60 ticks after the sender stops;
- malformed vote packet → dropped, no throw;
- host aggregation: helper (extract the pure decision into
  `src/netcode/VotePolicy.ts`: `shouldPause(localReq, remoteReq, isPaused)`,
  `shouldResume(localYes, remoteYes, isPaused)`) — unit-test all branches.
- `onlineMatchSync.spec.ts`-style integration: host pauses only when both
  request; guest mirrors PAUSED via authority state; both resume after both
  vote; scores/clock unchanged across the pause.
- Full suite + validate green. Live check (appendix): request pause in tab A
  only → game keeps running; request in both → both freeze; vote continue in
  both → play resumes.

---

## P4 — Friction: share links, connection health, rematch

### P4.1 Room share link
- On boot (`src/App.vue` or wherever the online store is first available —
  follow how the app initialises stores), parse `?room=XXXXX` (exactly 5
  chars from the room-code alphabet `[A-HJ-NP-Z2-9]` — see
  `MultiplayerSession.proposeCode`); if present: open the online panel and
  `joinRoom(code)` automatically; strip the param from the URL afterwards
  (`history.replaceState`).
- Room-ready screen (`OnlineLobby.vue`): next to the code, a **COPY LINK**
  button → `navigator.clipboard.writeText(location.origin + "/?room=" + code)`
  with a "copied" flash; wrap in try/catch (clipboard can be unavailable).

**Gate P4.1** — `tests/unit/roomLink.spec.ts`: extract
`parseRoomFromSearch(search: string): string | null` into
`src/netcode/RoomLink.ts`; test valid code, lowercase (normalize up), junk,
wrong length, missing param. Full suite green.

### P4.2 Connection health + auto-forfeit
- `StateSyncSession`: track `lastRemoteActivityMs` (any decoded packet).
  Expose `msSinceRemoteActivity(now?)`.
- GameRuntime online frame path: if in a live online match and
  `msSinceRemoteActivity() > 10_000` → the OTHER side abandoned:
  `gameFlow.endOnlineMatchByForfeit(localTeam)` where `localTeam` is
  "player" for the host and "opponent" for the guest (the LOCAL human wins;
  note `endOnlineMatchByForfeit(winner)` takes the winning TEAM in canonical
  terms — the guest's local team is "opponent"), then `endOnlineSession()`.
  Also treat a `disconnected`/`peer-connection-failed` MultiplayerSession
  event mid-match the same way (today it's ignored when `screen === "in-match"`
  — see `onlineStore.handleEvent` "disconnected" case).
- HUD: small ping readout in an online match (e.g. bottom corner of
  `GameplayHud.vue`): `session.getRttMs()` via a runtime getter, shown as
  `NN ms`; turns warning-coloured when `msSinceRemoteActivity() > 2000`
  (poll alongside the other HUD state; no new rAF loops).

**Gate P4.2** — extend `tests/unit/stateSyncSession.spec.ts`:
`msSinceRemoteActivity` grows with an injected clock and resets on any
received packet. Plus a `MatchFlowController` test: forfeit awards the given
team and lands in MATCH_RESULTS from a live online state. Full suite green.

### P4.3 Rematch votes
- Results screen (`ResultsScreen.vue`), online branch: **REMATCH (n/2)**
  button → vote kind 3 via `runtime.voteOnlineRematch(active)`. Host: when
  both rematch votes are active and state is MATCH_RESULTS →
  `gameFlow.startOnlineMatch({ durationMinutes: same, kickoffSeed: previousSeed + 1 })`
  (store the seed on the runtime's online context when the session starts) —
  the guest needs NO local call: its flow mirrors the authority transition
  back through countdown, and the world snapshot carries the reset. Votes
  clear on the transition. Add `rematchVotes` to `MatchAuthorityState` for
  the n/2 display.
- The DataChannel and session stay up across the rematch (nothing is torn
  down at MATCH_RESULTS — verify `onlineStore` doesn't close the session on
  results; if it does, stop doing that for online matches until LEAVE).

**Gate P4.3** — extend `tests/unit/onlineVotes.spec.ts`: rematch decision
policy (both votes + MATCH_RESULTS required); integration-style: after a
forfeit-free finished match between two synced peers, both vote rematch →
host restarts → guest mirrors countdown state and score resets to 0-0.
Full suite + validate green.

---

## Appendix A — live two-browser verification (run for P1, P3; recommended for P2)

Terminal 1: `cd backend && npx wrangler dev --port 8787`
Terminal 2: `VITE_MP_CONTROL_URL=ws://127.0.0.1:8787 npx vite --mode test --port 5199`
Then from the repo root (script must live in the repo root so
`@playwright/test` resolves; delete it before committing):

```js
// mp-check.local.mjs — node mp-check.local.mjs (PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium)
import { chromium } from "@playwright/test";
const LAUNCH = { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: [
  "--disable-features=WebRtcHideLocalIpsWithMdns,CalculateNativeWinOcclusion",
  "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding" ] };
async function boot(tag) { // TWO separate browsers — a background TAB throttles rAF and freezes the host
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5199/");
  await page.waitForFunction(() => window.__GAME_TEST__?.gameFlow?.ready() ?? false, null, { timeout: 20000 });
  return { page, browser, tag };
}
const A = await boot("A"), B = await boot("B");
for (const { page } of [A, B]) { await page.getByTestId("open-online").click(); await page.getByTestId("online-quick-match").click(); }
const state = (p) => p.evaluate(() => window.__GAME_TEST__?.gameFlow?.getMatchState?.());
for (let i = 0; i < 50 && !((await state(A.page)) === "PLAYING" && (await state(B.page)) === "PLAYING"); i++) await new Promise(r => setTimeout(r, 500));
console.log("both PLAYING — drive with page.keyboard.down('KeyW') etc., assert per workstream");
// P1: hold KeyW+wiggle on both for 30s; assert neither tab hits MATCH_RESULTS and both tabs'
//     car-player positions (window.__PHYSICS_TEST__.getCarState("car-player").position) agree within 1.0.
// P3: drive the pause/vote buttons by data-testid and assert freeze/resume via getWorldState().tick deltas.
await A.browser.close(); await B.browser.close();
```

Pass criteria P1: 30s of driving, no early match end, positions agree ≤1.0,
and (new) no visible-teleport deltas — sample `car-player` position each 100ms
on the guest and assert no single-step jump > 0.5 while state is PLAYING.

## Appendix B — invariants that must stay true

- SP flows (`npx vitest run`, all 422+ tests) stay green after every step.
- `npm run validate` (contracts, three.js skills, assets, architecture) green.
- Physics may not import game-flow; netcode may import physics/game-flow
  types; Vue components never import netcode directly (go through stores /
  runtime facade) — mirror existing import patterns; the architecture
  validator enforces the hard rules.
- The desync-forfeit path stays deleted: nothing may end an online match
  except the clock, a forfeit/leave, or P4.2's abandonment timeout.
- `MP_BUILD_HASH` (`src/stores/onlineStore.ts`) only changes if simulation
  behaviour changes. P1.4's wire rounding does NOT change simulation and
  must not touch it. (If a P-series change DOES alter sim behaviour — none
  should — both clients must redeploy together anyway; the hash gate exists
  to refuse mismatched builds, which state-sync tolerates better but the
  gate stays.)
