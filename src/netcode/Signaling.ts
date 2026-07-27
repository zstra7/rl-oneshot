/**
 * N3 (plan/ONLINE_MULTIPLAYER_PLAN.md): the narrow signaling contract a
 * PeerLink needs to establish and repair a WebRTC connection. The real
 * implementation (N4) rides the room's WebSocket to the Cloudflare
 * RoomDO; `LoopbackSignaling` wires two peers together in-process for
 * unit tests and same-runtime E2E without any server.
 *
 * Signaling MUST be trickle — SDP and ICE candidates flow independently
 * and continuously — because waiting for ICE gathering to "complete"
 * before sending the offer/answer hangs indefinitely in sandboxed and
 * some real-world environments (a lesson the N-plan spike learned the
 * hard way, §2).
 */
export interface SignalingChannel {
  sendDescription(description: RTCSessionDescriptionInit): void;
  sendCandidate(candidate: RTCIceCandidateInit): void;
  onDescription(handler: (description: RTCSessionDescriptionInit) => void): void;
  onCandidate(handler: (candidate: RTCIceCandidateInit) => void): void;
  close(): void;
}

type DescriptionHandler = (description: RTCSessionDescriptionInit) => void;
type CandidateHandler = (candidate: RTCIceCandidateInit) => void;

class LoopbackEndpoint implements SignalingChannel {
  private descriptionHandler: DescriptionHandler | null = null;
  private candidateHandler: CandidateHandler | null = null;
  public peer: LoopbackEndpoint | null = null;
  private closed = false;

  public sendDescription(description: RTCSessionDescriptionInit): void {
    if (this.closed) {
      return;
    }
    // Deliver asynchronously, like a real signaling round trip, so a peer
    // that sets up its handlers right after constructing still receives it.
    queueMicrotask(() => this.peer?.descriptionHandler?.(description));
  }

  public sendCandidate(candidate: RTCIceCandidateInit): void {
    if (this.closed) {
      return;
    }
    queueMicrotask(() => this.peer?.candidateHandler?.(candidate));
  }

  public onDescription(handler: DescriptionHandler): void {
    this.descriptionHandler = handler;
  }

  public onCandidate(handler: CandidateHandler): void {
    this.candidateHandler = handler;
  }

  public close(): void {
    this.closed = true;
  }
}

/** A pair of in-process signaling channels wired to each other. */
export function createLoopbackSignaling(): { a: SignalingChannel; b: SignalingChannel } {
  const a = new LoopbackEndpoint();
  const b = new LoopbackEndpoint();
  a.peer = b;
  b.peer = a;
  return { a, b };
}
