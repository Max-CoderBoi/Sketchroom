import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";
import { loadRoomForMember } from "@/lib/roomAccess";

export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };
const schema = z.object({
  image: z.string().regex(/^(?:data:image\/png;base64,)?[A-Za-z0-9+/]+={0,2}$/),
});

export async function PUT(request: Request, { params }: Context) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 140_000) throw new HttpError(413, "Thumbnail must be no larger than 100 KB.");
    await connectToDatabase();
    const user = await getUserFromRequest(request);
    const { code } = await params;
    const { room } = await loadRoomForMember(code, user._id.toString());
    const { image } = schema.parse(await readJson(request));
    const rawBase64 = image.replace(/^data:image\/png;base64,/, "");
    const bytes = Buffer.from(rawBase64, "base64");
    if (bytes.length > 100 * 1024) throw new HttpError(413, "Thumbnail must be no larger than 100 KB.");
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (bytes.length < 8 || !bytes.subarray(0, 8).equals(signature)) {
      throw new HttpError(400, "Thumbnail must be a valid PNG image.");
    }
    room.thumbnail = `data:image/png;base64,${bytes.toString("base64")}`;
    await room.save();
    return json({ message: "Thumbnail updated." });
  } catch (error) {
    return errorResponse(error);
  }
}
