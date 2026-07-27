/**
 * N4 (plan/ONLINE_MULTIPLAYER_PLAN.md, §3.4): ICE server minting. STUN is
 * free and unlimited (`stun.cloudflare.com`); TURN credentials are minted
 * server-side from Cloudflare Realtime so the API token never ships in the
 * client bundle, short-lived, and only used by the minority of pairings
 * that direct + STUN-reflexive paths can't connect.
 *
 * No Cloudflare Worker types here (only the global `fetch`), so the
 * fallback logic is unit-testable in the normal vitest suite.
 */
export interface RTCIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface TurnEnv {
  TURN_KEY_ID?: string;
  TURN_API_TOKEN?: string;
}

export const STUN_ONLY: RTCIceServerLike[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

export async function mintIceServers(env: TurnEnv): Promise<RTCIceServerLike[]> {
  if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) {
    return STUN_ONLY;
  }
  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.TURN_API_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ ttl: 3600 })
      }
    );
    if (!response.ok) {
      return STUN_ONLY;
    }
    const data = (await response.json()) as { iceServers?: RTCIceServerLike | RTCIceServerLike[] };
    const turn = data.iceServers;
    if (!turn) {
      return STUN_ONLY;
    }
    return [...STUN_ONLY, ...(Array.isArray(turn) ? turn : [turn])];
  } catch {
    return STUN_ONLY;
  }
}
