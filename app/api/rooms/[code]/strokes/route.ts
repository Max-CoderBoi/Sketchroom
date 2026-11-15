import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";
import { loadRoomForMember } from "@/lib/roomAccess";
import { triggerRoomEvent } from "@/lib/pusher";
import Stroke from "@/models/Stroke";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };

const strokeSchema = z.object({
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
    await connectToDatabase();
    const user = await getUserFromRequest(request);
    const { code } = await params;
    const { room } = await loadRoomForMember(code, user._id.toString());
    const url = new URL(request.url);
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
    const strokes = await Stroke.find({ roomId: room._id, seq: { $gt: afterSeq }, deleted: false })
      .sort({ seq: 1 }).limit(Math.min(limit, 2000)).lean();
    return json({ strokes });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    await connectToDatabase();
    const user = await getUserFromRequest(request);
    const { code } = await params;
    const { room, role } = await loadRoomForMember(code, user._id.toString());
    if (role === "viewer") throw new HttpError(403, "Viewers cannot draw.");
    if (room.viewOnly && role !== "owner") throw new HttpError(403, "This room is in view-only mode.");
    const body = strokeSchema.parse(await readJson(request));

    const existing = await Stroke.findOne({
      roomId: room._id, strokeId: body.strokeId, part: body.part,
    });
    if (existing) return json({ stroke: existing, duplicate: true });

    const sequenceRoom = await (await import("@/models/Room")).default.findOneAndUpdate(
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
        roomId: room._id.toString(),
        strokeId: stroke.strokeId,
        part: stroke.part,
        userId: user._id.toString(),
        tool: stroke.tool,
        color: stroke.color,
        width: stroke.width,
        points: stroke.points,
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
