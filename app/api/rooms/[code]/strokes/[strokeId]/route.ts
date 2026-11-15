import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, HttpError, json } from "@/lib/http";
import { loadRoomForMember } from "@/lib/roomAccess";
import { triggerRoomEvent } from "@/lib/pusher";
import Stroke from "@/models/Stroke";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string; strokeId: string }> };

export async function DELETE(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const user = await getUserFromRequest(request);
    const { code, strokeId } = await params;
    const { room, role } = await loadRoomForMember(code, user._id.toString());
    const strokes = await Stroke.find({ roomId: room._id, strokeId, deleted: false });
    if (strokes.length === 0) throw new HttpError(404, "Stroke not found.");
    if (role !== "owner" && strokes.some((stroke) => stroke.userId.toString() !== user._id.toString())) {
      throw new HttpError(403, "You can only remove your own strokes.");
    }
    await Stroke.updateMany({ roomId: room._id, strokeId }, { $set: { deleted: true } });
    await triggerRoomEvent(room.code, "stroke-removed", { strokeId });
    return json({ message: "Stroke removed." });
  } catch (error) {
    return errorResponse(error);
  }
}
