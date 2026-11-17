import { connectToDatabase } from "@/lib/db";
import { errorResponse, json } from "@/lib/http";
import Message from "@/models/Message";
import Room from "@/models/Room";
import Stroke from "@/models/Stroke";
import User from "@/models/User";

export const runtime = "nodejs";

export async function GET() {
  try {
    await connectToDatabase();
    const [users, boards, strokes, messages] = await Promise.all([
      User.countDocuments(),
      Room.countDocuments(),
      Stroke.countDocuments(),
      Message.countDocuments(),
    ]);

    return json({ users, boards, strokes, messages });
  } catch (error) {
    return errorResponse(error);
  }
}
