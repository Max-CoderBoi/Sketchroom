import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";
import { loadRoomForMember, publicRoom } from "@/lib/roomAccess";
import { triggerRoomEvent } from "@/lib/pusher";
import Room from "@/models/Room";
import User from "@/models/User";

export const runtime = "nodejs";

const schema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/) });

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const user = await getUserFromRequest(request);
    const { code } = schema.parse(await readJson(request));
    let room = await Room.findOne({ code });
    if (!room) throw new HttpError(404, "Room not found.");

    if (!room.members.some((member) => member.userId.toString() === user._id.toString())) {
      room.members.push({ userId: user._id, role: "editor", joinedAt: new Date() });
      await room.save();
      await triggerRoomEvent(code, "member-joined", {
        user: { id: user._id.toString(), name: user.name, color: user.color, role: "editor" },
      });
    } else {
      const membership = await loadRoomForMember(code, user._id.toString());
      room = membership.room;
    }

    const memberUsers = await User.find({ _id: { $in: room.members.map((member) => member.userId) } })
      .select("name color");
    return json({
      room: {
        ...publicRoom(room, room.members.find((member) => member.userId.toString() === user._id.toString())?.role),
        members: room.members.map((member) => {
          const memberUser = memberUsers.find((candidate) => candidate._id.equals(member.userId));
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
