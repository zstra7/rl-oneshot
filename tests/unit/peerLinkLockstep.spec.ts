import { describe, expect, it } from "vitest";

import { OPPONENT_CAR_ID, PLAYER_CAR_ID } from "@/game-flow/MatchFlowConstants";
import { DEFAULT_LOCKSTEP_CONFIG, LockstepSession } from "@/netcode/LockstepSession";
import { PeerLink } from "@/netcode/PeerLink";
import { fnv1a32 } from "@/netcode/protocol";
import { createLoopbackSignaling } from "@/netcode/Signaling";
import { PhysicsFacade } from "@/physics/PhysicsFacade";

import { makeInputScript } from "../netspike/inputScript";

/**
 * N3 integration: two real PeerLinks (over cross-wired mock RTCPeerConnections
 * whose data channels deliver to each other) fronting two real
 * LockstepSessions and two PhysicsFacades must reach bit-identical state —
 * proving PeerLink is a faithful NetLink for the lockstep core, i.e. the
 * whole client stack composes. (Impairment coverage lives in the FakeLink
 * matrix; the real browser DataChannel path in tests/netspike/webrtc-lockstep.)
 */

class LinkedChannel {
  public readyState: RTCDataChannelState = "open";
  public binaryType = "arraybuffer";
  public onopen: (() => void) | null = null;
  public onclose: (() => void) | null = null;
  public onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  public peer: LinkedChannel | null = null;

  public send(data: ArrayBufferView | ArrayBuffer): void {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data.slice(0)) : new Uint8Array(new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength));
    this.peer?.onmessage?.({ data: bytes.buffer as ArrayBuffer });
  }
  public close(): void {
    this.readyState = "closed";
  }
}

class LinkedPeerConnection {
  public connectionState: RTCPeerConnectionState = "connected";
  public onicecandidate: unknown = null;
  public onconnectionstatechange: (() => void) | null = null;
  public ondatachannel: ((event: { channel: LinkedChannel }) => void) | null = null;
  public channel: LinkedChannel | null = null;

  public createDataChannel(): LinkedChannel {
    this.channel = new LinkedChannel();
    return this.channel;
  }
  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "o" };
  }
  public async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: "a" };
  }
  public async setLocalDescription(): Promise<void> {}
  public async setRemoteDescription(): Promise<void> {}
  public async addIceCandidate(): Promise<void> {}
  public restartIce(): void {}
  public close(): void {
    this.connectionState = "closed";
  }
}

function worldHash(physics: PhysicsFacade): string {
  const w = physics.getWorldState();
  return String(fnv1a32(JSON.stringify({ cars: w.cars, ball: w.ball, boostPads: w.boostPads })));
}

describe("N3 PeerLink + LockstepSession compose", () => {
  it("two PeerLinks carry a real lockstep match to bit-identical state", async () => {
    const offererPc = new LinkedPeerConnection();
    const answererPc = new LinkedPeerConnection();
    const { a, b } = createLoopbackSignaling();

    const linkA = new PeerLink({ role: "offerer", signaling: a, createPeerConnection: () => offererPc as unknown as RTCPeerConnection });
    const linkB = new PeerLink({ role: "answerer", signaling: b, createPeerConnection: () => answererPc as unknown as RTCPeerConnection });

    // Wire the answerer's data channel to the offerer's created channel and
    // open both, then drive PeerLink's connected transition.
    const offererChannel = offererPc.channel!;
    const answererChannel = new LinkedChannel();
    offererChannel.peer = answererChannel;
    answererChannel.peer = offererChannel;
    answererPc.ondatachannel?.({ channel: answererChannel });
    offererChannel.onopen?.();
    answererChannel.onopen?.();
    offererPc.onconnectionstatechange?.();
    answererPc.onconnectionstatechange?.();
    expect(linkA.isConnected()).toBe(true);
    expect(linkB.isConnected()).toBe(true);

    const ticks = 400;
    const delay = DEFAULT_LOCKSTEP_CONFIG.inputDelayTicks;
    const playerScript = makeInputScript(0xc0ffee, ticks);
    const opponentScript = makeInputScript(0xbeef01, ticks);

    const boot = async (): Promise<PhysicsFacade> => {
      const p = new PhysicsFacade();
      await p.initialise();
      p.resetWorld({ carCreationOrder: [PLAYER_CAR_ID, OPPONENT_CAR_ID], kickoffVariantIndex: 0 });
      p.clearAllInputs();
      return p;
    };
    const physicsA = await boot();
    const physicsB = await boot();

    const sessA = new LockstepSession({ localCarId: PLAYER_CAR_ID, remoteCarId: OPPONENT_CAR_ID, link: linkA, inputDelayTicks: delay, redundancyWindow: 8, hashIntervalTicks: 60 });
    const sessB = new LockstepSession({ localCarId: OPPONENT_CAR_ID, remoteCarId: PLAYER_CAR_ID, link: linkB, inputDelayTicks: delay, redundancyWindow: 8, hashIntervalTicks: 60 });

    let simA = 0;
    let simB = 0;
    let sampleA = 0;
    let sampleB = 0;
    const lastTick = ticks - 1;

    const advance = (physics: PhysicsFacade, sess: LockstepSession, sim: number, local: string, remote: string): number => {
      let t = sim;
      while (t <= lastTick && sess.canSimulate(t)) {
        physics.setCarInput(local, sess.localInputForTick(t));
        physics.setCarInput(remote, sess.remoteInputForTick(t));
        physics.stepTicks(1);
        sess.recordSimulated(t, worldHash(physics));
        t += 1;
      }
      return t;
    };

    let guard = 0;
    while ((simA <= lastTick || simB <= lastTick) && guard < ticks * 10 + 1000) {
      while (sampleA <= simA + delay && sampleA <= lastTick) sessA.submitLocalInput(sampleA, playerScript[sampleA]!), (sampleA += 1);
      while (sampleB <= simB + delay && sampleB <= lastTick) sessB.submitLocalInput(sampleB, opponentScript[sampleB]!), (sampleB += 1);
      sessA.pump();
      sessB.pump();
      simA = advance(physicsA, sessA, simA, PLAYER_CAR_ID, OPPONENT_CAR_ID);
      simB = advance(physicsB, sessB, simB, OPPONENT_CAR_ID, PLAYER_CAR_ID);
      guard += 1;
    }

    expect(simA).toBe(ticks);
    expect(simB).toBe(ticks);
    expect(sessA.getStatus()).toBe("running");
    expect(sessB.getStatus()).toBe("running");
    expect(worldHash(physicsA)).toBe(worldHash(physicsB));

    physicsA.dispose();
    physicsB.dispose();
    linkA.close();
    linkB.close();
  }, 30_000);
});
