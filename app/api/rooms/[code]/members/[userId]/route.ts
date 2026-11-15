import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";
import { loadRoomForMember, memberId, requireOwner } from "@/lib/roomAccess";
import { triggerRoomEvent } from "@/lib/pusher";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string; userId: string }> };
const roleSchema = z.object({ role: z.enum(["editor", "viewer"]) });

export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await getUserFromRequest(request);
    const { code, userId } = await params;
    const { room, role } = await loadRoomForMember(code, user._id.toString());
    requireOwner(role);
    const targetId = memberId(userId);
    if (targetId.equals(room.ownerId)) throw new HttpError(400, "The owner's role cannot be changed.");
    const target = room.members.find((member) => member.userId.equals(targetId));
    if (!target) throw new HttpError(404, "Room member not found.");
    const body = roleSchema.parse(await readJson(request));
    target.role = body.role;
    await room.save();
    await triggerRoomEvent(room.code, "member-role-changed", {
      userId: targetId.toString(),
      role: body.role,
    });
    return json({ message: "Member role updated.", userId: targetId.toString(), role: body.role });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await getUserFromRequest(request);
    const { code, userId } = await params;
    const { room, role } = await loadRoomForMember(code, user._id.toString());
    requireOwner(role);
    const targetId = memberId(userId);
    if (targetId.equals(room.ownerId)) throw new HttpError(400, "The room owner cannot be removed.");
    const target = room.members.find((member) => member.userId.equals(targetId));
    if (!target) throw new HttpError(404, "Room member not found.");
    room.members.pull({ userId: targetId });
    await room.save();
    await triggerRoomEvent(room.code, "member-kicked", { userId: targetId.toString() });
    return json({ message: "Member removed." });
  } catch (error) {
    return errorResponse(error);
  }
}
