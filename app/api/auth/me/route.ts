import { getUserFromRequest } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const user = await getUserFromRequest(request);
    return json({ user: { id: user._id.toString(), name: user.name, email: user.email, color: user.color } });
  } catch (error) {
    return errorResponse(error);
  }
}
