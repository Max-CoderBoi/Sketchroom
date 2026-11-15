import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
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
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const user = await getUserFromRequest(request);
    const rooms = await Room.find({ "members.userId": user._id }).sort({ updatedAt: -1 }).limit(100);
    return json({ rooms: rooms.map((room) => {
      const membership = room.members.find((member) => member.userId.toString() === user._id.toString());
      return publicRoom(room, membership?.role);
    }) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
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
        viewOnly: body.viewOnly,
      });
      return json({ room: publicRoom(room, "owner") }, 201);
    }
    throw new Error("Unable to allocate a unique room code.");
  } catch (error) {
    return errorResponse(error);
  }
}
