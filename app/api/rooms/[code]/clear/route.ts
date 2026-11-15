import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, json } from "@/lib/http";
import { loadRoomForMember, requireOwner } from "@/lib/roomAccess";
import { triggerRoomEvent } from "@/lib/pusher";
import Stroke from "@/models/Stroke";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const user = await getUserFromRequest(request);
    const { code } = await params;
    const { room, role } = await loadRoomForMember(code, user._id.toString());
    requireOwner(role);
    await Stroke.deleteMany({ roomId: room._id });
    await triggerRoomEvent(room.code, "board-cleared", {});
    return json({ message: "Board cleared." });
  } catch (error) {
    return errorResponse(error);
  }
}
