import { describe, expect, it, vi } from "vitest";

import { PeerLink, type PeerLinkState } from "@/netcode/PeerLink";
import { createLoopbackSignaling } from "@/netcode/Signaling";

/**
 * N3 (plan/ONLINE_MULTIPLAYER_PLAN.md): PeerLink is a real WebRTC
 * DataChannel behind the NetLink interface. No WebRTC exists in node, so
 * the connection/reconnect state machine is tested against a controllable
 * mock RTCPeerConnection injected via the factory. The real browser path
 * is covered by the two-page E2E (tests/netspike/webrtc-lockstep).
 */

class MockDataChannel {
  public readyState: RTCDataChannelState = "connecting";
  public binaryType = "blob";
  public onopen: (() => void) | null = null;
  public onclose: (() => void) | null = null;
  public onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  public readonly sent: Uint8Array[] = [];

  public constructor(
    public readonly label: string,
    public readonly options?: RTCDataChannelInit
  ) {}

  public send(data: ArrayBuffer | ArrayBufferView): void {
    const view =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
    this.sent.push(new Uint8Array(view));
  }
  public close(): void {
    this.readyState = "closed";
    this.onclose?.();
  }
  public _open(): void {
    this.readyState = "open";
    this.onopen?.();
  }
  public _deliver(bytes: Uint8Array): void {
    const copy = new Uint8Array(bytes);
    this.onmessage?.({ data: copy.buffer as ArrayBuffer });
  }
}

class MockPeerConnection {
  public connectionState: RTCPeerConnectionState = "new";
  public onicecandidate: ((event: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void) | null = null;
  public onconnectionstatechange: (() => void) | null = null;
  public ondatachannel: ((event: { channel: MockDataChannel }) => void) | null = null;

  public localDescription: RTCSessionDescriptionInit | null = null;
  public remoteDescription: RTCSessionDescriptionInit | null = null;
  public readonly addedCandidates: RTCIceCandidateInit[] = [];
  public createdChannel: MockDataChannel | null = null;
  public restartIceCalls = 0;
  public lastCreateOfferOptions: RTCOfferOptions | undefined;

  public createDataChannel(label: string, options?: RTCDataChannelInit): MockDataChannel {
    this.createdChannel = new MockDataChannel(label, options);
    return this.createdChannel;
  }
  public async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    this.lastCreateOfferOptions = options;
    return { type: "offer", sdp: "mock-offer" };
  }
  public async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: "mock-answer" };
  }
  public async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc;
  }
  public async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc;
  }
  public async addIceCandidate(cand: RTCIceCandidateInit): Promise<void> {
    this.addedCandidates.push(cand);
  }
  public restartIce(): void {
    this.restartIceCalls += 1;
  }
  public async getStats(): Promise<Map<string, unknown>> {
    return new Map([["cp", { type: "candidate-pair", nominated: true, currentRoundTripTime: 0.042 }]]);
  }
  public close(): void {
    this.connectionState = "closed";
  }
  public _setConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

function makeLink(role: "offerer" | "answerer") {
  const { a } = createLoopbackSignaling();
  const pc = new MockPeerConnection();
  const states: PeerLinkState[] = [];
  const link = new PeerLink({
    role,
    signaling: a,
    createPeerConnection: () => pc as unknown as RTCPeerConnection,
    onStateChange: (s) => states.push(s)
  });
  return { link, pc, states };
}

describe("N3 PeerLink", () => {
  it("the offerer opens an unordered, unreliable data channel", () => {
    const { pc } = makeLink("offerer");
    expect(pc.createdChannel?.label).toBe("lockstep");
    expect(pc.createdChannel?.options).toEqual({ ordered: false, maxRetransmits: 0 });
  });

  it("queues inbound messages and drains them via receive()", () => {
    const { link, pc } = makeLink("offerer");
    const channel = pc.createdChannel!;
    channel._open();
    channel._deliver(new Uint8Array([1, 2, 3]));
    channel._deliver(new Uint8Array([4, 5]));

    const drained = link.receive();
    expect(drained.map((b) => [...b])).toEqual([[1, 2, 3], [4, 5]]);
    expect(link.receive()).toEqual([]); // drained
  });

  it("only sends over an open channel", () => {
    const { link, pc } = makeLink("offerer");
    const channel = pc.createdChannel!;
    link.send(new Uint8Array([9])); // channel still connecting
    expect(channel.sent).toHaveLength(0);
    channel._open();
    link.send(new Uint8Array([9]));
    expect(channel.sent.map((b) => [...b])).toEqual([[9]]);
  });

  it("forwards locally-gathered ICE candidates to signaling", () => {
    const { pc } = makeLink("offerer");
    const sent: RTCIceCandidateInit[] = [];
    // Re-wire signaling capture via a fresh link so we can observe sends.
    const { a } = createLoopbackSignaling();
    a.sendCandidate = (c) => sent.push(c);
    const link = new PeerLink({ role: "offerer", signaling: a, createPeerConnection: () => pc as unknown as RTCPeerConnection });
    void link;
    pc.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: "cand:1" }) } });
    expect(sent).toEqual([{ candidate: "cand:1" }]);
  });

  it("reaches 'connected' only when the PC is connected AND the channel is open", async () => {
    const { link, pc } = makeLink("offerer");
    await link.start();
    pc._setConnectionState("connected");
    expect(link.getState()).not.toBe("connected"); // channel not open yet
    pc.createdChannel!._open();
    expect(link.getState()).toBe("connected");
  });

  it("completes an offer/answer handshake over loopback signaling", async () => {
    const { a, b } = createLoopbackSignaling();
    const offererPc = new MockPeerConnection();
    const answererPc = new MockPeerConnection();
    const offerer = new PeerLink({ role: "offerer", signaling: a, createPeerConnection: () => offererPc as unknown as RTCPeerConnection });
    const answerer = new PeerLink({ role: "answerer", signaling: b, createPeerConnection: () => answererPc as unknown as RTCPeerConnection });
    void offerer;
    void answerer;

    await offerer.start();
    // Let the microtask-based loopback deliver offer -> answer -> back.
    await new Promise((r) => setTimeout(r, 0));

    expect(answererPc.remoteDescription).toEqual({ type: "offer", sdp: "mock-offer" });
    expect(offererPc.remoteDescription).toEqual({ type: "answer", sdp: "mock-answer" });
  });

  it("buffers remote candidates that arrive before the remote description, then flushes them", async () => {
    const { a, b } = createLoopbackSignaling();
    const pc = new MockPeerConnection();
    const answerer = new PeerLink({ role: "answerer", signaling: b, createPeerConnection: () => pc as unknown as RTCPeerConnection });
    void answerer;

    // Candidate first (no remote description yet): must be buffered, not applied.
    a.sendCandidate({ candidate: "early" });
    await new Promise((r) => setTimeout(r, 0));
    expect(pc.addedCandidates).toHaveLength(0);

    // Now the offer arrives; the buffered candidate flushes after it's set.
    a.sendDescription({ type: "offer", sdp: "mock-offer" });
    await new Promise((r) => setTimeout(r, 0));
    expect(pc.addedCandidates).toEqual([{ candidate: "early" }]);
  });

  it("attempts an ICE restart on failure and gives up as 'failed' after the cap", async () => {
    const { link, pc } = makeLink("offerer");
    await link.start();
    for (let i = 0; i < 5; i += 1) {
      pc._setConnectionState("failed");
    }
    // Capped at 3 restarts, then failed.
    expect(pc.restartIceCalls).toBe(3);
    expect(link.getState()).toBe("failed");
  });

  it("re-offers with iceRestart when the offerer recovers from a transient failure", async () => {
    const { link, pc } = makeLink("offerer");
    await link.start();
    pc._setConnectionState("disconnected");
    expect(pc.restartIceCalls).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(pc.lastCreateOfferOptions).toEqual({ iceRestart: true });
    expect(link.getState()).toBe("reconnecting");
  });

  it("reports RTT in milliseconds from the nominated candidate pair", async () => {
    const { link } = makeLink("offerer");
    expect(await link.getRttMs()).toBeCloseTo(42, 5);
  });

  it("close() tears down the channel, peer connection, and signaling", () => {
    const { link, pc } = makeLink("offerer");
    const closeSpy = vi.spyOn(pc, "close");
    link.close();
    expect(closeSpy).toHaveBeenCalled();
    expect(link.getState()).toBe("closed");
    // Idempotent.
    link.close();
  });
});
