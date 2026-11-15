import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";
import { loadRoomForMember } from "@/lib/roomAccess";
import { triggerRoomEvent } from "@/lib/pusher";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };

const schema = z.object({
  title: z.string().trim().min(1).max(40).optional(),
});

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await getUserFromRequest(request);
    const { code } = await params;
    const { room, role } = await loadRoomForMember(code, user._id.toString());
    if (role === "viewer" || (room.viewOnly && role !== "owner")) {
      throw new HttpError(403, "You cannot add pages in this room.");
    }

    const body = schema.parse(await readJson(request));
    if (room.pages.length >= 100) throw new HttpError(409, "A room can have at most 100 pages.");
    const order = room.pages.reduce((max, page) => Math.max(max, page.order), -1) + 1;
    const page = {
      pageId: randomUUID(),
      title: body.title ?? `Page ${order + 1}`,
      order,
      bookmarkedBy: [],
    };
    room.pages.push(page);
    await room.save();
    const responsePage = { pageId: page.pageId, title: page.title, order, bookmarked: false };
    await triggerRoomEvent(room.code, "page-added", responsePage);
    return json({ page: responsePage }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
