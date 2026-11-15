import { getUserFromRequest } from "@/lib/auth";
import { errorResponse, HttpError, json } from "@/lib/http";
import { loadRoomForMember } from "@/lib/roomAccess";
import { triggerRoomEvent } from "@/lib/pusher";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await getUserFromRequest(request);
    const { code } = await params;
    const { room, role } = await loadRoomForMember(code, user._id.toString());
    if (role === "owner") throw new HttpError(409, "The owner cannot leave. Delete the room or transfer ownership first.");
    room.members.pull({ userId: user._id });
    await room.save();
    await triggerRoomEvent(room.code, "member-kicked", { userId: user._id.toString() });
    return json({ message: "You left the room." });
  } catch (error) {
    return errorResponse(error);
  }
}
