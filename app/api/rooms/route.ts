import { randomInt } from "node:crypto";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { errorResponse, json, readJson } from "@/lib/http";
import { publicRoom } from "@/lib/roomAccess";
import Room from "@/models/Room";

export const runtime = "nodejs";

const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const schema = z.object({
  title: z.string().trim().min(2).max(80),
  viewOnly: z.boolean().optional().default(false),
});

function createCode() {
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    const rooms = await Room.find({ "members.userId": user._id }).sort({ updatedAt: -1 }).limit(100);
    return json({ rooms: rooms.map((room) => {
      const membership = room.members.find((member) => member.userId.toString() === user._id.toString());
      return publicRoom(room, membership?.role, user._id.toString());
    }) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    const body = schema.parse(await readJson(request));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = createCode();
      if (await Room.exists({ code })) continue;
      const room = await Room.create({
        code,
        title: body.title,
        ownerId: user._id,
        members: [{ userId: user._id, role: "owner", joinedAt: new Date() }],
        pages: [{ pageId: randomUUID(), title: "Page 1", order: 0, bookmarkedBy: [] }],
        viewOnly: body.viewOnly,
      });
      return json({ room: publicRoom(room, "owner", user._id.toString()) }, 201);
    }
    throw new Error("Unable to allocate a unique room code.");
  } catch (error) {
    return errorResponse(error);
  }
}
