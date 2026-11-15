import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, json, readJson } from "@/lib/http";
import { loadRoomForMember, publicRoom, requireOwner } from "@/lib/roomAccess";
import { triggerRoomEvent } from "@/lib/pusher";
import Message from "@/models/Message";
import Room from "@/models/Room";
import Stroke from "@/models/Stroke";
import User from "@/models/User";

export const runtime = "nodejs";

type Context = { params: Promise<{ code: string }> };
const patchSchema = z.object({
  title: z.string().trim().min(2).max(80).optional(),
  viewOnly: z.boolean().optional(),
}).refine((value) => value.title !== undefined || value.viewOnly !== undefined);

export async function GET(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const user = await getUserFromRequest(request);
    const { code } = await params;
    const { room, role } = await loadRoomForMember(code, user._id.toString());
    const users = await User.find({ _id: { $in: room.members.map((member) => member.userId) } })
      .select("name color");
    return json({
      room: {
        ...publicRoom(room, role),
        members: room.members.map((member) => {
          const memberUser = users.find((candidate) => candidate._id.equals(member.userId));
          return {
            userId: member.userId.toString(),
            name: memberUser?.name ?? "Unknown member",
            color: memberUser?.color ?? "#64748B",
            role: member.role,
            joinedAt: member.joinedAt,
          };
        }),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const user = await getUserFromRequest(request);
    const { code } = await params;
    const { room, role } = await loadRoomForMember(code, user._id.toString());
    requireOwner(role);
    const body = patchSchema.parse(await readJson(request));
    if (body.title !== undefined) room.title = body.title;
    if (body.viewOnly !== undefined) room.viewOnly = body.viewOnly;
    await room.save();
    const payload = { title: room.title, viewOnly: room.viewOnly };
    await triggerRoomEvent(room.code, "room-updated", payload);
    return json({ room: publicRoom(room, role) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const user = await getUserFromRequest(request);
    const { code } = await params;
    const { room, role } = await loadRoomForMember(code, user._id.toString());
    requireOwner(role);
    await triggerRoomEvent(room.code, "room-deleted", { code: room.code });
    await Promise.all([
      Stroke.deleteMany({ roomId: room._id }),
      Message.deleteMany({ roomId: room._id }),
      Room.deleteOne({ _id: room._id }),
    ]);
    return json({ message: "Room deleted." });
  } catch (error) {
    return errorResponse(error);
  }
}
