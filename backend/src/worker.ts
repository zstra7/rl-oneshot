import { isValidRoomCode } from "../../src/netcode/lobbyProtocol";
import { mintIceServers, type TurnEnv } from "./turn";

export { RoomDO } from "./RoomDO";
export { MatchmakingDO } from "./MatchmakingDO";

/**
 * N4 (plan/ONLINE_MULTIPLAYER_PLAN.md, §4.4): the control-plane Worker.
 * Routes:
 *   GET /room?code=XXXXX[&create=1]  -> the RoomDO for that code (WS upgrade)
 *   GET /matchmaking                 -> the single global MatchmakingDO (WS upgrade)
 *   GET /turn-cred                   -> ICE servers (STUN always, TURN when configured)
 *
 * Everything stateful lives in Durable Objects; the Worker itself is a
 * stateless router. Free-tier sizing is in backend/README.md.
 */
export interface Env extends TurnEnv {
  ROOM: DurableObjectNamespace;
  MATCHMAKING: DurableObjectNamespace;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type"
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/room") {
      const code = url.searchParams.get("code");
      if (!code || !isValidRoomCode(code)) {
        return new Response("invalid room code", { status: 400 });
      }
      const id = env.ROOM.idFromName(code);
      return env.ROOM.get(id).fetch(request);
    }

    if (url.pathname === "/matchmaking") {
      const id = env.MATCHMAKING.idFromName("global");
      return env.MATCHMAKING.get(id).fetch(request);
    }

    if (url.pathname === "/turn-cred") {
      const iceServers = await mintIceServers(env);
      return new Response(JSON.stringify({ iceServers }), {
        headers: { "content-type": "application/json", ...CORS_HEADERS }
      });
    }

    return new Response("not found", { status: 404 });
  }
};
