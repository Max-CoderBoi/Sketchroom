import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";
import { loadRoomForMember } from "@/lib/roomAccess";
import { triggerRoomEvent } from "@/lib/pusher";
import Stroke from "@/models/Stroke";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string; pageId: string }> };

const pageIdSchema = z.string().uuid();
const patchSchema = z.object({
  title: z.string().trim().min(1).max(40).optional(),
  bookmarked: z.boolean().optional(),
}).refine((value) => value.title !== undefined || value.bookmarked !== undefined);

function canEditPages(role: string, viewOnly: boolean) {
  return role !== "viewer" && (!viewOnly || role === "owner");
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await getUserFromRequest(request);
    const { code, pageId: rawPageId } = await params;
    const pageId = pageIdSchema.parse(rawPageId);
    const { room, role } = await loadRoomForMember(code, user._id.toString());
    const page = room.pages.find((entry) => entry.pageId === pageId);
    if (!page) throw new HttpError(404, "Page not found.");
    const body = patchSchema.parse(await readJson(request));

    if (body.title !== undefined) {
      if (!canEditPages(role, room.viewOnly)) throw new HttpError(403, "You cannot rename pages in this room.");
      page.title = body.title;
    }
    if (body.bookmarked !== undefined) {
      const alreadyBookmarked = page.bookmarkedBy.some((id) => id.equals(user._id));
      if (body.bookmarked && !alreadyBookmarked) page.bookmarkedBy.push(user._id);
      if (!body.bookmarked && alreadyBookmarked) {
        const bookmarkIndex = page.bookmarkedBy.findIndex((id) => id.equals(user._id));
        page.bookmarkedBy.splice(bookmarkIndex, 1);
      }
    }
    await room.save();
    const responsePage = {
      pageId: page.pageId,
      title: page.title,
      order: page.order,
      bookmarked: page.bookmarkedBy.some((id) => id.equals(user._id)),
    };
    await triggerRoomEvent(room.code, "page-updated", {
      pageId: page.pageId,
      title: page.title,
      order: page.order,
    });
    return json({ page: responsePage });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await getUserFromRequest(request);
    const { code, pageId: rawPageId } = await params;
    const pageId = pageIdSchema.parse(rawPageId);
    const { room, role } = await loadRoomForMember(code, user._id.toString());
    if (!canEditPages(role, room.viewOnly)) throw new HttpError(403, "You cannot delete pages in this room.");
    const page = room.pages.find((entry) => entry.pageId === pageId);
    if (!page) throw new HttpError(404, "Page not found.");
    if (room.pages.length === 1) throw new HttpError(409, "A room must keep at least one page.");

    const pageIndex = room.pages.findIndex((entry) => entry.pageId === pageId);
    const isFirstPage = pageIndex === 0;
    const strokeFilter = {
      roomId: room._id,
      $or: [
        { pageId },
        ...(isFirstPage ? [{ pageId: { $exists: false } }] : []),
      ],
    };
    await Stroke.deleteMany(strokeFilter);
    room.pages.splice(pageIndex, 1);
    room.pages
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((entry, order) => { entry.order = order; });
    await room.save();
    await triggerRoomEvent(room.code, "page-deleted", { pageId });
    return json({ message: "Page deleted." });
  } catch (error) {
    return errorResponse(error);
  }
}
