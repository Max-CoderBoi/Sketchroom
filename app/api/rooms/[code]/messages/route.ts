import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";
import { loadRoomForMember } from "@/lib/roomAccess";
import { triggerRoomEvent } from "@/lib/pusher";
import Message from "@/models/Message";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };
const schema = z.object({ text: z.string().trim().min(1).max(500) });

export async function GET(request: Request, { params }: Context) {
  try {
    const user = await getUserFromRequest(request);
    const { code } = await params;
    const { room } = await loadRoomForMember(code, user._id.toString());
    const messages = await Message.find({ roomId: room._id }).sort({ createdAt: -1 }).limit(200).lean();
    return json({ messages: messages.reverse() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await getUserFromRequest(request);
    const { code } = await params;
    const { room } = await loadRoomForMember(code, user._id.toString());
    const body = schema.parse(await readJson(request));
    if (Buffer.byteLength(body.text, "utf8") > 2000) throw new HttpError(400, "Message is too large.");
    const message = await Message.create({
      roomId: room._id,
      userId: user._id,
      userName: user.name,
      text: body.text,
    });
    const payload = {
      id: message._id.toString(),
      roomId: room._id.toString(),
      userId: user._id.toString(),
      userName: message.userName,
      text: message.text,
      createdAt: message.createdAt,
    };
    await triggerRoomEvent(room.code, "chat-message", payload);
    return json({ message: payload }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
