import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";
import { loadRoomForMember } from "@/lib/roomAccess";
import { authorizePresenceChannel } from "@/lib/pusher";

export const runtime = "nodejs";

const schema = z.object({
  socket_id: z.string().regex(/^\d+\.\d+$/),
  channel_name: z.string().regex(/^presence-room-[A-HJ-NP-Z2-9]{6}$/),
});

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const user = await getUserFromRequest(request);
    const body = schema.parse(await readJson(request));
    const code = body.channel_name.slice("presence-room-".length);
    const { role } = await loadRoomForMember(code, user._id.toString());
    try {
      return json(authorizePresenceChannel(body.socket_id, body.channel_name, {
        id: user._id.toString(),
        name: user.name,
        color: user.color,
        role,
      }));
    } catch (error) {
      console.error("Pusher presence authorization failed:", error);
      throw new HttpError(503, "Realtime service is unavailable.");
    }
  } catch (error) {
    return errorResponse(error);
  }
}
