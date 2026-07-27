import { chromium, expect, test, type Browser, type Page } from "@playwright/test";

import { fnv1a, makeInputScript, runCanonicalScript } from "./inputScript";

/**
 * Netcode spike gate 2 (plan/ONLINE_MULTIPLAYER_PLAN.md): the lockstep
 * loop end to end — two REAL browser pages, a REAL RTCPeerConnection +
 * DataChannel between them (host ICE candidates, no STUN/TURN — this is
 * the same-machine degenerate case of the production topology), each
 * page owning one car's input script, exchanging scripts over the wire,
 * then both independently simulating the full match script and
 * comparing final world states. Bit-identical hashes across the two
 * pages = "inputs over a datachannel are enough to keep two clients in
 * sync", which is the entire premise of deterministic lockstep netcode.
 *
 * The hashes are also asserted against the node-side vitest hash for
 * the same script (same machine, same wasm binary, different JS engine
 * embedding) — node-vs-browser agreement is the strongest cross-runtime
 * determinism evidence available from a single machine.
 *
 * Environment notes:
 * - Signaling is trickle-ICE relayed through Node (this test process),
 *   playing the role the production signaling Worker will play. Waiting
 *   for `iceGatheringState === "complete"` instead hangs forever in
 *   sandboxed/containerised Chromium, so non-trickle SDP is a trap.
 * - The browser is launched with mDNS candidate obfuscation disabled —
 *   there is no mDNS responder in a container, so `.local` candidates
 *   can never resolve and the host-candidate path silently dies.
 */
const SCRIPT_TICKS = 3000;
const PLAYER_SEED = 0xc0ffee;
const OPPONENT_SEED = 0xbeef01;
/** Produced by tests/unit/netspikeDeterminism.spec.ts on this machine (standard build — the one the app bundle ships). */
const NODE_SIDE_HASH = "d12dfc99";

/** Self-contained helper sources, shipped into the pages verbatim so both environments run literally the same code. */
const HELPER_SOURCES = {
  makeInputScript: makeInputScript.toString(),
  runCanonicalScript: runCanonicalScript.toString(),
  fnv1a: fnv1a.toString()
};

async function bootPaused(page: Page, baseURL: string): Promise<void> {
  await page.goto(baseURL);
  await expect
    .poll(() => page.evaluate(() => typeof window.__PHYSICS_TEST__ !== "undefined"), { timeout: 15_000 })
    .toBe(true);
  await page.evaluate(() => window.__PHYSICS_TEST__?.pauseRuntime());
}

/** Creates the page-side peer with trickle-ICE mailboxes Node can poll/deliver. */
async function setupPeer(page: Page, role: "offerer" | "answerer"): Promise<void> {
  await page.evaluate((role) => {
    const spike: Record<string, unknown> = {};
    (window as unknown as Record<string, unknown>)["__SPIKE__"] = spike;

    const pc = new RTCPeerConnection({ iceServers: [] });
    spike["pc"] = pc;
    spike["outCandidates"] = [] as string[];
    spike["channelOpen"] = false;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        (spike["outCandidates"] as string[]).push(JSON.stringify(event.candidate.toJSON()));
      }
    };

    const wireChannel = (channel: RTCDataChannel): void => {
      spike["channel"] = channel;
      spike["received"] = new Promise<string>((resolve) => {
        const chunks: string[] = [];
        channel.onmessage = (msg) => {
          if (msg.data === "__END__") {
            resolve(chunks.join(""));
          } else {
            chunks.push(msg.data as string);
          }
        };
      });
      const markOpen = (): void => {
        spike["channelOpen"] = true;
      };
      if (channel.readyState === "open") markOpen();
      else channel.onopen = markOpen;
    };

    if (role === "offerer") {
      wireChannel(pc.createDataChannel("lockstep"));
    } else {
      pc.ondatachannel = (event) => wireChannel(event.channel);
    }
  }, role);
}

test("two pages connect over a real RTCDataChannel, exchange input scripts, and simulate to bit-identical state", async ({
  baseURL
}) => {
  test.setTimeout(180_000);

  // Own launch (not the fixture browser): candidate gathering needs mDNS
  // obfuscation off inside a container — see the header comment.
  const executablePath = process.env["PLAYWRIGHT_CHROMIUM_PATH"];
  const browser: Browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ["--disable-features=WebRtcHideLocalIpsWithMdns"]
  });

  try {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await bootPaused(pageA, baseURL!);
    await bootPaused(pageB, baseURL!);

    await setupPeer(pageA, "offerer");
    await setupPeer(pageB, "answerer");

    // --- Offer/answer (no candidate waiting — candidates trickle below) ---
    const offerSdp = await pageA.evaluate(async () => {
      const spike = (window as unknown as Record<string, Record<string, unknown>>)["__SPIKE__"]!;
      const pc = spike["pc"] as RTCPeerConnection;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      return offer.sdp!;
    });
    const answerSdp = await pageB.evaluate(async (sdp) => {
      const spike = (window as unknown as Record<string, Record<string, unknown>>)["__SPIKE__"]!;
      const pc = spike["pc"] as RTCPeerConnection;
      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      return answer.sdp!;
    }, offerSdp);
    await pageA.evaluate(async (sdp) => {
      const spike = (window as unknown as Record<string, Record<string, unknown>>)["__SPIKE__"]!;
      await (spike["pc"] as RTCPeerConnection).setRemoteDescription({ type: "answer", sdp });
    }, answerSdp);

    // --- Trickle-ICE relay: Node ferries candidates both ways until open ---
    const drainCandidates = (page: Page): Promise<string[]> =>
      page.evaluate(() => {
        const spike = (window as unknown as Record<string, Record<string, unknown>>)["__SPIKE__"]!;
        const out = spike["outCandidates"] as string[];
        return out.splice(0, out.length);
      });
    const deliverCandidates = async (page: Page, candidates: string[]): Promise<void> => {
      if (candidates.length === 0) return;
      await page.evaluate(async (jsons) => {
        const spike = (window as unknown as Record<string, Record<string, unknown>>)["__SPIKE__"]!;
        const pc = spike["pc"] as RTCPeerConnection;
        for (const json of jsons) {
          await pc.addIceCandidate(JSON.parse(json) as RTCIceCandidateInit);
        }
      }, candidates);
    };
    const channelOpen = (page: Page): Promise<boolean> =>
      page.evaluate(() => {
        const spike = (window as unknown as Record<string, Record<string, unknown>>)["__SPIKE__"]!;
        return spike["channelOpen"] === true;
      });

    const connectDeadline = Date.now() + 30_000;
    while (Date.now() < connectDeadline) {
      await deliverCandidates(pageB, await drainCandidates(pageA));
      await deliverCandidates(pageA, await drainCandidates(pageB));
      if ((await channelOpen(pageA)) && (await channelOpen(pageB))) break;
      await pageA.waitForTimeout(100);
    }
    expect(await channelOpen(pageA), "offerer datachannel open").toBe(true);
    expect(await channelOpen(pageB), "answerer datachannel open").toBe(true);

    // --- Each page generates ITS OWN car's script and sends it to the peer ---
    const sendOwnScript = async (page: Page, seed: number): Promise<void> => {
      await page.evaluate(
        ({ sources, seed, ticks }) => {
          const makeScript = (0, eval)(`(${sources.makeInputScript})`) as (s: number, t: number) => unknown[];
          const spike = (window as unknown as Record<string, Record<string, unknown>>)["__SPIKE__"]!;
          const script = makeScript(seed, ticks);
          spike["ownScript"] = script;

          const channel = spike["channel"] as RTCDataChannel;
          const json = JSON.stringify(script);
          const CHUNK = 16_384;
          for (let i = 0; i < json.length; i += CHUNK) {
            channel.send(json.slice(i, i + CHUNK));
          }
          channel.send("__END__");
        },
        { sources: HELPER_SOURCES, seed, ticks: SCRIPT_TICKS }
      );
    };
    await sendOwnScript(pageA, PLAYER_SEED);
    await sendOwnScript(pageB, OPPONENT_SEED);

    // --- Both pages independently run the full canonical sim from local+remote scripts ---
    const runSide = (page: Page, side: "A" | "B"): Promise<string> =>
      page.evaluate(
        async ({ sources, side }) => {
          const run = (0, eval)(`(${sources.runCanonicalScript})`) as (
            api: unknown,
            player: unknown[],
            opponent: unknown[]
          ) => string;
          const hash = (0, eval)(`(${sources.fnv1a})`) as (s: string) => string;

          const spike = (window as unknown as Record<string, Record<string, unknown>>)["__SPIKE__"]!;
          const remoteJson = await (spike["received"] as Promise<string>);
          const remoteScript = JSON.parse(remoteJson) as unknown[];
          const ownScript = spike["ownScript"] as unknown[];

          // Page A owns the player car's inputs, page B the opponent's —
          // both sides must assemble the SAME (player, opponent) pair.
          const playerScript = side === "A" ? ownScript : remoteScript;
          const opponentScript = side === "A" ? remoteScript : ownScript;

          const finalJson = run(window.__PHYSICS_TEST__, playerScript, opponentScript);
          return hash(finalJson);
        },
        { sources: HELPER_SOURCES, side }
      );

    const [hashA, hashB] = await Promise.all([runSide(pageA, "A"), runSide(pageB, "B")]);

    // The core lockstep property: two peers, fed only each other's input
    // streams over the wire, are bit-identical.
    expect(hashA).toBe(hashB);

    // Cross-runtime check: chromium (this test) vs node (the vitest spike)
    // on the same machine and the same inlined wasm binary.
    expect(hashA).toBe(NODE_SIDE_HASH);
  } finally {
    await browser.close();
  }
});
