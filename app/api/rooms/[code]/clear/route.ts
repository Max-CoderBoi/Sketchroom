import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";
import { loadRoomForMember, requireOwner } from "@/lib/roomAccess";
import { triggerRoomEvent } from "@/lib/pusher";
import Stroke from "@/models/Stroke";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };
const schema = z.object({ pageId: z.string().uuid() });

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await getUserFromRequest(request);
    const { code } = await params;
    const { room, role } = await loadRoomForMember(code, user._id.toString());
    requireOwner(role);
    const { pageId } = schema.parse(await readJson(request));
    if (!room.pages.some((page) => page.pageId === pageId)) throw new HttpError(404, "Page not found.");
    await Stroke.deleteMany({ roomId: room._id, pageId });
    await triggerRoomEvent(room.code, "board-cleared", { pageId });
    return json({ message: "Board cleared." });
  } catch (error) {
    return errorResponse(error);
  }
}
