import type { NetLink } from "@/netcode/protocol";
import type { SignalingChannel } from "@/netcode/Signaling";

/**
 * N3 (plan/ONLINE_MULTIPLAYER_PLAN.md): a real WebRTC DataChannel that
 * implements the exact same `NetLink` interface the lockstep core (N2)
 * was validated against over `FakeLink`. The channel is configured
 * unordered + unreliable (`maxRetransmits: 0`) because input streaming
 * must never head-of-line block behind a lost packet — the redundancy
 * window (N2) recovers loss, and a reliable/ordered channel would turn a
 * single drop into a stall of every later input.
 *
 * The `RTCPeerConnection` is created through an injectable factory so the
 * connection/reconnect state machine is unit-testable in node (where no
 * real WebRTC exists); production passes the default browser factory.
 */
export type PeerLinkState = "new" | "connecting" | "connected" | "reconnecting" | "failed" | "closed";

export interface PeerLinkConfig {
  readonly role: "offerer" | "answerer";
  readonly signaling: SignalingChannel;
  readonly iceServers?: RTCIceServer[];
  /** Injected in tests; defaults to the real browser `RTCPeerConnection`. */
  readonly createPeerConnection?: (config: RTCConfiguration) => RTCPeerConnection;
  readonly onStateChange?: (state: PeerLinkState) => void;
  /** Max automatic ICE-restart attempts before giving up as `failed`. */
  readonly maxIceRestarts?: number;
}

const DATA_CHANNEL_LABEL = "lockstep";
const DEFAULT_MAX_ICE_RESTARTS = 3;

export class PeerLink implements NetLink {
  private readonly pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private readonly inbox: Uint8Array[] = [];
  private readonly pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private state: PeerLinkState = "new";
  private iceRestarts = 0;
  private closed = false;

  public constructor(private readonly config: PeerLinkConfig) {
    const factory = config.createPeerConnection ?? ((c) => new RTCPeerConnection(c));
    this.pc = factory({ iceServers: config.iceServers ?? [] });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.config.signaling.sendCandidate(event.candidate.toJSON());
      }
    };
    this.pc.onconnectionstatechange = () => this.handleConnectionStateChange();

    if (config.role === "offerer") {
      this.channel = this.pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: false, maxRetransmits: 0 });
      this.wireChannel(this.channel);
    } else {
      this.pc.ondatachannel = (event) => {
        this.channel = event.channel;
        this.wireChannel(this.channel);
      };
    }

    config.signaling.onDescription((description) => void this.handleRemoteDescription(description));
    config.signaling.onCandidate((candidate) => void this.handleRemoteCandidate(candidate));
  }

  /** Begin negotiation. The offerer sends its offer; the answerer waits for one. */
  public async start(): Promise<void> {
    this.setState("connecting");
    if (this.config.role === "offerer") {
      await this.sendOffer(false);
    }
  }

  // --- NetLink ---

  public send(bytes: Uint8Array): void {
    if (this.channel && this.channel.readyState === "open") {
      // Copy: the caller may reuse its buffer, and send() is async under the hood.
      this.channel.send(bytes.slice());
    }
  }

  public receive(): Uint8Array[] {
    if (this.inbox.length === 0) {
      return [];
    }
    return this.inbox.splice(0, this.inbox.length);
  }

  // --- status / teardown ---

  public getState(): PeerLinkState {
    return this.state;
  }

  public isConnected(): boolean {
    return this.state === "connected";
  }

  /** Best-effort network RTT in milliseconds from the selected candidate pair, or null. */
  public async getRttMs(): Promise<number | null> {
    try {
      const stats = await this.pc.getStats();
      let rtt: number | null = null;
      stats.forEach((report) => {
        if (report.type === "candidate-pair" && (report as { nominated?: boolean }).nominated) {
          const value = (report as { currentRoundTripTime?: number }).currentRoundTripTime;
          if (typeof value === "number") {
            rtt = value * 1000;
          }
        }
      });
      return rtt;
    } catch {
      return null;
    }
  }

  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.channel?.close();
    this.pc.close();
    this.config.signaling.close();
    this.setState("closed");
  }

  // --- internals ---

  private wireChannel(channel: RTCDataChannel): void {
    channel.binaryType = "arraybuffer";
    channel.onopen = () => this.handleConnectionStateChange();
    channel.onclose = () => this.handleConnectionStateChange();
    channel.onmessage = (event) => {
      const data = event.data;
      if (data instanceof ArrayBuffer) {
        this.inbox.push(new Uint8Array(data));
      } else if (ArrayBuffer.isView(data)) {
        this.inbox.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      }
    };
  }

  private async sendOffer(iceRestart: boolean): Promise<void> {
    const offer = await this.pc.createOffer(iceRestart ? { iceRestart: true } : {});
    await this.pc.setLocalDescription(offer);
    this.config.signaling.sendDescription(offer);
  }

  private async handleRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    if (this.closed) {
      return;
    }
    await this.pc.setRemoteDescription(description);
    this.remoteDescriptionSet = true;
    await this.flushPendingCandidates();

    if (description.type === "offer") {
      // Answerer (or offerer receiving an ICE-restart offer): answer it.
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.config.signaling.sendDescription(answer);
    }
  }

  private async handleRemoteCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.closed) {
      return;
    }
    if (!this.remoteDescriptionSet) {
      // addIceCandidate throws before the remote description is set — buffer.
      this.pendingRemoteCandidates.push(candidate);
      return;
    }
    await this.pc.addIceCandidate(candidate);
  }

  private async flushPendingCandidates(): Promise<void> {
    const pending = this.pendingRemoteCandidates.splice(0, this.pendingRemoteCandidates.length);
    for (const candidate of pending) {
      await this.pc.addIceCandidate(candidate);
    }
  }

  private handleConnectionStateChange(): void {
    if (this.closed) {
      return;
    }
    const pcState = this.pc.connectionState;
    const channelOpen = this.channel?.readyState === "open";

    if (pcState === "connected" && channelOpen) {
      this.iceRestarts = 0;
      this.setState("connected");
    } else if (pcState === "failed" || pcState === "disconnected") {
      this.attemptIceRestart();
    } else if (pcState === "closed") {
      this.setState("closed");
    } else {
      this.setState(this.state === "connected" ? "reconnecting" : "connecting");
    }
  }

  private attemptIceRestart(): void {
    if (this.iceRestarts >= (this.config.maxIceRestarts ?? DEFAULT_MAX_ICE_RESTARTS)) {
      this.setState("failed");
      return;
    }
    this.iceRestarts += 1;
    this.setState("reconnecting");
    // Only the offerer renegotiates; the answerer recovers when the new
    // offer arrives. restartIce() also nudges the browser to gather fresh
    // candidates on both ends.
    this.pc.restartIce?.();
    if (this.config.role === "offerer") {
      void this.sendOffer(true);
    }
  }

  private setState(next: PeerLinkState): void {
    if (this.state === next || this.state === "closed") {
      return;
    }
    this.state = next;
    this.config.onStateChange?.(next);
  }
}
