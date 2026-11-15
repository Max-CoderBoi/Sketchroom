import { Types } from "mongoose";
import { HttpError } from "@/lib/http";
import Room, { type RoomDocument } from "@/models/Room";

export type RoomRole = "owner" | "editor" | "viewer";

export async function loadRoomForMember(code: string, userId: string) {
  const room = await Room.findOne({ code: code.toUpperCase() });
  if (!room) throw new HttpError(404, "Room not found.");
  const member = room.members.find((entry) => entry.userId.toString() === userId);
  if (!member) throw new HttpError(403, "You are not a member of this room.");
  return { room, role: member.role as RoomRole };
}

export function requireOwner(role: RoomRole) {
  if (role !== "owner") throw new HttpError(403, "Only the room owner can perform this action.");
}

export function memberId(value: string) {
  if (!Types.ObjectId.isValid(value)) throw new HttpError(400, "Invalid member identifier.");
  return new Types.ObjectId(value);
}

export function publicRoom(room: RoomDocument, role?: RoomRole) {
  return {
    id: room._id.toString(),
    code: room.code,
    title: room.title,
    ownerId: room.ownerId.toString(),
    members: room.members.map((member) => ({
      userId: member.userId.toString(),
      role: member.role,
      joinedAt: member.joinedAt,
    })),
    memberCount: room.members.length,
    viewOnly: room.viewOnly,
    strokeSeq: room.strokeSeq,
    thumbnail: room.thumbnail ?? null,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    ...(role ? { role } : {}),
  };
}
