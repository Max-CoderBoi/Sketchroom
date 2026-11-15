import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";
import { loadRoomForMember } from "@/lib/roomAccess";
import { triggerRoomEvent } from "@/lib/pusher";
import Room from "@/models/Room";
import Stroke from "@/models/Stroke";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };

const strokeSchema = z.object({
  pageId: z.string().uuid(),
  strokeId: z.string().trim().min(1).max(100),
  part: z.number().int().min(0).max(10000),
  tool: z.enum(["pen", "highlighter", "line", "rect", "ellipse"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().finite().min(0).max(1),
  points: z.array(z.number().finite().min(0).max(1)).min(2).max(500)
    .refine((points) => points.length % 2 === 0, "Points must be x/y coordinate pairs."),
});

export async function GET(request: Request, { params }: Context) {
  try {
    const user = await getUserFromRequest(request);
    const { code } = await params;
    const { room } = await loadRoomForMember(code, user._id.toString());
    const url = new URL(request.url);
    const rawPageId = url.searchParams.get("pageId") ?? room.pages[0].pageId;
    const pageId = z.string().uuid().parse(rawPageId);
    if (!room.pages.some((page) => page.pageId === pageId)) throw new HttpError(404, "Page not found.");
    const afterSeqValue = url.searchParams.get("afterSeq") ?? "0";
    const limitValue = url.searchParams.get("limit") ?? "2000";
    if (!/^\d+$/.test(afterSeqValue) || !/^\d+$/.test(limitValue)) {
      throw new HttpError(400, "afterSeq and limit must be non-negative integers.");
    }
    const afterSeq = Number(afterSeqValue);
    const limit = Number(limitValue);
    if (!Number.isSafeInteger(afterSeq) || !Number.isSafeInteger(limit) || limit < 1) {
      throw new HttpError(400, "afterSeq must be safe and limit must be between 1 and 2000.");
    }
    if (room.pages[0].pageId === pageId) {
      await Stroke.updateMany(
        { roomId: room._id, pageId: { $exists: false } },
        { $set: { pageId } },
      );
    }
    const strokes = await Stroke.find({ roomId: room._id, pageId, seq: { $gt: afterSeq }, deleted: false })
      .sort({ seq: 1 }).limit(Math.min(limit, 2000)).lean();
    return json({ strokes });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await getUserFromRequest(request);
    const { code } = await params;
    const { room, role } = await loadRoomForMember(code, user._id.toString());
    if (role === "viewer") throw new HttpError(403, "Viewers cannot draw.");
    if (room.viewOnly && role !== "owner") throw new HttpError(403, "This room is in view-only mode.");
    const body = strokeSchema.parse(await readJson(request));
    if (!room.pages.some((page) => page.pageId === body.pageId)) throw new HttpError(404, "Page not found.");
    const eventPayload = {
      roomId: room._id.toString(),
      pageId: body.pageId,
      strokeId: body.strokeId,
      part: body.part,
      userId: user._id.toString(),
      tool: body.tool,
      color: body.color,
      width: body.width,
      points: body.points,
    };
    const maximumEvent = {
      id: "000000000000000000000000",
      ...eventPayload,
      seq: Number.MAX_SAFE_INTEGER,
    };
    if (Buffer.byteLength(JSON.stringify(maximumEvent), "utf8") > 8 * 1024) {
      throw new HttpError(413, "Stroke event payload must be no larger than 8 KB.");
    }

    const existing = await Stroke.findOne({
      roomId: room._id, strokeId: body.strokeId, part: body.part,
    });
    if (existing) return json({ stroke: existing, duplicate: true });

    const sequenceRoom = await Room.findOneAndUpdate(
      { _id: room._id },
      { $inc: { strokeSeq: 1 } },
      { new: true },
    );
    if (!sequenceRoom) throw new HttpError(404, "Room not found.");

    try {
      const stroke = await Stroke.create({
        ...body,
        roomId: room._id,
        userId: user._id,
        seq: sequenceRoom.strokeSeq,
      });
      await triggerRoomEvent(room.code, "stroke-added", {
        id: stroke._id.toString(),
        ...eventPayload,
        seq: stroke.seq,
      });
      return json({ stroke }, 201);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
        const duplicate = await Stroke.findOne({ roomId: room._id, strokeId: body.strokeId, part: body.part });
        if (duplicate) return json({ stroke: duplicate, duplicate: true });
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
