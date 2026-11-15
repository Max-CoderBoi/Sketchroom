import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";
import { publicRoom } from "@/lib/roomAccess";
import { triggerRoomEvent } from "@/lib/pusher";
import Room from "@/models/Room";
import User from "@/models/User";

export const runtime = "nodejs";

const schema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/) });

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    const { code } = schema.parse(await readJson(request));
    const existingRoom = await Room.findOne({ code });
    if (!existingRoom) throw new HttpError(404, "Room not found.");

    let room = existingRoom;
    let joined = false;
    if (!existingRoom.members.some((member) => member.userId.toString() === user._id.toString())) {
      const joinedRoom = await Room.findOneAndUpdate(
        { _id: existingRoom._id, "members.userId": { $ne: user._id } },
        { $push: { members: { userId: user._id, role: "editor", joinedAt: new Date() } } },
        { new: true },
      );
      if (joinedRoom) {
        room = joinedRoom;
        joined = true;
      } else {
        const latestRoom = await Room.findById(existingRoom._id);
        if (!latestRoom) throw new HttpError(404, "Room not found.");
        if (!latestRoom.members.some((member) => member.userId.toString() === user._id.toString())) {
          throw new HttpError(409, "Room membership changed. Please try joining again.");
        }
        room = latestRoom;
      }
    }

    if (joined) {
      await triggerRoomEvent(code, "member-joined", {
        user: { id: user._id.toString(), name: user.name, color: user.color, role: "editor" },
      });
    }

    const memberUsers = await User.find({ _id: { $in: room.members.map((member) => member.userId) } })
      .select("name color");
    return json({
      room: {
        ...publicRoom(
          room,
          room.members.find((member) => member.userId.toString() === user._id.toString())?.role,
          user._id.toString(),
        ),
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
